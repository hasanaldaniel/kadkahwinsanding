'use strict';

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MYT_OFFSET_H = 8;
  const isPreview = new URLSearchParams(location.search).has('preview');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let source = null; // the saved card, with both languages
  let lang = 'ms';
  let cfg = null; // `source` in the language being shown
  let gifts = [];
  let wishes = [];
  let colors = null;

  // ------------------------------------------------------------ helpers
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...kids.flat().filter((k) => k != null && k !== false));
    return el;
  }

  function icon(id) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'ico');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', `#i-${id}`);
    svg.append(use);
    return svg;
  }

  const store = {
    get(key) {
      try {
        return JSON.parse(localStorage.getItem(key));
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* private mode: the card still works, it just won't remember */
      }
    },
  };

  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3200);
  }

  async function post(url, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || 'error'), { code: data.error });
    return data;
  }

  function errorText(err) {
    if (err.code === 'invalid_contact') return cfg.labels.errRequired;
    if (err.code === 'gift_taken') return cfg.labels.giftTaken;
    if (err.code === 'rsvp_closed') return cfg.rsvp.closedText;
    return cfg.labels.errGeneric;
  }

  // -------------------------------------------------------- event facts
  function names() {
    const c = cfg.couple;
    const groom = { short: c.groomShort, full: c.groomFull };
    const bride = { short: c.brideShort, full: c.brideFull };
    return c.order === 'bride-first' ? { first: bride, second: groom } : { first: groom, second: bride };
  }

  // Start/end as real instants; the event's wall-clock time is Malaysia time.
  function eventTimes() {
    const [y, mo, d] = String(cfg.event.date).split('-').map(Number);
    if (!y || !mo || !d) return null;
    const at = (hhmm, fallback) => {
      const [hh, mm] = String(hhmm || fallback).split(':').map(Number);
      return new Date(Date.UTC(y, mo - 1, d, (hh || 0) - MYT_OFFSET_H, mm || 0));
    };
    const start = at(cfg.event.startTime, '11:00');
    let end = at(cfg.event.endTime, '16:00');
    if (end <= start) end = new Date(start.getTime() + 4 * 3600e3);
    return { start, end };
  }

  // ----------------------------------------------------------- language
  const LANGS = ['ms', 'en'];

  // English view of the card: English wording laid over the Malay text,
  // falling back to Malay wherever the English is left empty.
  function localize(config, language) {
    if (language !== 'en' || !config.en) return config;
    const out = JSON.parse(JSON.stringify(config));
    const overlay = (target, english) => {
      for (const [key, value] of Object.entries(english)) {
        if (value && typeof value === 'object') overlay(target[key], value);
        else if (value) target[key] = value;
      }
    };
    overlay(out, config.en);
    for (const list of [out.invite.groomHosts, out.invite.brideHosts, out.event.itinerary, out.attire.colors, out.thanks.contacts]) {
      for (const item of list) for (const key of Object.keys(item)) if (key.endsWith('En') && item[key]) item[key.slice(0, -2)] = item[key];
    }
    // The date and time are written out in English rather than borrowed from Malay.
    out.event.dateText = config.en.event.dateText;
    if (!config.en.event.timeText) {
      const clock = (hhmm) => {
        const [hh, mm] = String(hhmm).split(':').map(Number);
        return Number.isFinite(hh) ? `${hh % 12 || 12}:${String(mm || 0).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}` : '';
      };
      out.event.timeText = [clock(config.event.startTime), clock(config.event.endTime)].filter(Boolean).join(' – ');
    }
    return out;
  }

  function pickLanguage() {
    const setting = source.language || {};
    const fallback = LANGS.includes(setting.default) ? setting.default : 'ms';
    if (!setting.enabled) return fallback;
    const asked = new URLSearchParams(location.search).get('lang');
    return [asked, store.get('kk_lang'), fallback].find((l) => LANGS.includes(l));
  }

  function dateText() {
    if (cfg.event.dateText) return cfg.event.dateText;
    const [y, mo, d] = String(cfg.event.date).split('-').map(Number);
    if (!y || !mo || !d) return '';
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ms-MY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, mo - 1, d))
    );
  }

  const placeQuery = () => [cfg.event.venueName, cfg.event.address].filter(Boolean).join(', ');
  const gmapsUrl = () => KK.safeUrl(cfg.event.googleMapsUrl) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeQuery())}`;
  const wazeUrl = () => KK.safeUrl(cfg.event.wazeUrl) || `https://waze.com/ul?q=${encodeURIComponent(placeQuery())}&navigate=yes`;

  function calendarEvent() {
    const t = eventTimes();
    if (!t) return null;
    const n = names();
    const stamp = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
    return {
      title: `${cfg.hero.title}: ${n.first.short} & ${n.second.short}`,
      details: `${n.first.full} & ${n.second.full}\n${location.origin}${location.pathname}`,
      location: placeQuery(),
      start: stamp(t.start),
      end: stamp(t.end),
    };
  }

  function googleCalendarUrl() {
    const e = calendarEvent();
    if (!e) return '#';
    const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${e.start}/${e.end}`, details: e.details, location: e.location });
    return `https://calendar.google.com/calendar/render?${q}`;
  }

  function downloadIcs() {
    const e = calendarEvent();
    if (!e) return;
    const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Kad Kahwin//MS',
      'BEGIN:VEVENT',
      `UID:${e.start}-${location.hostname}`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')}`,
      `DTSTART:${e.start}`,
      `DTEND:${e.end}`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(e.details)}`,
      `LOCATION:${esc(e.location)}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(e.title)}`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: 'majlis-perkahwinan.ics' });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ------------------------------------------------------------- render
  function render() {
    cfg = localize(source, lang);
    document.documentElement.lang = lang;
    const toggle = $('#langToggle');
    toggle.hidden = !(source.language && source.language.enabled);
    for (const btn of $$('button', toggle)) btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));

    colors = KK.applyDesign(cfg.design);
    $('#cover').dataset.style = KK.OPENINGS[cfg.design.opening] ? cfg.design.opening : 'doors';

    for (const el of $$('[data-t]')) el.textContent = get(cfg, el.dataset.t) || '';
    for (const el of $$('[data-show]')) el.hidden = !get(cfg, el.dataset.show);

    const n = names();
    for (const el of $$('[data-name]')) el.textContent = n[el.dataset.name].short;
    for (const el of $$('[data-fullname]')) el.textContent = n[el.dataset.fullname].full;
    const date = dateText();
    for (const el of $$('[data-date]')) el.textContent = date;
    document.title = cfg.share.title || `${cfg.hero.title}: ${n.first.short} & ${n.second.short}`;

    for (const a of $$('.js-gmaps')) a.href = gmapsUrl();
    for (const a of $$('.js-waze')) a.href = wazeUrl();
    for (const a of $$('.js-gcal')) a.href = googleCalendarUrl();

    renderHosts();

    const itinerary = cfg.event.itinerary.filter((i) => i.time || i.label);
    $('#itineraryWrap').hidden = !itinerary.length;
    $('#itinerary').replaceChildren(...itinerary.map((i) => h('li', null, h('time', { text: i.time }), h('span', { text: i.label }))));

    $('#swatches').replaceChildren(
      ...cfg.attire.colors
        .filter((c) => /^#[0-9a-f]{3,8}$/i.test(c.hex))
        .map((c) => h('div', { class: 'swatch' }, h('i', { style: `background:${c.hex}` }), h('span', { text: c.name })))
    );
    setImage($('#attireImg'), cfg.attire.image, $('#attireImg'));
    setImage($('#qrImg'), cfg.moneyGift.qrImage, $('#qrWrap'));

    const credit = $('#creditLink');
    const creditUrl = KK.safeUrl(cfg.footer.link);
    if (creditUrl) Object.assign(credit, { href: creditUrl, target: '_blank', rel: 'noopener' });
    else for (const attr of ['href', 'target', 'rel']) credit.removeAttribute(attr);

    $('#dockGift').hidden = !cfg.moneyGift.enabled && !cfg.registry.enabled;

    renderFrames();
    renderRsvp();
    renderGifts();
    renderWishes();
    renderContacts();
    tickCountdown();
    setupMusic();
    FX.set(cfg.design.effect);
    observeReveals();
  }

  // Hosts: one block per family, each name with an optional small note under it.
  function renderHosts() {
    const inv = cfg.invite;
    const side = (list, label) => {
      const entries = list.filter((host) => host.name || host.note);
      if (!entries.length) return null;
      return h(
        'div',
        { class: 'host-side' },
        label && h('p', { class: 'host-label', text: label }),
        entries.flatMap((host, i) => [
          i > 0 && inv.hostsJoin && h('p', { class: 'host-join', text: inv.hostsJoin }),
          host.name && h('p', { class: 'host-name', text: host.name }),
          host.note && h('p', { class: 'host-note', text: host.note }),
        ])
      );
    };
    const groom = side(inv.groomHosts, inv.groomHostsLabel);
    const bride = side(inv.brideHosts, inv.brideHostsLabel);
    const sides = (cfg.couple.order === 'bride-first' ? [bride, groom] : [groom, bride]).filter(Boolean);
    const box = $('#hosts');
    if (!sides.length) {
      // a card that still has its hosts written as one block of text
      box.replaceChildren(h('p', { class: 'host-name', text: inv.hosts }));
      box.hidden = !inv.hosts;
      return;
    }
    box.hidden = false;
    box.replaceChildren(...sides.flatMap((el, i) => [i > 0 && inv.hostsBetween && h('p', { class: 'host-between', text: inv.hostsBetween }), el]).filter(Boolean));
  }

  // ------------------------------------------------- decorative frames
  function mix(a, b, t) {
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [x, y] = [rgb(a), rgb(b)];
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  // Corner artwork drawn for the top-left corner; CSS mirrors it for the others.
  function cornerSvg(kind) {
    const leaf = (x, y, len, angle, fill) =>
      `<path fill="${fill}" d="M0 0C${len * 0.3} ${-len * 0.3} ${len * 0.75} ${-len * 0.25} ${len} 0C${len * 0.75} ${len * 0.25} ${len * 0.3} ${len * 0.3} 0 0Z" transform="translate(${x} ${y}) rotate(${angle})"/>`;
    const flower = (x, y, r, fill) =>
      `<g transform="translate(${x} ${y})">${[0, 72, 144, 216, 288]
        .map((a) => `<ellipse cy="${-r * 0.52}" rx="${r * 0.4}" ry="${r * 0.52}" fill="${fill}" stroke="${mix(fill, '#ffffff', 0.55)}" stroke-width=".7" transform="rotate(${a})"/>`)
        .join('')}<circle r="${r * 0.24}" fill="${colors.accent}"/></g>`;
    const green = '#8fa583';
    const deepGreen = '#6f8a6a';
    let art;
    if (kind === 'ornament') {
      art =
        `<g fill="none" stroke="${colors.accent}" stroke-width="1.600" stroke-linecap="round"><path d="M10 130V34A24 24 0 0 1 34 10h96"/><path d="M24 104V46a22 22 0 0 1 22-22h58"/><path d="M10 130q12 6 14-8M130 10q6 12-8 14"/></g>` +
        `<path fill="${colors.accent}" d="M38 28l10 10-10 10-10-10z"/>`;
    } else if (kind === 'leaves') {
      const sprig = [1, 2, 3, 4, 5].map((i) => leaf(18 + i * 28, 12 + i * (6 - i) * 2.2, 34, i % 2 ? -38 : 42, i % 2 ? green : deepGreen)).join('');
      const sprig2 = [1, 2, 3, 4, 5].map((i) => leaf(12 + i * (6 - i) * 2.2, 18 + i * 28, 34, i % 2 ? 128 : 48, i % 2 ? deepGreen : green)).join('');
      art =
        `<g fill="none" stroke="${deepGreen}" stroke-width="1.400"><path d="M8 8Q90 34 172 22"/><path d="M8 8Q34 90 22 172"/></g>${sprig}${sprig2}` +
        `<g fill="${colors.accent}"><circle cx="176" cy="22" r="4"/><circle cx="22" cy="176" r="4"/><circle cx="14" cy="14" r="6"/></g>`;
    } else {
      const bloom = KK.isHex(cfg.design.frameColor) ? cfg.design.frameColor : '#e8a9b6';
      art =
        leaf(40, 40, 100, 10, green) +
        leaf(40, 40, 100, 80, green) +
        leaf(50, 50, 86, 45, deepGreen) +
        leaf(92, 24, 62, -10, deepGreen) +
        leaf(24, 92, 62, 100, deepGreen) +
        `<g fill="none" stroke="${deepGreen}" stroke-width="1.300"><path d="M104 36Q134 34 166 20"/><path d="M36 104Q34 134 20 166"/></g>` +
        `<g fill="${mix(bloom, '#ffffff', 0.35)}"><circle cx="168" cy="19" r="6"/><circle cx="150" cy="36" r="4.500"/><circle cx="19" cy="168" r="6"/><circle cx="36" cy="150" r="4.500"/></g>` +
        flower(112, 36, 25, mix(bloom, '#ffffff', 0.45)) +
        flower(36, 112, 25, mix(bloom, '#ffffff', 0.45)) +
        flower(54, 54, 40, bloom) +
        flower(98, 94, 17, mix(bloom, '#000000', 0.14));
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">${art}</svg>`;
  }

  function fillCorners(host, kind, places) {
    const svg = cornerSvg(kind); // built only from validated hex colours
    host.replaceChildren(
      ...places.map((place) => {
        const corner = h('div', { class: `corner ${place}` });
        corner.innerHTML = svg;
        return corner;
      })
    );
  }

  let frameKey = '';
  function renderFrames() {
    const d = cfg.design;
    const key = [d.heroFrame, d.heroFrameImage, d.frameColor, d.coverDesign, colors.accent].join('|');
    if (key === frameKey) return;
    frameKey = key;

    const hero = $('#heroFrame');
    const custom = KK.safeUrl(d.heroFrameImage);
    const PLACES = { 'floral-corners': ['tl', 'br'], 'floral-top': ['tl', 'tr'], 'floral-four': ['tl', 'tr', 'bl', 'br'], leaves: ['tl', 'br'], ornament: ['tl', 'tr', 'bl', 'br'] };
    if (d.heroFrame === 'custom' && custom) hero.replaceChildren(h('img', { src: custom, alt: '' }));
    else if (PLACES[d.heroFrame]) fillCorners(hero, d.heroFrame.startsWith('floral') ? 'floral' : d.heroFrame, PLACES[d.heroFrame]);
    else hero.replaceChildren();

    if (d.coverDesign === 'floral') fillCorners($('#coverFrame'), 'floral', ['tl', 'br']);
    else $('#coverFrame').replaceChildren();
  }

  function setImage(img, url, wrapper) {
    const safe = KK.safeUrl(url);
    wrapper.hidden = !safe;
    if (safe) img.src = safe;
    else img.removeAttribute('src');
  }

  function renderRsvp() {
    const form = $('#rsvpForm');
    const maxPax = Math.max(1, Math.floor(cfg.rsvp.maxPax) || 1);
    const select = form.elements.pax;
    const current = select.value;
    select.replaceChildren(...Array.from({ length: maxPax }, (_, i) => h('option', { value: i + 1, text: String(i + 1) })));
    if (current && Number(current) <= maxPax) select.value = current;

    const today = new Date(Date.now() + MYT_OFFSET_H * 3600e3).toISOString().slice(0, 10);
    const closed = !!cfg.rsvp.deadline && today > cfg.rsvp.deadline;
    const done = !!store.get('kk_rsvp') && !form.dataset.editing && !isPreview;
    $('#rsvpClosed').hidden = !closed || done;
    $('#rsvpDone').hidden = !done;
    form.hidden = closed || done;
    $('#paxRow').hidden = form.elements.attending.value !== 'yes';
  }

  // More than four gifts are shown four at a time, turning page by itself.
  const GIFTS_PER_PAGE = 4;
  const GIFT_PAUSE_MS = 12000; // hold still this long after the guest touches the list
  let giftPage = 0;
  let giftTurnedAt = Date.now();
  let giftTouchedAt = 0;
  let giftsInView = false;
  const giftPages = () => Math.ceil(gifts.length / GIFTS_PER_PAGE);

  function showGiftPage(page, byGuest) {
    const box = $('#gifts');
    // Pages differ in height; keep the tallest so the sections below never jump.
    box.style.minHeight = `${Math.max(box.offsetHeight, parseFloat(box.style.minHeight) || 0)}px`;
    giftPage = (page + giftPages()) % giftPages();
    if (byGuest) giftTouchedAt = Date.now();
    renderGifts();
    box.classList.remove('turn');
    void box.offsetWidth; // restart the animation
    box.classList.add('turn');
  }

  function renderGiftPager(paged) {
    const pager = $('#giftPager');
    pager.hidden = !paged;
    if (!paged) return pager.replaceChildren();
    const pages = giftPages();
    pager.replaceChildren(
      h('button', { type: 'button', text: '‹', 'aria-label': '←', onclick: () => showGiftPage(giftPage - 1, true) }),
      h(
        'div',
        { class: 'dots' },
        Array.from({ length: pages }, (_, i) => h('button', { type: 'button', class: 'dot', 'aria-label': `${i + 1} / ${pages}`, 'aria-current': String(i === giftPage), onclick: () => showGiftPage(i, true) }))
      ),
      h('button', { type: 'button', text: '›', 'aria-label': '→', onclick: () => showGiftPage(giftPage + 1, true) })
    );
  }

  function renderGifts() {
    const mine = store.get('kk_gifts') || [];
    const L = cfg.labels;
    const paged = gifts.length > GIFTS_PER_PAGE;
    giftPage = paged ? Math.min(giftPage, giftPages() - 1) : 0;
    giftTurnedAt = Date.now();
    if (!paged) $('#gifts').style.minHeight = '';
    renderGiftPager(paged);
    const shown = paged ? gifts.slice(giftPage * GIFTS_PER_PAGE, (giftPage + 1) * GIFTS_PER_PAGE) : gifts;
    const cards = shown.map((g) => {
      const img = KK.safeUrl(g.image);
      const link = KK.safeUrl(g.link);
      return h(
        'article',
        { class: `gift panel${paged ? '' : ' reveal'}${img ? '' : ' noimg'}${g.reserved ? ' taken' : ''}` },
        img && h('img', { src: img, alt: '', loading: 'lazy' }),
        h(
          'div',
          null,
          h('h4', { text: (lang === 'en' && g.nameEn) || g.name }),
          ((lang === 'en' && g.descriptionEn) || g.description) && h('p', { text: (lang === 'en' && g.descriptionEn) || g.description }),
          g.price && h('p', { class: 'price', text: g.price }),
          h(
            'div',
            { class: 'actions' },
            g.reserved
              ? h('span', { class: 'badge', text: mine.includes(g.id) ? L.reservedByYou : L.reserved })
              : h('button', { class: 'btn', type: 'button', text: L.reserve, onclick: () => openReserve(g) }),
            link && h('a', { class: 'btn ghost view', href: link, target: '_blank', rel: 'noopener' }, h('span', { text: L.viewItem }), icon('external'))
          )
        )
      );
    });
    $('#gifts').replaceChildren(...(cards.length ? cards : [h('p', { class: 'empty', text: cfg.registry.emptyText })]));
    observeReveals();
  }

  for (const type of ['pointerdown', 'focusin', 'mouseover']) $('#gifts').addEventListener(type, () => (giftTouchedAt = Date.now()));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      ([entry]) => {
        giftsInView = entry.isIntersecting;
        if (giftsInView) giftTurnedAt = Date.now(); // a full interval once it scrolls into view
      },
      { threshold: 0.25 }
    ).observe($('#gifts'));
  }
  setInterval(() => {
    if (!cfg || reducedMotion || document.hidden || !giftsInView || gifts.length <= GIFTS_PER_PAGE) return;
    const seconds = Number(cfg.registry.autoSeconds) || 0;
    if (seconds <= 0 || !$('#reserveModal').hidden) return;
    const now = Date.now();
    if (now - giftTouchedAt < GIFT_PAUSE_MS || now - giftTurnedAt < seconds * 1000) return;
    showGiftPage(giftPage + 1);
  }, 500);

  // Wishes scroll upwards in an endless loop once there are more than fit.
  function renderWishes() {
    const box = $('#wishBox');
    if (!wishes.length) {
      box.classList.add('static');
      box.replaceChildren(h('p', { class: 'empty', text: cfg.wishes.emptyText }));
      return;
    }
    const item = (w) => h('figure', { class: 'wish' }, h('q', { text: w.wish }), h('cite', { text: w.name }));
    const track = h('div', { class: 'wish-track' }, wishes.map(item));
    box.classList.add('static');
    box.replaceChildren(track);
    requestAnimationFrame(() => {
      const height = track.scrollHeight;
      if (reducedMotion || height <= 380) return;
      box.classList.remove('static');
      for (const w of wishes) {
        const copy = item(w);
        copy.setAttribute('aria-hidden', 'true');
        track.append(copy);
      }
      const speed = Math.min(200, Math.max(8, Number(cfg.wishes.speed) || 30));
      track.style.setProperty('--dur', `${Math.round(height / speed)}s`);
      track.classList.add('scrolling');
    });
  }

  function renderContacts() {
    const L = cfg.labels;
    $('#contacts').replaceChildren(
      ...cfg.thanks.contacts
        .filter((c) => c.name || c.phone)
        .map((c) => {
          const digits = String(c.phone).replace(/\D/g, '');
          const intl = digits.startsWith('0') ? `6${digits}` : digits;
          return h(
            'div',
            { class: 'contact panel' },
            h('div', null, h('b', { text: c.name }), h('small', { text: [c.role, c.phone].filter(Boolean).join(' · ') })),
            digits &&
              h(
                'div',
                { class: 'btn-row' },
                h('a', { class: 'btn', href: `https://wa.me/${intl}`, target: '_blank', rel: 'noopener', 'aria-label': `${L.whatsapp} ${c.name}` }, icon('chat'), h('span', { text: L.whatsapp })),
                h('a', { class: 'btn ghost', href: `tel:+${intl}`, 'aria-label': `${L.call} ${c.name}` }, icon('phone'), h('span', { text: L.call }))
              )
          );
        })
    );
    $('#contactBtn').hidden = !$('#contacts').children.length;
  }

  function tickCountdown() {
    if (!cfg) return;
    const t = eventTimes();
    const left = t ? Math.max(0, t.start - Date.now()) : 0;
    const s = Math.floor(left / 1000);
    $('#cdD').textContent = Math.floor(s / 86400);
    $('#cdH').textContent = Math.floor((s % 86400) / 3600);
    $('#cdM').textContent = Math.floor((s % 3600) / 60);
    $('#cdS').textContent = s % 60;
  }

  // ------------------------------------------------------ scroll reveal
  const revealObserver =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            for (const e of entries) {
              if (!e.isIntersecting) continue;
              e.target.classList.add('in');
              revealObserver.unobserve(e.target);
            }
          },
          { threshold: 0.12 }
        )
      : null;

  function observeReveals() {
    for (const el of $$('.reveal:not(.in):not([data-observed])')) {
      el.dataset.observed = '1';
      if (revealObserver && !document.body.classList.contains('locked')) revealObserver.observe(el);
      else if (!revealObserver) el.classList.add('in');
      else delete el.dataset.observed; // observed once the cover opens
    }
  }

  // ------------------------------------------------------------ effects
  const FX = (function () {
    const canvas = $('#fx');
    const ctx = canvas.getContext('2d');
    let type = 'none';
    let current = '';
    let parts = [];
    let raf = 0;
    let w = 0;
    let hgt = 0;
    const rand = (a, b) => a + Math.random() * (b - a);

    function resize() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      w = innerWidth;
      hgt = innerHeight;
      canvas.width = w * dpr;
      canvas.height = hgt * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function spawn(initial) {
      const rising = type === 'hearts' || type === 'dust';
      const tints = type === 'petals' ? [colors.accent, '#f3b8c4', '#f8d5da', '#e9a5b3'] : type === 'hearts' ? [colors.accent, '#e58fa0', colors.primary] : [colors.accent];
      return {
        x: rand(0, w),
        y: initial ? rand(0, hgt) : rising ? hgt + 20 : -20,
        size: type === 'dust' ? rand(1.5, 4.5) : type === 'sparkles' ? rand(4, 10) : rand(6, 12),
        vy: (rising ? -1 : 1) * (type === 'sparkles' ? rand(0.05, 0.25) : type === 'dust' ? rand(0.15, 0.5) : rand(0.5, 1.3)),
        sway: rand(0.3, 1.1),
        phase: rand(0, Math.PI * 2),
        rot: rand(0, Math.PI * 2),
        spin: rand(-0.02, 0.02),
        alpha: rand(0.35, 0.85),
        tint: tints[Math.floor(Math.random() * tints.length)],
      };
    }

    function draw(p, t) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = p.tint;
      const s = p.size;
      if (type === 'petals') {
        ctx.rotate(p.rot);
        ctx.scale(1, 0.55 + 0.45 * Math.sin(t / 700 + p.phase));
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s, -s, s, s * 0.6, 0, s);
        ctx.bezierCurveTo(-s, s * 0.6, -s, -s, 0, -s);
        ctx.fill();
      } else if (type === 'sparkles') {
        ctx.globalAlpha = p.alpha * (0.5 + 0.5 * Math.sin(t / 400 + p.phase));
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(0, 0, s, 0);
        ctx.quadraticCurveTo(0, 0, 0, s);
        ctx.quadraticCurveTo(0, 0, -s, 0);
        ctx.quadraticCurveTo(0, 0, 0, -s);
        ctx.fill();
      } else if (type === 'hearts') {
        ctx.rotate(Math.sin(t / 900 + p.phase) * 0.3);
        ctx.globalAlpha = p.alpha * 0.8;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.9);
        ctx.bezierCurveTo(-s * 1.4, -s * 0.1, -s * 0.6, -s * 1.1, 0, -s * 0.35);
        ctx.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.4, -s * 0.1, 0, s * 0.9);
        ctx.fill();
      } else {
        ctx.globalAlpha = p.alpha * (0.6 + 0.4 * Math.sin(t / 600 + p.phase));
        ctx.shadowColor = p.tint;
        ctx.shadowBlur = s * 3;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    function frame(t) {
      ctx.clearRect(0, 0, w, hgt);
      parts.forEach((p, i) => {
        p.y += p.vy;
        p.x += Math.sin(t / 1200 + p.phase) * p.sway * 0.5;
        p.rot += p.spin;
        if (p.y > hgt + 30 || p.y < -30) parts[i] = spawn(false);
        draw(p, t);
      });
      raf = requestAnimationFrame(frame);
    }

    function set(next) {
      next = KK.EFFECTS[next] && !reducedMotion ? next : 'none';
      const key = `${next}|${colors.accent}|${colors.primary}`;
      if (key === current) return;
      current = key;
      cancelAnimationFrame(raf);
      type = next;
      resize();
      ctx.clearRect(0, 0, w, hgt);
      canvas.hidden = type === 'none';
      if (type === 'none') return;
      const count = Math.round(Math.min(46, Math.max(16, w / 22)) * (type === 'dust' ? 1.5 : 1));
      parts = Array.from({ length: count }, () => spawn(true));
      raf = requestAnimationFrame(frame);
    }

    addEventListener('resize', resize);
    return { set };
  })();

  // -------------------------------------------------------------- music
  const audio = $('#music');
  function setupMusic() {
    const url = KK.safeUrl(cfg.music.url);
    $('#dockMusic').hidden = !url;
    if (!url) audio.pause();
    else if (audio.getAttribute('src') !== url) audio.setAttribute('src', url);
  }
  function toggleMusic(on) {
    if (!audio.getAttribute('src')) return;
    if (on === undefined) on = audio.paused;
    if (on) audio.play().catch(() => {});
    else audio.pause();
  }
  audio.addEventListener('play', () => $('#dockMusic').classList.add('playing'));
  audio.addEventListener('pause', () => $('#dockMusic').classList.remove('playing'));

  // ------------------------------------------------------ opening cover
  function openCard(instant) {
    const cover = $('#cover');
    document.body.classList.remove('locked');
    if (instant) cover.hidden = true;
    else {
      cover.classList.add('opening');
      setTimeout(() => (cover.hidden = true), 2100);
      if (cfg.music.autoplay) toggleMusic(true);
    }
    scrollTo(0, 0);
    observeReveals();
  }

  function replayCover() {
    const cover = $('#cover');
    cover.hidden = false;
    cover.classList.remove('opening');
    document.body.classList.add('locked');
    scrollTo(0, 0);
  }

  $('#openBtn').addEventListener('click', () => openCard(false));

  // ------------------------------------------------------------- modals
  function openModal(id) {
    $(id).hidden = false;
  }
  for (const modal of $$('.modal')) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close]')) modal.hidden = true;
    });
  }
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') for (const modal of $$('.modal')) modal.hidden = true;
  });

  $('#contactBtn').addEventListener('click', () => openModal('#contactModal'));
  $('#dock').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.go) $(`#${btn.dataset.go}`).scrollIntoView();
    else if (btn.dataset.act === 'contact') openModal('#contactModal');
    else if (btn.dataset.act === 'music') toggleMusic();
    else if (btn.dataset.act === 'gift') $(cfg.moneyGift.enabled ? '#salamkaut' : '#hadiah').scrollIntoView();
  });

  // ---------------------------------------------------------------- rsvp
  const rsvpForm = $('#rsvpForm');
  rsvpForm.addEventListener('change', () => ($('#paxRow').hidden = rsvpForm.elements.attending.value !== 'yes'));
  rsvpForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = rsvpForm.elements;
    const body = {
      name: f.name.value.trim(),
      phone: f.phone.value.trim(),
      attending: f.attending.value === 'yes',
      pax: Number(f.pax.value) || 1,
      wish: f.wish.value.trim(),
    };
    if (isPreview) return toast('Preview only — RSVPs are not saved here.');
    const btn = rsvpForm.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await post('/api/rsvp', body);
      store.set('kk_rsvp', body);
      delete rsvpForm.dataset.editing;
      renderRsvp();
      $('#rsvpDone').classList.add('in');
      $('#rsvp').scrollIntoView();
      refresh();
    } catch (err) {
      toast(errorText(err));
    } finally {
      btn.disabled = false;
    }
  });

  $('#rsvpEdit').addEventListener('click', () => {
    rsvpForm.dataset.editing = '1';
    prefill(rsvpForm);
    renderRsvp();
  });
  $('.js-ics').addEventListener('click', downloadIcs);

  function prefill(form) {
    const saved = store.get('kk_rsvp');
    if (!saved) return;
    const f = form.elements;
    f.name.value = saved.name || '';
    f.phone.value = saved.phone || '';
    if (f.attending) f.attending.value = saved.attending === false ? 'no' : 'yes';
    if (f.pax && saved.pax) f.pax.value = saved.pax;
    if (f.wish) f.wish.value = saved.wish || '';
  }

  // --------------------------------------------------------------- gifts
  let reserving = null;
  const reserveForm = $('#reserveForm');

  function openReserve(gift) {
    reserving = gift;
    $('#reserveGiftName').textContent = gift.name;
    if (!reserveForm.elements.name.value) prefill(reserveForm);
    openModal('#reserveModal');
  }

  reserveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!reserving) return;
    if (isPreview) return toast('Preview only — reservations are not saved here.');
    const f = reserveForm.elements;
    const btn = reserveForm.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await post(`/api/gifts/${reserving.id}/reserve`, { name: f.name.value.trim(), phone: f.phone.value.trim() });
      store.set('kk_gifts', [...(store.get('kk_gifts') || []), reserving.id]);
      $('#reserveModal').hidden = true;
      toast(cfg.labels.reserveSuccess);
      refresh();
    } catch (err) {
      toast(errorText(err));
      if (err.code === 'gift_taken') {
        $('#reserveModal').hidden = true;
        refresh();
      }
    } finally {
      btn.disabled = false;
    }
  });

  $('#copyAcc').addEventListener('click', async () => {
    const number = String(cfg.moneyGift.accountNumber).replace(/\s/g, '');
    try {
      await navigator.clipboard.writeText(number);
    } catch {
      const ta = h('textarea', { style: 'position:fixed;opacity:0' });
      ta.value = number;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(cfg.labels.copied);
  });

  // ---------------------------------------------------------------- data
  async function load() {
    const res = await fetch('/api/public', { cache: 'no-store' });
    if (!res.ok) throw new Error('load failed');
    return res.json();
  }

  // Pull fresh wishes and gift reservations without touching the rest.
  async function refresh() {
    if (isPreview) return;
    try {
      const data = await load();
      const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);
      if (changed(gifts, data.gifts)) {
        gifts = data.gifts;
        renderGifts();
      }
      if (changed(wishes, data.wishes)) {
        wishes = data.wishes;
        renderWishes();
      }
    } catch {
      /* offline: keep showing what we have */
    }
  }

  $('#langToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !source || btn.dataset.lang === lang) return;
    lang = btn.dataset.lang;
    store.set('kk_lang', lang);
    render();
  });

  // The admin panel streams unsaved edits into its preview iframe.
  if (isPreview) {
    addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data) return;
      if (e.data.type === 'kk-preview') {
        source = e.data.config;
        if (LANGS.includes(e.data.lang)) lang = e.data.lang;
        gifts = (e.data.gifts || []).map((g, i) => ({ ...g, id: g.id || `new${i}`, reserved: !!g.reservedBy && !g.unreserve }));
        render();
      } else if (e.data.type === 'kk-replay' && cfg) replayCover();
    });
  }

  load()
    .then((data) => {
      if (!source) {
        source = data.config;
        gifts = data.gifts;
        lang = pickLanguage();
      }
      wishes = data.wishes;
      render();
      document.body.classList.add('ready');
      if (isPreview) {
        openCard(true);
        parent.postMessage({ type: 'kk-preview-ready' }, location.origin);
      }
      setInterval(tickCountdown, 1000);
      setInterval(() => document.hidden || refresh(), 60e3);
    })
    .catch((err) => {
      console.error('Card failed to load:', err); // the real cause, for the browser console
      document.body.classList.add('ready');
      $('.cover-top').textContent = 'Kad tidak dapat dimuatkan. Sila muat semula halaman.\nThe card could not be loaded. Please refresh the page.';
      $('#openBtn').hidden = true;
    });
})();
