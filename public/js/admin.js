'use strict';

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const set = (o, p, v) => {
    const keys = p.split('.');
    const last = keys.pop();
    keys.reduce((a, k) => a[k], o)[last] = v;
  };
  const clone = (v) => JSON.parse(JSON.stringify(v));

  let draft = null; // { config, gifts } being edited
  let rsvps = [];
  let tab = 'content';
  let dirty = false;
  let editLang = 'ms'; // which language the Content tab is editing

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...kids.flat().filter((k) => k != null && k !== false));
    return el;
  }

  let toastTimer;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3000);
  }

  const ERRORS = {
    wrong_password: 'That password is not correct.',
    weak_password: 'Use at least 8 characters for the new password.',
    rate_limited: 'Too many attempts. Please wait a few minutes.',
    too_large: 'That file is too large (5 MB maximum for images, 20 MB for music).',
    unsupported_audio: 'Please choose an MP3, M4A, OGG or WAV file.',
    bad_audio: 'That file does not look like a valid audio file.',
    unsupported_image: 'Please choose a PNG, JPG, WebP or GIF image.',
    bad_image: 'That file does not look like a valid image.',
  };

  async function api(method, url, body) {
    const opts = { method, headers: {} };
    if (body instanceof Blob) {
      opts.headers['Content-Type'] = body.type;
      opts.body = body;
    } else if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && data.error === 'unauthorized') {
      showLogin();
      throw new Error('Please sign in again.');
    }
    if (!res.ok) throw new Error(ERRORS[data.error] || 'Something went wrong. Please try again.');
    return data;
  }

  // ------------------------------------------------------------ schema
  const F = (path, label, type = 'text', opt = {}) => ({ path, label, type, ...opt });
  const pairs = (obj) => Object.entries(obj).map(([value, label]) => [value, typeof label === 'string' ? label : label.name]);
  const fontOptions = (kind) => KK.FONTS[kind].map((f) => [f.name, f.name]);

  // Shown under every upload button. Uploads are reduced to 1600px on the longest side.
  const FILE_NOTE = 'PNG, JPG, WebP or GIF, up to 5 MB.';
  const SIZES = {
    share: `Best: 1200 × 630 px (landscape). Keep the important part in the centre, because some apps crop it to a square. WhatsApp may skip pictures larger than about 300 KB. ${FILE_NOTE}`,
    attire: `Best: 1200 × 900 px (landscape) or 1200 × 1500 px (portrait). Shown across the full width of the card. ${FILE_NOTE}`,
    qr: `Best: a square image, at least 600 × 600 px, cropped close to the QR code so it scans easily. ${FILE_NOTE}`,
    gift: `Best: a square image, about 600 × 600 px. Other shapes are cropped to a square from the centre. ${FILE_NOTE}`,
    cover: `Optional. Best: a portrait photo, 900 × 1600 px (9:16), with the subject in the centre because the edges are cropped to fit each screen. Shown behind the names, tinted with the cover colour. ${FILE_NOTE}`,
    frame: `Used when the frame is set to "My own image". Best: a transparent PNG, 900 × 1600 px (9:16), with the decoration around the edges and the middle left empty. It is stretched over the whole welcome section. ${FILE_NOTE}`,
  };

  const HOST_HINT = 'Add one entry per person, or put a couple in one entry (for example "Ahmad bin Abdullah & Siti binti Hassan"). The description shows in small text under that name, for example "Isteri kepada Allahyarham Omar bin Ali".';

  const CONTENT = [
    {
      title: 'Languages',
      fields: [
        F('language.enabled', 'Offer the card in Bahasa Malaysia and English', 'toggle'),
        F('language.default', 'Language shown first', 'select', { options: [['ms', 'Bahasa Malaysia'], ['en', 'English']], hint: 'Guests switch with the BM / EN button at the top of the card. When the option above is off, the card is shown only in this language.' }),
      ],
      note: 'To write the English text, choose "English" at the top of this tab.',
    },
    {
      title: 'Couple',
      fields: [
        F('couple.groomShort', 'Groom — short name'),
        F('couple.brideShort', 'Bride — short name'),
        F('couple.groomFull', 'Groom — full name'),
        F('couple.brideFull', 'Bride — full name'),
        F('couple.order', 'Name order', 'select', { options: [['groom-first', 'Groom first'], ['bride-first', 'Bride first']] }),
      ],
    },
    {
      title: 'Opening cover',
      fields: [F('cover.topText', 'Top text'), F('cover.buttonText', 'Open button text'), F('cover.subText', 'Bottom text')],
    },
    {
      title: 'Welcome & invitation',
      fields: [
        F('hero.bismillah', 'Bismillah'),
        F('hero.title', 'Title'),
        F('hero.tagline', 'Tagline'),
        F('invite.greeting', 'Greeting'),
        F('invite.groomHosts', "Groom's parents / hosts", 'list', { item: [['name', 'Name'], ['note', 'Small description under the name (optional)', 'text', true]], add: "Add a host on the groom's side", hint: HOST_HINT }),
        F('invite.brideHosts', "Bride's parents / hosts", 'list', { item: [['name', 'Name'], ['note', 'Small description under the name (optional)', 'text', true]], add: "Add a host on the bride's side", hint: HOST_HINT }),
        F('invite.hostsJoin', 'Symbol between names of the same family', 'text', { hint: 'Usually "&". Leave empty to show the names on separate lines with nothing between them.' }),
        F('invite.hostsBetween', 'Word between the two families', 'text', { hint: 'For example "bersama". Leave empty for none.' }),
        F('invite.groomHostsLabel', "Small heading above the groom's side (optional)"),
        F('invite.brideHostsLabel', "Small heading above the bride's side (optional)"),
        F('invite.hosts', 'Hosts as one block of text (older style)', 'textarea', { hint: 'Only shown when both host lists above are empty.' }),
        F('invite.text', 'Invitation text', 'textarea'),
        F('invite.closing', 'Closing text', 'textarea'),
        F('invite.verse', 'Verse / doa', 'textarea'),
      ],
    },
    {
      title: 'Event details',
      fields: [
        F('event.title', 'Section title'),
        F('event.date', 'Date', 'date'),
        F('event.startTime', 'Start time', 'time'),
        F('event.endTime', 'End time', 'time'),
        F('event.dateText', 'Date as displayed', 'text', { hint: 'Leave empty to show the date automatically in Malay.' }),
        F('event.timeText', 'Time as displayed'),
        F('event.hijriDate', 'Hijri date'),
        F('event.venueName', 'Venue name'),
        F('event.address', 'Address', 'textarea'),
        F('event.googleMapsUrl', 'Google Maps link', 'url', { hint: 'Optional. Leave empty to search by venue name and address.' }),
        F('event.wazeUrl', 'Waze link', 'url', { hint: 'Optional. Leave empty to search by venue name and address.' }),
        F('event.showCountdown', 'Show countdown', 'toggle'),
        F('event.countdownTitle', 'Countdown title'),
      ],
    },
    {
      title: 'Aturcara (programme)',
      fields: [
        F('event.itineraryTitle', 'Section title'),
        F('event.itinerary', 'Programme', 'list', { item: [['time', 'Time', 'text', true], ['label', 'Activity', 'text', true]], add: 'Add programme item' }),
      ],
    },
    {
      title: 'Attire theme',
      fields: [
        F('attire.enabled', 'Show this section', 'toggle'),
        F('attire.title', 'Section title'),
        F('attire.description', 'Description', 'textarea'),
        F('attire.colors', 'Theme colours', 'list', { item: [['hex', 'Colour', 'color'], ['name', 'Name', 'text', true]], add: 'Add colour', blank: { hex: '#c9a24b' } }),
        F('attire.image', 'Attire reference image', 'image', { hint: SIZES.attire }),
        F('attire.notes', 'Dress code notes', 'textarea'),
      ],
    },
    {
      title: 'RSVP',
      fields: [
        F('rsvp.enabled', 'Show this section', 'toggle'),
        F('rsvp.title', 'Section title'),
        F('rsvp.description', 'Description', 'textarea'),
        F('rsvp.deadline', 'RSVP closes after', 'date', { hint: 'Leave empty to keep RSVP open.' }),
        F('rsvp.maxPax', 'Maximum guests per RSVP', 'number', { min: 1, max: 50 }),
        F('rsvp.successTitle', 'Thank-you title'),
        F('rsvp.successText', 'Thank-you text', 'textarea'),
        F('rsvp.closedText', 'Text shown when RSVP is closed', 'textarea'),
      ],
    },
    {
      title: 'Wishes',
      fields: [
        F('wishes.enabled', 'Show this section', 'toggle'),
        F('wishes.title', 'Section title'),
        F('wishes.description', 'Description', 'textarea'),
        F('wishes.emptyText', 'Text when there are no wishes yet'),
        F('wishes.speed', 'Scrolling speed', 'range', { min: 10, max: 100, step: 5 }),
      ],
    },
    {
      title: 'Salam kaut (money gift)',
      fields: [
        F('moneyGift.enabled', 'Show this section', 'toggle'),
        F('moneyGift.title', 'Section title'),
        F('moneyGift.description', 'Description', 'textarea'),
        F('moneyGift.bankName', 'Bank'),
        F('moneyGift.accountName', 'Account name'),
        F('moneyGift.accountNumber', 'Account number'),
        F('moneyGift.qrImage', 'QR code image', 'image', { hint: SIZES.qr }),
        F('moneyGift.qrCaption', 'QR caption'),
      ],
    },
    {
      title: 'Gift registry text',
      fields: [
        F('registry.enabled', 'Show this section', 'toggle'),
        F('registry.title', 'Section title'),
        F('registry.description', 'Description', 'textarea'),
        F('registry.emptyText', 'Text when the list is empty'),
        F('registry.autoSeconds', 'Seconds before the gift list turns to the next page', 'number', { min: 0, max: 60, hint: 'The list is split into pages of 4 once there are more than 4 gifts. Enter 0 to stop it turning by itself; guests can still use the arrows.' }),
      ],
      note: 'Add and manage the gifts themselves in the Gifts tab.',
    },
    {
      title: 'Thank you & family contacts',
      fields: [
        F('thanks.enabled', 'Show this section', 'toggle'),
        F('thanks.title', 'Section title'),
        F('thanks.text', 'Message', 'textarea'),
        F('thanks.signature', 'Signature line'),
        F('thanks.hashtag', 'Hashtag'),
        F('thanks.buttonText', 'Contact button text'),
        F('thanks.contactsTitle', 'Contact list title'),
        F('thanks.contacts', 'Family contacts', 'list', { item: [['name', 'Name'], ['role', 'Relationship', 'text', true], ['phone', 'Phone']], add: 'Add contact' }),
      ],
    },
    {
      title: 'Link preview (WhatsApp, Telegram, Facebook)',
      note: 'The title, description and picture that appear when the card link is shared in a chat or on social media. Apps keep a copy of the preview, so a link that was already shared can take a while to show changes.',
      fields: [
        F('share.title', 'Preview title', 'text', { hint: 'Leave empty to use the card title and the couple names, for example "Walimatul Urus: Adam & Hawa".' }),
        F('share.description', 'Preview description', 'textarea', { hint: 'One or two short sentences. Most apps show about 100 to 150 characters.' }),
        F('share.image', 'Preview picture', 'image', { hint: SIZES.share }),
      ],
    },
    {
      title: 'Footer "design by" note',
      fields: [
        F('footer.enabled', 'Show this note at the bottom of the card', 'toggle'),
        F('footer.text', 'Note', 'text', { hint: 'For example: Design by Aina Studio.' }),
        F('footer.link', 'Link when the note is tapped', 'url', { hint: 'Optional. A website, Instagram or WhatsApp link (https://…).' }),
      ],
    },
    {
      title: 'Background music',
      fields: [
        F('music.url', 'Music', 'audio', { hint: 'Optional. Upload an MP3, M4A, OGG or WAV file (up to 20 MB) to store it with the card, or paste a direct https link to an audio file. Best: MP3 at 128 kbps, which plays on every phone and keeps a 4-minute song under 4 MB.' }),
        F('music.autoplay', 'Start playing when the card is opened', 'toggle'),
      ],
    },
  ];

  const humanize = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

  const DESIGN = [
    {
      title: 'Colour theme',
      open: true,
      fields: [
        F('design.theme', 'Theme', 'theme'),
        F('design.custom.enabled', 'Use my own colours instead', 'toggle'),
        F('design.custom.primary', 'Main colour', 'color'),
        F('design.custom.accent', 'Accent colour', 'color'),
        F('design.custom.bg', 'Background', 'color'),
        F('design.custom.surface', 'Panels', 'color'),
        F('design.custom.text', 'Text', 'color'),
      ],
    },
    {
      title: 'Fonts',
      open: true,
      fields: [
        F('design.fontScript', 'Couple names', 'select', { options: fontOptions('script') }),
        F('design.fontHeading', 'Headings', 'select', { options: fontOptions('heading') }),
        F('design.fontBody', 'Body text', 'select', { options: fontOptions('body') }),
        F('design.bodyWeight', 'Body text thickness', 'select', { options: pairs(KK.BODY_WEIGHTS), hint: 'How bold the normal text is. Some fonts have no Medium and show Regular instead.' }),
      ],
    },
    {
      title: 'Background pattern',
      open: true,
      fields: [F('design.pattern', 'Pattern', 'pattern'), F('design.patternOpacity', 'Pattern strength', 'range', { min: 0, max: 0.4, step: 0.02 })],
    },
    {
      title: 'Opening card',
      open: true,
      fields: [
        F('design.coverDesign', 'Cover design', 'select', { options: pairs(KK.COVER_DESIGNS), replay: true }),
        F('design.coverTone', 'Cover colour', 'select', { options: pairs(KK.COVER_TONES), replay: true }),
        F('design.sealStyle', 'Open button style', 'select', { options: pairs(KK.SEAL_STYLES), replay: true }),
        F('design.opening', 'Opening animation', 'select', { options: pairs(KK.OPENINGS), replay: true }),
        F('design.coverImage', 'Cover background photo', 'image', { hint: SIZES.cover }),
      ],
    },
    {
      title: 'Welcome section',
      open: true,
      fields: [
        F('design.heroShape', 'Background shape', 'select', { options: pairs(KK.HERO_SHAPES) }),
        F('design.heroTextColor', 'Text colour', 'select', { options: pairs(KK.HERO_TEXT_COLORS), hint: 'All the text in the welcome section uses this one colour.' }),
        F('design.nameHighlight', 'Highlight behind the hosts and couple names (invitation)', 'select', { options: pairs(KK.NAME_HIGHLIGHTS) }),
        F('design.heroFrame', 'Decorative frame', 'select', { options: pairs(KK.HERO_FRAMES) }),
        F('design.frameColor', 'Flower colour', 'color'),
        F('design.heroFrameImage', 'My own frame image', 'image', { hint: SIZES.frame }),
      ],
    },
    {
      title: 'Songket strips',
      open: true,
      fields: [
        F('design.songket', 'Songket motif', 'select', { options: pairs(KK.SONGKETS), hint: 'A woven band across the card, in the dark colour of your theme with the motif in the accent colour.' }),
        F('design.songketPlace', 'Where to show it', 'select', { options: pairs(KK.SONGKET_PLACES) }),
      ],
    },
    {
      title: 'Effects & animation',
      open: true,
      fields: [
        F('design.effect', 'Floating effect', 'select', { options: pairs(KK.EFFECTS) }),
        F('design.scrollAnimation', 'Scroll animation', 'select', { options: pairs(KK.SCROLL_ANIMATIONS) }),
      ],
    },
  ];

  // ------------------------------------------------------------ fields
  function changed() {
    dirty = true;
    $('#save').disabled = false;
    $('#status').textContent = 'Unsaved changes';
    schedulePreview();
  }

  function row(label, control, hint) {
    // Composite controls (image upload) must not sit inside a <label>.
    return h(control.matches('input, select, textarea') ? 'label' : 'div', { class: 'field' }, h('span', { class: 'label', text: label }), control, hint && h('small', { text: hint }));
  }

  // A field bound to `obj[key]`.
  function control(def, obj, key) {
    const value = obj[key];
    const write = (v) => {
      obj[key] = v;
      changed();
    };
    switch (def.type) {
      case 'textarea':
        return h('textarea', { rows: 3, value, oninput: (e) => write(e.target.value) });
      case 'toggle':
        return h('input', { type: 'checkbox', class: 'switch', checked: !!value, onchange: (e) => write(e.target.checked) });
      case 'select':
        return h(
          'select',
          {
            onchange: (e) => {
              write(e.target.value);
              if (def.replay) replayOpening();
            },
          },
          def.options.map(([v, label]) => h('option', { value: v, text: label, selected: v === value }))
        );
      case 'number':
        return h('input', { type: 'number', min: def.min, max: def.max, value, oninput: (e) => write(Number(e.target.value)) });
      case 'range':
        return h('input', { type: 'range', min: def.min, max: def.max, step: def.step, value, oninput: (e) => write(Number(e.target.value)) });
      case 'color':
        return colorControl(value, write);
      case 'audio':
        return audioControl(value, write);
      case 'image':
        return imageControl(value, write);
      default:
        return h('input', { type: def.type, value, oninput: (e) => write(e.target.value) });
    }
  }

  // A colour swatch paired with a hex box; either one updates the other.
  function colorControl(value, write) {
    const normalise = (v) => {
      v = String(v || '').trim().replace(/^#?/, '#');
      if (/^#[0-9a-f]{3}$/i.test(v)) v = '#' + [...v.slice(1)].map((c) => c + c).join('');
      return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : null;
    };
    const start = normalise(value) || '#000000';
    const text = h('input', { type: 'text', class: 'hex', value: start, maxlength: 7, spellcheck: 'false', autocomplete: 'off', placeholder: '#c9a24b', 'aria-label': 'Hex colour code' });
    const swatch = h('input', { type: 'color', value: start, 'aria-label': 'Pick a colour' });
    swatch.addEventListener('input', () => {
      text.value = swatch.value;
      text.classList.remove('bad');
      write(swatch.value);
    });
    text.addEventListener('input', () => {
      const hex = normalise(text.value);
      text.classList.toggle('bad', !hex);
      if (!hex) return;
      swatch.value = hex;
      write(hex);
    });
    text.addEventListener('blur', () => {
      text.value = normalise(text.value) || swatch.value;
      text.classList.remove('bad');
    });
    return h('div', { class: 'color-field' }, swatch, text);
  }

  // Upload a music file to the server, or paste a link; the player previews either.
  function audioControl(value, write) {
    const MAX = 20 * 1024 * 1024;
    const link = h('input', { type: 'url', value, placeholder: 'https://… or upload a file' });
    const player = h('audio', { controls: true, preload: 'none' });
    const input = h('input', { type: 'file', accept: '.mp3,.m4a,.ogg,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/wav', hidden: true });
    const remove = h('button', { type: 'button', text: 'Remove' });
    const note = h('small');
    const show = (url) => {
      const safe = KK.safeUrl(url);
      player.hidden = remove.hidden = !safe;
      note.textContent = safe.startsWith('/uploads/') ? 'Stored on your hosting.' : '';
      if (safe) player.src = safe;
      else player.removeAttribute('src');
    };
    show(value);
    link.addEventListener('input', () => {
      write(link.value.trim());
      show(link.value);
    });
    const pick = h('button', { type: 'button', text: 'Upload music file', onclick: () => input.click() });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      // Some systems report no type for audio files; fall back to the extension.
      const byExt = { mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav' }[file.name.split('.').pop().toLowerCase()];
      const type = file.type.startsWith('audio/') ? file.type : byExt;
      const body = new Blob([file], { type: type || '' });
      input.value = '';
      if (body.size > MAX) return toast('That file is too large (20 MB maximum for music).');
      if (!type) return toast(ERRORS.unsupported_audio);
      pick.disabled = true;
      pick.textContent = 'Uploading…';
      try {
        const { url } = await api('POST', '/api/admin/upload', body);
        link.value = url;
        write(url);
        show(url);
        toast('Music uploaded. Press "Save changes" to use it on the card.');
      } catch (err) {
        toast(err.message);
      } finally {
        pick.disabled = false;
        pick.textContent = 'Upload music file';
      }
    });
    remove.addEventListener('click', () => {
      link.value = '';
      write('');
      show('');
    });
    return h('div', { class: 'image-field audio-field' }, link, player, h('div', { class: 'row' }, pick, remove, note), input);
  }

  function imageControl(value, write) {
    const thumb = h('img', { class: 'thumb', alt: '' });
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', hidden: true });
    const remove = h('button', { type: 'button', text: 'Remove' });
    const show = (url) => {
      const safe = KK.safeUrl(url);
      thumb.hidden = remove.hidden = !safe;
      if (safe) thumb.src = safe;
    };
    show(value);
    const pick = h('button', { type: 'button', text: 'Upload image', onclick: () => input.click() });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      pick.disabled = true;
      pick.textContent = 'Uploading…';
      try {
        const { url } = await api('POST', '/api/admin/upload', await shrinkImage(file));
        write(url);
        show(url);
      } catch (err) {
        toast(err.message);
      } finally {
        pick.disabled = false;
        pick.textContent = 'Upload image';
        input.value = '';
      }
    });
    remove.addEventListener('click', () => {
      write('');
      show('');
    });
    return h('div', { class: 'image-field' }, thumb, h('div', { class: 'row' }, pick, remove), input);
  }

  // Phone photos are far larger than a card needs; scale them down first.
  async function shrinkImage(file) {
    const MAX = 1600;
    if (file.type === 'image/gif' || !window.createImageBitmap) return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 800e3) return file;
    const canvas = h('canvas', { width: Math.round(bmp.width * scale), height: Math.round(bmp.height * scale) });
    const ctx = canvas.getContext('2d');
    // PNG and WebP keep their format so transparent frames stay transparent.
    const type = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg';
    if (type === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || file), type, 0.88));
  }

  // English view of a list: one box per translatable column, with the Malay
  // text as a reminder. Items are added, removed and reordered in the Malay view.
  function listControlEn(def, list) {
    const columns = def.item.filter((column) => column[3]);
    if (!list.length) return h('p', { class: 'note', text: 'Nothing to translate yet. Add items in the Bahasa Malaysia view first.' });
    return h(
      'div',
      { class: 'list' },
      list.map((item) =>
        h(
          'div',
          { class: 'list-item' },
          columns.map(([key, label]) => {
            if (item[`${key}En`] === undefined) item[`${key}En`] = '';
            const input = control({ type: 'text' }, item, `${key}En`);
            input.placeholder = item[key] || '';
            return h('label', null, h('span', { text: `${label} — BM: ${item[key] || '(empty)'}` }), input);
          })
        )
      )
    );
  }

  function listControl(def, list) {
    if (editLang === 'en') return listControlEn(def, list);
    const wrap = h('div', { class: 'list' });
    const draw = () => {
      wrap.replaceChildren(
        ...list.map((item, i) =>
          h(
            'div',
            { class: 'list-item' },
            def.item.map(([key, label, type]) => h('label', { class: type === 'color' ? 'narrow' : '' }, h('span', { text: label }), control({ type: type || 'text' }, item, key))),
            h(
              'div',
              { class: 'list-tools' },
              h('button', { type: 'button', title: 'Move up', text: '↑', disabled: i === 0, onclick: () => move(i, -1) }),
              h('button', { type: 'button', title: 'Move down', text: '↓', disabled: i === list.length - 1, onclick: () => move(i, 1) }),
              h('button', { type: 'button', title: 'Remove', class: 'danger', text: '✕', onclick: () => (list.splice(i, 1), draw(), changed()) })
            )
          )
        ),
        h('button', {
          type: 'button',
          class: 'add',
          text: `+ ${def.add}`,
          onclick: () => {
            list.push({ ...Object.fromEntries(def.item.flatMap(([key, , , tr]) => (tr ? [[key, ''], [`${key}En`, '']] : [[key, '']]))), ...def.blank });
            draw();
            changed();
          },
        })
      );
    };
    const move = (i, by) => {
      list.splice(i + by, 0, list.splice(i, 1)[0]);
      draw();
      changed();
    };
    draw();
    return wrap;
  }

  function pickerControl(def, obj, key) {
    const isTheme = def.type === 'theme';
    const wrap = h('div', { class: `picker ${def.type}` });
    const entries = Object.entries(isTheme ? KK.THEMES : KK.PATTERNS);
    wrap.append(
      ...entries.map(([id, item]) => {
        const btn = h('button', { type: 'button', class: obj[key] === id ? 'on' : '', title: item.name });
        if (isTheme) {
          btn.append(
            h('span', { class: 'chips' }, ['primary', 'accent', 'bg'].map((c) => h('i', { style: `background:${item[c]}` }))),
            h('span', { text: item.name })
          );
        } else {
          btn.append(h('i', { class: 'tile', style: `background-image:${KK.patternUrl(id, '#8a6d2f')}` }), h('span', { text: item.name }));
        }
        btn.addEventListener('click', () => {
          obj[key] = id;
          for (const b of $$('button', wrap)) b.classList.toggle('on', b === btn);
          changed();
        });
        return btn;
      })
    );
    return wrap;
  }

  // In the English view only text that has an English version is shown.
  const hasEnglish = (def) => (def.type === 'list' ? def.item.some((column) => column[3]) : typeof get(draft.config.en, def.path) === 'string');

  function fieldEl(def) {
    const keys = def.path.split('.');
    const key = keys.pop();
    if (editLang === 'en' && def.path.split('.')[0] !== 'design' && def.type !== 'list') {
      if (!hasEnglish(def)) return null;
      const malay = String(get(draft.config, def.path) || '');
      const input = control(def, get(draft.config.en, keys.join('.')), key);
      input.placeholder = malay;
      const auto = def.path === 'event.dateText' || def.path === 'event.timeText' ? 'Leave empty to write it out automatically in English.' : 'Leave empty to use the Bahasa Malaysia text.';
      return row(def.label, input, `${auto} BM: ${malay.length > 140 ? malay.slice(0, 140) + '…' : malay || '(empty)'}`);
    }
    const obj = get(draft.config, keys.join('.'));
    if (def.type === 'list') return h('div', { class: 'field' }, h('span', { class: 'label', text: def.label }), listControl(def, obj[key]), def.hint && editLang === 'ms' && h('small', { text: def.hint }));
    if (def.type === 'theme' || def.type === 'pattern') return h('div', { class: 'field' }, h('span', { class: 'label', text: def.label }), pickerControl(def, obj, key));
    const el = row(def.label, control(def, obj, key), def.hint);
    if (def.path === 'design.coverImage') el.addEventListener('click', () => setTimeout(replayOpening, 200));
    if (def.type === 'toggle') el.classList.add('inline');
    return el;
  }

  function groups(list) {
    return list.map((g, i) => {
      const fields = g.fields.map(fieldEl).filter(Boolean);
      if (!fields.length) return null; // nothing in this group for the language being edited
      return h('details', { class: 'group', open: g.open || i === 0 }, h('summary', { text: g.title }), h('div', { class: 'group-body' }, g.note && editLang === 'ms' && h('p', { class: 'note', text: g.note }), fields));
    }).filter(Boolean);
  }

  // -------------------------------------------------------------- tabs
  function renderContent() {
    const labels = {
      title: 'Labels & button text',
      note: 'Every small label, button and message shown to guests.',
      fields: Object.keys(draft.config.labels).map((key) => F(`labels.${key}`, humanize(key))),
    };
    const tab = (code, text) =>
      h('button', {
        type: 'button',
        class: editLang === code ? 'on' : '',
        text,
        onclick: () => {
          editLang = code;
          show('content');
          sendPreview();
        },
      });
    const list = editLang === 'en' ? CONTENT.filter((g) => g.fields.some(hasEnglish)) : CONTENT;
    return [
      h(
        'div',
        { class: 'lang-bar' },
        h('span', { class: 'label', text: 'Editing text in' }),
        h('div', { class: 'seg-tabs' }, tab('ms', 'Bahasa Malaysia'), tab('en', 'English')),
        h('small', {
          text: editLang === 'en' ? 'English wording only. Dates, links, photos and on/off switches are shared, so they are edited in the Bahasa Malaysia view.' : 'This is the main text of the card.',
        })
      ),
      ...groups([...list, labels]),
    ];
  }

  // One slider per piece of text, grouped by where it appears on the card.
  function renderSizes() {
    const sizes = draft.config.design.fontSizes;
    const redraw = () => show('sizes');
    const changedCount = (items) => items.filter(([key]) => sizes[key] !== 100).length;
    const sizeRow = ([key, label]) => {
      const out = h('output', { text: `${sizes[key]}%` });
      const reset = h('button', { type: 'button', class: 'linkish', text: 'Reset', hidden: sizes[key] === 100 });
      const slider = h('input', { type: 'range', min: KK.FONT_SIZE_MIN, max: KK.FONT_SIZE_MAX, step: 5, value: sizes[key], 'aria-label': `${label} size` });
      const apply = (value) => {
        sizes[key] = value;
        slider.value = value;
        out.textContent = `${value}%`;
        reset.hidden = value === 100;
        changed();
      };
      slider.addEventListener('input', () => apply(Number(slider.value)));
      reset.addEventListener('click', () => apply(100));
      return h('div', { class: 'size-row' }, h('span', { class: 'label', text: label }), slider, out, reset);
    };
    return [
      h(
        'div',
        { class: 'head row between' },
        h('div', null, h('h2', { text: 'Text size' }), h('p', { text: '100% is the designed size. Drag a slider to make that text smaller or larger.' })),
        h('button', {
          type: 'button',
          text: 'Reset all sizes',
          onclick: () => {
            if (!confirm('Put every text size back to 100%?')) return;
            for (const key of Object.keys(sizes)) sizes[key] = 100;
            changed();
            redraw();
          },
        })
      ),
      ...KK.FONT_SIZES.map((group, i) => {
        const count = changedCount(group.items);
        return h(
          'details',
          { class: 'group', open: i === 0 || count > 0 },
          h('summary', null, group.title, count ? h('span', { class: 'count', text: `${count} changed` }) : null),
          h(
            'div',
            { class: 'group-body' },
            group.cover && h('button', { type: 'button', text: 'Show the cover in the preview', onclick: replayOpening }),
            group.items.map(sizeRow)
          )
        );
      }),
    ];
  }

  function renderGifts() {
    const list = draft.gifts;
    const redraw = () => $('#editor').replaceChildren(...renderGifts());
    return [
      h('div', { class: 'head' }, h('h2', { text: 'Gift registry' }), h('p', { text: 'Guests can reserve one of these gifts so nobody buys the same thing twice.' })),
      ...list.map((gift, i) => {
        const reserved = gift.reservedBy && !gift.unreserve;
        return h(
          'div',
          { class: 'group gift-edit' },
          h(
            'div',
            { class: 'group-body' },
            row('Gift name', control({ type: 'text' }, gift, 'name')),
            row('Description', control({ type: 'text' }, gift, 'description')),
            row('Gift name in English', control({ type: 'text' }, gift, 'nameEn'), 'Leave empty to use the name above.'),
            row('Description in English', control({ type: 'text' }, gift, 'descriptionEn'), 'Leave empty to use the description above.'),
            row('Price', control({ type: 'text' }, gift, 'price')),
            row('Shop link', control({ type: 'url' }, gift, 'link'), 'Optional. Guests see a "view item" link.'),
            row('Photo', control({ type: 'image' }, gift, 'image'), SIZES.gift),
            h(
              'div',
              { class: 'row between' },
              reserved
                ? h(
                    'span',
                    { class: 'tag ok' },
                    `Reserved by ${gift.reservedBy.name} (${gift.reservedBy.phone}) `,
                    h('button', { type: 'button', class: 'linkish', text: 'Release', onclick: () => ((gift.unreserve = true), changed(), redraw()) })
                  )
                : h('span', { class: 'tag', text: 'Available' }),
              h('button', {
                type: 'button',
                class: 'danger',
                text: 'Delete gift',
                onclick: () => {
                  if (reserved && !confirm('This gift is reserved by a guest. Delete it anyway?')) return;
                  list.splice(i, 1);
                  changed();
                  redraw();
                },
              })
            )
          )
        );
      }),
      h('button', {
        type: 'button',
        class: 'add',
        text: '+ Add gift',
        onclick: () => {
          list.push({ name: '', description: '', nameEn: '', descriptionEn: '', price: '', link: '', image: '', reservedBy: null });
          changed();
          redraw();
        },
      }),
    ];
  }

  function renderRsvps() {
    const attending = rsvps.filter((r) => r.attending);
    const stat = (n, label) => h('div', { class: 'stat' }, h('b', { text: String(n) }), h('span', { text: label }));
    const body = h('tbody');
    const fill = (q) => {
      q = q.trim().toLowerCase();
      const rows = rsvps
        .filter((r) => !q || `${r.name} ${r.phone} ${r.wish}`.toLowerCase().includes(q))
        .slice()
        .reverse()
        .map((r) =>
          h(
            'tr',
            null,
            h('td', { text: r.name }),
            h('td', { text: r.phone }),
            h('td', null, h('span', { class: `tag ${r.attending ? 'ok' : 'no'}`, text: r.attending ? 'Attending' : 'Not attending' })),
            h('td', { class: 'num', text: r.attending ? String(r.pax) : '–' }),
            h(
              'td',
              { class: `wish${r.wishHidden ? ' hidden-wish' : ''}` },
              r.wish,
              r.wish && h('button', { type: 'button', class: 'linkish', text: r.wishHidden ? 'Show on card' : 'Hide from card', onclick: () => rsvpAction('PATCH', r.id, { wishHidden: !r.wishHidden }) })
            ),
            h('td', { text: new Date(r.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) }),
            h('td', null, h('button', { type: 'button', class: 'danger', text: 'Delete', onclick: () => confirm(`Delete the RSVP from ${r.name}?`) && rsvpAction('DELETE', r.id) }))
          )
        );
      body.replaceChildren(...(rows.length ? rows : [h('tr', null, h('td', { colspan: 7, class: 'empty', text: rsvps.length ? 'No matches.' : 'No RSVPs yet.' }))]));
    };
    fill('');
    return [
      h(
        'div',
        { class: 'head row between' },
        h('h2', { text: 'RSVPs' }),
        h('a', { class: 'button primary', href: '/api/admin/export.xlsx', text: 'Export to Excel' })
      ),
      h(
        'div',
        { class: 'stats' },
        stat(rsvps.length, 'Responses'),
        stat(attending.reduce((n, r) => n + r.pax, 0), 'Guests attending'),
        stat(rsvps.length - attending.length, 'Not attending'),
        stat(rsvps.filter((r) => r.wish).length, 'Wishes')
      ),
      h('input', { type: 'search', class: 'search', placeholder: 'Search name, phone or wish…', oninput: (e) => fill(e.target.value) }),
      h(
        'div',
        { class: 'table-wrap' },
        h('table', null, h('thead', null, h('tr', null, ['Name', 'Phone', 'Attendance', 'Pax', 'Wish', 'Submitted', ''].map((t) => h('th', { text: t })))), body)
      ),
    ];
  }

  async function rsvpAction(method, id, body) {
    try {
      const state = await api(method, `/api/admin/rsvps/${id}`, body);
      rsvps = state.rsvps;
      updateCounts();
      show('rsvps');
    } catch (err) {
      toast(err.message);
    }
  }

  function renderSettings() {
    const link = location.origin + '/';
    const form = h(
      'form',
      {
        class: 'group-body',
        onsubmit: async (e) => {
          e.preventDefault();
          const f = e.target.elements;
          if (f.next.value !== f.again.value) return toast('The new passwords do not match.');
          try {
            await api('POST', '/api/admin/password', { current: f.current.value, next: f.next.value });
            e.target.reset();
            $('#pwBanner').hidden = true;
            toast('Password changed.');
          } catch (err) {
            toast(err.message);
          }
        },
      },
      row('Current password', h('input', { type: 'password', name: 'current', required: true, autocomplete: 'current-password' })),
      row('New password', h('input', { type: 'password', name: 'next', required: true, minlength: 8, autocomplete: 'new-password' })),
      row('Repeat new password', h('input', { type: 'password', name: 'again', required: true, minlength: 8, autocomplete: 'new-password' })),
      h('button', { class: 'primary', type: 'submit', text: 'Change password' })
    );
    return [
      h(
        'div',
        { class: 'group' },
        h('div', { class: 'group-body' }, h('h3', { text: 'Share your card' }), h('p', { class: 'note', text: 'Send this link to your guests.' }),
          h('div', { class: 'row' }, h('input', { type: 'text', readonly: true, value: link }), h('button', { type: 'button', text: 'Copy link', onclick: () => navigator.clipboard.writeText(link).then(() => toast('Link copied.')) })))
      ),
      h('div', { class: 'group' }, h('div', { class: 'group-body' }, h('h3', { text: 'Admin password' })), form),
      h(
        'div',
        { class: 'group' },
        h('div', { class: 'group-body' }, h('button', { type: 'button', text: 'Sign out', onclick: async () => (await api('POST', '/api/admin/logout', {}), (dirty = false), location.reload()) }))
      ),
    ];
  }

  const TABS = { content: renderContent, design: () => groups(DESIGN), sizes: renderSizes, gifts: renderGifts, rsvps: renderRsvps, settings: renderSettings };
  const WITH_PREVIEW = ['content', 'design', 'sizes', 'gifts'];

  function show(next) {
    tab = next;
    for (const b of $$('#tabs button')) b.classList.toggle('on', b.dataset.tab === tab);
    $('#layout').classList.toggle('no-preview', !WITH_PREVIEW.includes(tab));
    $('#editor').replaceChildren(...TABS[tab]());
  }

  function updateCounts() {
    $('#rsvpCount').textContent = rsvps.length ? String(rsvps.length) : '';
  }

  // ----------------------------------------------------------- preview
  const frame = $('#frame');
  let previewTimer;
  function sendPreview() {
    if (draft && frame.contentWindow) frame.contentWindow.postMessage({ type: 'kk-preview', config: draft.config, gifts: draft.gifts, lang: tab === 'content' ? editLang : undefined }, location.origin);
  }
  function schedulePreview() {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(sendPreview, 120);
  }
  function replayOpening() {
    sendPreview();
    frame.contentWindow.postMessage({ type: 'kk-replay' }, location.origin);
  }
  addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data && e.data.type === 'kk-preview-ready') sendPreview();
  });
  $('#replay').addEventListener('click', replayOpening);

  // ------------------------------------------------------------- start
  function adopt(state) {
    draft = { config: clone(state.config), gifts: clone(state.gifts) };
    rsvps = state.rsvps;
    dirty = false;
    $('#save').disabled = true;
    $('#status').textContent = '';
    $('#pwBanner').hidden = !state.defaultPassword;
    updateCounts();
  }

  $('#save').addEventListener('click', async () => {
    const btn = $('#save');
    btn.disabled = true;
    $('#status').textContent = 'Saving…';
    try {
      const config = draft.config;
      const sent = JSON.stringify(config);
      adopt(await api('PUT', '/api/admin/state', draft));
      // The fields and sliders on screen write into the object they were built
      // from. Keep that object, or everything edited after a save would go
      // into a discarded copy: no preview change and nothing saved.
      draft.config = config;
      $('#status').textContent = 'Saved';
      if (tab === 'gifts') show('gifts'); // new gifts now have ids
      if (JSON.stringify(config) !== sent) changed(); // edited while the save was in flight
      sendPreview();
    } catch (err) {
      btn.disabled = false;
      $('#status').textContent = 'Unsaved changes';
      toast(err.message);
    }
  });

  $('#tabs').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.tab === 'rsvps') {
      // RSVPs arrive while the panel is open; fetch the latest on each visit.
      try {
        rsvps = (await api('GET', '/api/admin/state')).rsvps;
        updateCounts();
      } catch {
        /* show what we have */
      }
    }
    show(btn.dataset.tab);
  });

  addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });

  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
  }

  $('#login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const error = $('#loginError');
    error.hidden = true;
    try {
      await api('POST', '/api/admin/login', { password: e.target.elements.password.value });
      e.target.reset();
      start();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });

  async function start() {
    let state;
    try {
      state = await api('GET', '/api/admin/state');
    } catch {
      return; // not signed in: the login form is showing
    }
    adopt(state);
    KK.loadFonts([...KK.FONTS.heading, ...KK.FONTS.script, ...KK.FONTS.body]);
    $('#login').hidden = true;
    $('#app').hidden = false;
    show(tab);
    sendPreview();
  }

  start();
})();
