'use strict';

// Kad Kahwin — digital wedding card server.
// No npm dependencies: plain node:http, a JSON file for storage, and an
// uploads folder. Run with `node server.js`.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const defaults = require('./lib/defaults');
const { buildXlsx } = require('./lib/xlsx');

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const DEFAULT_PASSWORD = 'admin123';
const SESSION_DAYS = 7;
const MAX_JSON = 512 * 1024;
const MAX_UPLOAD = 5 * 1024 * 1024;
const MAX_AUDIO = 20 * 1024 * 1024;
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------- storage

function clean(input, tpl, p = '') {
  if (Array.isArray(tpl)) {
    const item = defaults.listItems[p];
    if (!Array.isArray(input) || !item) return tpl;
    return input.slice(0, 50).map((x) => clean(x, item, p + '[]'));
  }
  if (tpl && typeof tpl === 'object') {
    const src = input && typeof input === 'object' ? input : {};
    const out = {};
    for (const k of Object.keys(tpl)) out[k] = clean(src[k], tpl[k], p ? `${p}.${k}` : k);
    return out;
  }
  if (input === undefined || input === null) return tpl;
  if (typeof tpl === 'string') return String(input).slice(0, 4000);
  if (typeof tpl === 'number') {
    const n = Number(input);
    return Number.isFinite(n) ? n : tpl;
  }
  if (typeof tpl === 'boolean') return input === true || input === 'true';
  return tpl;
}

const newId = () => crypto.randomBytes(8).toString('hex');

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function loadDb() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  let raw = null;
  if (fs.existsSync(DB_FILE)) raw = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  const d = {
    config: clean(raw && raw.config, defaults.config),
    rsvps: (raw && raw.rsvps) || [],
    gifts: raw ? raw.gifts || [] : defaults.sampleGifts.map((g) => ({ ...g, id: newId(), reservedBy: null })),
    auth: (raw && raw.auth) || {},
  };
  if (!d.auth.secret) d.auth.secret = crypto.randomBytes(32).toString('hex');
  if (!d.auth.passwordHash) {
    const initial = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
    d.auth.passwordHash = hashPassword(initial);
    d.auth.isDefault = initial === DEFAULT_PASSWORD;
  }
  return d;
}

const db = loadDb();

function saveDb() {
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
saveDb();

// ------------------------------------------------------------------- auth

const sign = (value) => crypto.createHmac('sha256', db.auth.secret).update(value).digest('hex');

function sessionCookie(req, clear) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  if (clear) return `kk_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
  const exp = String(Date.now() + SESSION_DAYS * 86400e3);
  return `kk_admin=${exp}.${sign(exp)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}

function isAdmin(req) {
  const m = /(?:^|;\s*)kk_admin=(\d+)\.([0-9a-f]+)/.exec(req.headers.cookie || '');
  if (!m || Number(m[1]) < Date.now()) return false;
  const expected = Buffer.from(sign(m[1]));
  const actual = Buffer.from(m[2]);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// Fixed-window rate limit per client and bucket.
const hits = new Map();
function rateLimit(req, bucket, max, windowMs) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
  const key = `${bucket}:${fwd || req.socket.remoteAddress}`;
  const now = Date.now();
  let h = hits.get(key);
  if (!h || h.reset < now) hits.set(key, (h = { count: 0, reset: now + windowMs }));
  if (++h.count > max) throw new HttpError(429, 'rate_limited');
}
setInterval(() => {
  const now = Date.now();
  for (const [k, h] of hits) if (h.reset < now) hits.delete(k);
}, 60e3).unref();

// ---------------------------------------------------------------- helpers

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new HttpError(413, 'too_large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  if (!/^application\/json/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'json_required');
  try {
    const body = JSON.parse((await readBody(req, MAX_JSON)).toString('utf8'));
    if (!body || typeof body !== 'object') throw new Error('not an object');
    return body;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(400, 'bad_json');
  }
}

function json(res, status, body, headers) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

const text = (v, max) => String(v === undefined || v === null ? '' : v).trim().slice(0, max);

function person(body) {
  const name = text(body.name, 100);
  const phone = text(body.phone, 20);
  if (!name || !/^\+?[\d\s-]{6,19}$/.test(phone)) throw new HttpError(400, 'invalid_contact');
  return { name, phone };
}

const phoneKey = (p) => p.replace(/\D/g, '').replace(/^60/, '0');
const mytDate = (ts) => new Date(ts + MYT_OFFSET_MS).toISOString().slice(0, 10);
const mytStamp = (ts) => new Date(ts + MYT_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');

function publicState() {
  return {
    config: db.config,
    gifts: db.gifts.map(({ reservedBy, ...g }) => ({ ...g, reserved: !!reservedBy })),
    wishes: db.rsvps
      .filter((r) => r.wish && !r.wishHidden)
      .map((r) => ({ id: r.id, name: r.name, wish: r.wish, at: r.at }))
      .reverse(),
  };
}

const adminState = () => ({
  config: db.config,
  gifts: db.gifts,
  rsvps: db.rsvps,
  defaultPassword: !!db.auth.isDefault,
});

function findOr404(list, id) {
  const item = list.find((x) => x.id === id);
  if (!item) throw new HttpError(404, 'not_found');
  return item;
}

// ----------------------------------------------------------------- export

function exportWorkbook() {
  const attending = db.rsvps.filter((r) => r.attending);
  return buildXlsx([
    {
      name: 'RSVP',
      columns: [
        { header: 'No.', width: 6 },
        { header: 'Name', width: 30 },
        { header: 'Phone', width: 18 },
        { header: 'Attendance', width: 16 },
        { header: 'Pax', width: 8 },
        { header: 'Wish', width: 60 },
        { header: 'Submitted (MYT)', width: 20 },
      ],
      rows: db.rsvps.map((r, i) => [i + 1, r.name, r.phone, r.attending ? 'Attending' : 'Not attending', r.pax, r.wish, mytStamp(r.at)]),
    },
    {
      name: 'Summary',
      columns: [{ header: 'Item', width: 28 }, { header: 'Total', width: 12 }],
      rows: [
        ['Responses', db.rsvps.length],
        ['Attending (responses)', attending.length],
        ['Attending (total pax)', attending.reduce((n, r) => n + r.pax, 0)],
        ['Not attending', db.rsvps.length - attending.length],
        ['Wishes', db.rsvps.filter((r) => r.wish).length],
        ['Gifts reserved', db.gifts.filter((g) => g.reservedBy).length],
      ],
    },
    {
      name: 'Gifts',
      columns: [
        { header: 'Gift', width: 32 },
        { header: 'Price', width: 14 },
        { header: 'Status', width: 14 },
        { header: 'Reserved by', width: 28 },
        { header: 'Phone', width: 18 },
        { header: 'Reserved (MYT)', width: 20 },
      ],
      rows: db.gifts.map((g) => {
        const r = g.reservedBy;
        return [g.name, g.price, r ? 'Reserved' : 'Available', r ? r.name : '', r ? r.phone : '', r ? mytStamp(r.at) : ''];
      }),
    },
  ]);
}

// -------------------------------------------------------------------- api

const IMAGE_TYPES = {
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/gif': { ext: 'gif', magic: [0x47, 0x49, 0x46, 0x38] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
};

const tag = (buf, offset, text) => buf.length >= offset + text.length && buf.toString('latin1', offset, offset + text.length) === text;
const mp3 = { audio: true, ext: 'mp3', check: (b) => tag(b, 0, 'ID3') || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) };
const m4a = { audio: true, ext: 'm4a', check: (b) => tag(b, 4, 'ftyp') };
const wav = { audio: true, ext: 'wav', check: (b) => tag(b, 0, 'RIFF') && tag(b, 8, 'WAVE') };
const AUDIO_TYPES = {
  'audio/mpeg': mp3,
  'audio/mp3': mp3,
  'audio/mp4': m4a,
  'audio/x-m4a': m4a,
  'audio/m4a': m4a,
  'audio/ogg': { audio: true, ext: 'ogg', check: (b) => tag(b, 0, 'OggS') },
  'audio/wav': wav,
  'audio/x-wav': wav,
  'audio/wave': wav,
};

async function api(req, res, route) {
  const { method } = req;

  if (route === '/public' && method === 'GET') return json(res, 200, publicState());

  if (route === '/rsvp' && method === 'POST') {
    rateLimit(req, 'rsvp', 20, 10 * 60e3);
    const { rsvp } = db.config;
    if (!rsvp.enabled || (rsvp.deadline && mytDate(Date.now()) > rsvp.deadline)) throw new HttpError(403, 'rsvp_closed');
    const body = await readJson(req);
    const { name, phone } = person(body);
    const attending = body.attending === true;
    const maxPax = Math.max(1, Math.floor(rsvp.maxPax) || 1);
    const pax = attending ? Math.min(maxPax, Math.max(1, Math.floor(Number(body.pax)) || 1)) : 0;
    const wish = text(body.wish, 500);
    // The same phone number submitting again updates its earlier response.
    let entry = db.rsvps.find((r) => phoneKey(r.phone) === phoneKey(phone));
    const updated = !!entry;
    if (!entry) db.rsvps.push((entry = { id: newId(), wishHidden: false }));
    Object.assign(entry, { name, phone, attending, pax, wish, at: Date.now() });
    saveDb();
    return json(res, 200, { ok: true, updated });
  }

  let m = /^\/gifts\/([0-9a-f]+)\/reserve$/.exec(route);
  if (m && method === 'POST') {
    rateLimit(req, 'reserve', 20, 10 * 60e3);
    if (!db.config.registry.enabled) throw new HttpError(403, 'registry_closed');
    const gift = findOr404(db.gifts, m[1]);
    const who = person(await readJson(req));
    if (gift.reservedBy) throw new HttpError(409, 'gift_taken');
    gift.reservedBy = { ...who, at: Date.now() };
    saveDb();
    return json(res, 200, { ok: true });
  }

  if (route === '/admin/login' && method === 'POST') {
    rateLimit(req, 'login', 10, 15 * 60e3);
    const body = await readJson(req);
    if (!checkPassword(body.password, db.auth.passwordHash)) throw new HttpError(401, 'wrong_password');
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req) });
  }

  if (route === '/admin/logout' && method === 'POST') {
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req, true) });
  }

  if (!route.startsWith('/admin/')) throw new HttpError(404, 'not_found');
  if (!isAdmin(req)) throw new HttpError(401, 'unauthorized');

  if (route === '/admin/state' && method === 'GET') return json(res, 200, adminState());

  if (route === '/admin/state' && method === 'PUT') {
    const body = await readJson(req);
    if (body.config) db.config = clean(body.config, defaults.config);
    if (Array.isArray(body.gifts)) {
      // Reservations are kept from the server's copy so a guest reserving
      // while the admin is editing is never lost.
      db.gifts = body.gifts.slice(0, 100).map((g) => {
        const existing = db.gifts.find((x) => x.id === g.id);
        return {
          ...clean(g, defaults.gift),
          id: existing ? existing.id : newId(),
          reservedBy: existing && !g.unreserve ? existing.reservedBy : null,
        };
      });
    }
    saveDb();
    return json(res, 200, adminState());
  }

  if (route === '/admin/upload' && method === 'POST') {
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const type = IMAGE_TYPES[mime] || AUDIO_TYPES[mime];
    if (!type) throw new HttpError(415, mime.startsWith('audio/') ? 'unsupported_audio' : 'unsupported_image');
    const buf = await readBody(req, type.audio ? MAX_AUDIO : MAX_UPLOAD);
    const valid = type.audio ? type.check(buf) : type.magic.every((b, i) => buf[i] === b);
    if (!valid) throw new HttpError(400, type.audio ? 'bad_audio' : 'bad_image');
    const name = `${crypto.randomBytes(12).toString('hex')}.${type.ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buf);
    return json(res, 200, { url: `/uploads/${name}` });
  }

  m = /^\/admin\/rsvps\/([0-9a-f]+)$/.exec(route);
  if (m && method === 'DELETE') {
    findOr404(db.rsvps, m[1]);
    db.rsvps = db.rsvps.filter((r) => r.id !== m[1]);
    saveDb();
    return json(res, 200, adminState());
  }
  if (m && method === 'PATCH') {
    const entry = findOr404(db.rsvps, m[1]);
    entry.wishHidden = (await readJson(req)).wishHidden === true;
    saveDb();
    return json(res, 200, adminState());
  }

  if (route === '/admin/export.xlsx' && method === 'GET') {
    const buf = exportWorkbook();
    res.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="rsvp-${mytDate(Date.now())}.xlsx"`,
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
    });
    return res.end(buf);
  }

  if (route === '/admin/password' && method === 'POST') {
    const body = await readJson(req);
    if (!checkPassword(body.current, db.auth.passwordHash)) throw new HttpError(401, 'wrong_password');
    const next = String(body.next || '');
    if (next.length < 8 || next.length > 200) throw new HttpError(400, 'weak_password');
    db.auth.passwordHash = hashPassword(next);
    db.auth.isDefault = false;
    db.auth.secret = crypto.randomBytes(32).toString('hex'); // signs out every other session
    saveDb();
    return json(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie(req) });
  }

  throw new HttpError(404, 'not_found');
}

// ----------------------------------------------------------------- static

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

function serveFile(req, res, root, rel, cache) {
  const file = path.join(root, rel);
  if (!file.startsWith(root + path.sep)) throw new HttpError(404, 'not_found');
  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new HttpError(404, 'not_found');
  }
  if (!stat.isFile()) throw new HttpError(404, 'not_found');
  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
  // Byte ranges: iPhones will not play audio from a server without them.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (range && (range[1] || range[2]) && stat.size > 0) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(end, Number(range[2]));
    } else start = Math.max(0, stat.size - Number(range[2]));
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    headers['Content-Length'] = end - start + 1;
  }
  res.writeHead(status, headers);
  if (req.method === 'HEAD' || stat.size === 0) return res.end();
  fs.createReadStream(file, { start, end }).pipe(res);
}

// The card page, with its link-preview tags written from the saved card.
// Chat apps read these tags without running any script, so they have to be
// in the HTML itself.
function sharePreview(req, lang) {
  const c = db.config;
  const english = (lang || c.language.default) === 'en';
  const pick = (ms, en) => (english && en) || ms;
  const groomFirst = c.couple.order !== 'bride-first';
  const names = `${groomFirst ? c.couple.groomShort : c.couple.brideShort} & ${groomFirst ? c.couple.brideShort : c.couple.groomShort}`;
  const proto = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const origin = `${proto}://${req.headers.host || 'localhost'}`;
  let image = c.share.image;
  if (/^\/uploads\/[\w.-]+$/.test(image)) image = origin + image;
  else if (!/^https?:\/\//i.test(image)) image = '';
  return {
    title: pick(c.share.title, c.en.share.title) || `${pick(c.hero.title, c.en.hero.title)}: ${names}`,
    description: pick(c.share.description, c.en.share.description),
    image,
    url: `${origin}/`,
  };
}

function serveCard(req, res, lang) {
  const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const p = sharePreview(req, lang);
  const tags = [
    `<title>${attr(p.title)}</title>`,
    `<meta name="description" content="${attr(p.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${attr(p.title)}">`,
    `<meta property="og:description" content="${attr(p.description)}">`,
    `<meta property="og:url" content="${attr(p.url)}">`,
    p.image && `<meta property="og:image" content="${attr(p.image)}">`,
    `<meta name="twitter:card" content="${p.image ? 'summary_large_image' : 'summary'}">`,
  ].filter(Boolean);
  const html = fs
    .readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
    .replace(/<!--share:start-->[\s\S]*?<!--share:end-->/, () => tags.join('\n  '));
  const body = Buffer.from(html);
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

async function handle(req, res) {
  let pathname;
  let lang;
  try {
    const url = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(url.pathname);
    lang = url.searchParams.get('lang');
  } catch {
    throw new HttpError(400, 'bad_url');
  }
  if (pathname.startsWith('/api/')) return api(req, res, pathname.slice(4));
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed');
  if (pathname.startsWith('/uploads/')) {
    return serveFile(req, res, UPLOAD_DIR, pathname.slice(9), 'public, max-age=31536000, immutable');
  }
  if (pathname === '/' || pathname === '/index.html') return serveCard(req, res, lang === 'en' || lang === 'ms' ? lang : null);
  if (pathname === '/admin' || pathname === '/admin/') pathname = '/admin.html';
  return serveFile(req, res, PUBLIC_DIR, pathname, 'no-cache');
}

http
  .createServer((req, res) => {
    handle(req, res).catch((err) => {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      if (res.headersSent) return res.end();
      json(res, status, { error: err instanceof HttpError ? err.code : 'server_error' });
    });
  })
  .listen(PORT, () => {
    console.log(`Kad Kahwin running:  http://localhost:${PORT}`);
    console.log(`Admin panel:         http://localhost:${PORT}/admin`);
    if (db.auth.isDefault) {
      console.log(`\n  ! Admin password is the default "${DEFAULT_PASSWORD}". Change it in Admin > Settings before going live.\n`);
    }
  });
