'use strict';

// Design catalogue shared by the card and the admin panel.
window.KK = (function () {
  const THEMES = {
    emerald: { name: 'Emerald & Gold', primary: '#0f4c3a', accent: '#c9a24b', bg: '#f7f3e9', surface: '#fffdf7', text: '#23302b' },
    blush: { name: 'Blush Rose', primary: '#8c4a5a', accent: '#c99a6b', bg: '#fbf1ef', surface: '#fffaf8', text: '#3d2a2e' },
    navy: { name: 'Royal Navy', primary: '#1b2a4a', accent: '#c8a558', bg: '#f4f1ea', surface: '#fffefb', text: '#1f2738' },
    maroon: { name: 'Maroon Songket', primary: '#6b1e2b', accent: '#d1a84a', bg: '#f8f0e6', surface: '#fffaf3', text: '#33201f' },
    sage: { name: 'Sage & Cream', primary: '#5c7360', accent: '#b8935a', bg: '#f3f1e7', surface: '#fcfbf5', text: '#2e3830' },
    lilac: { name: 'Lilac Dusk', primary: '#5b4a7a', accent: '#c4a167', bg: '#f5f1f8', surface: '#fdfbff', text: '#2d2738' },
    terracotta: { name: 'Terracotta', primary: '#9a4f33', accent: '#c79a56', bg: '#f9f0e6', surface: '#fffaf4', text: '#3a2a22' },
    midnight: { name: 'Midnight Gold', primary: '#dcc07a', accent: '#c9a24b', bg: '#101820', surface: '#18232e', text: '#ece6d6', cover: '#0b1118' },
  };

  // `w` lists the weights Google Fonts serves for the family (omit for 400 only).
  const FONTS = {
    heading: [
      { name: 'Cormorant Garamond', w: '400;500;600;700' },
      { name: 'Playfair Display', w: '400;600;700' },
      { name: 'Cinzel', w: '400;600;700' },
      { name: 'Marcellus' },
      { name: 'Lora', w: '400;600;700' },
      { name: 'El Messiri', w: '400;600;700' },
    ],
    script: [
      { name: 'Great Vibes' },
      { name: 'Parisienne' },
      { name: 'Alex Brush' },
      { name: 'Sacramento' },
      { name: 'Pinyon Script' },
      { name: 'Dancing Script', w: '400;700' },
    ],
    body: [
      { name: 'Poppins', w: '300;400;500;600' },
      { name: 'Nunito', w: '300;400;500;600;700' },
      { name: 'Lato', w: '300;400;700' },
      { name: 'Montserrat', w: '300;400;500;600' },
      { name: 'Quicksand', w: '300;400;500;600' },
      { name: 'Jost', w: '300;400;500;600' },
    ],
  };
  const ARABIC_FONT = { name: 'Amiri', w: '400;700' };

  const stroke = (c, inner) => `<g fill='none' stroke='${c}' stroke-width='1'>${inner}</g>`;
  const PATTERNS = {
    none: { name: 'None' },
    'islamic-star': {
      name: 'Islamic Star',
      size: 80,
      svg: (c) =>
        stroke(c, "<rect x='20' y='20' width='40' height='40'/><rect x='20' y='20' width='40' height='40' transform='rotate(45 40 40)'/><circle cx='40' cy='40' r='8'/><path d='M0 40h11.7M68.3 40H80M40 0v11.7M40 68.3V80'/>"),
    },
    songket: {
      name: 'Songket',
      size: 40,
      svg: (c) => stroke(c, "<path d='M20 2 38 20 20 38 2 20Z'/><path d='M20 12 28 20 20 28 12 20Z'/>") + `<g fill='${c}'><circle cx='0' cy='0' r='1.6'/><circle cx='40' cy='0' r='1.6'/><circle cx='0' cy='40' r='1.6'/><circle cx='40' cy='40' r='1.6'/><circle cx='20' cy='20' r='1.6'/></g>`,
    },
    arabesque: {
      name: 'Arabesque',
      size: 60,
      svg: (c) => stroke(c, "<circle cx='0' cy='0' r='30'/><circle cx='60' cy='0' r='30'/><circle cx='0' cy='60' r='30'/><circle cx='60' cy='60' r='30'/><circle cx='30' cy='30' r='30'/>"),
    },
    batik: {
      name: 'Batik Bunga',
      size: 70,
      svg: (c) =>
        stroke(
          c,
          [0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<ellipse cx='35' cy='20' rx='4.5' ry='11' transform='rotate(${a} 35 35)'/>`).join('') +
            "<circle cx='35' cy='35' r='4'/><circle cx='0' cy='0' r='5'/><circle cx='70' cy='0' r='5'/><circle cx='0' cy='70' r='5'/><circle cx='70' cy='70' r='5'/>"
        ),
    },
    trellis: {
      name: 'Moroccan Trellis',
      size: 60,
      svg: (c) => stroke(c, "<circle cx='30' cy='14' r='14'/><circle cx='46' cy='30' r='14'/><circle cx='30' cy='46' r='14'/><circle cx='14' cy='30' r='14'/>"),
    },
    anyaman: {
      name: 'Anyaman',
      size: 30,
      svg: (c) => stroke(c, "<path d='M0 30 30 0M0 0 30 30M15 0 30 15M0 15 15 30M15 0 0 15M30 15 15 30'/>"),
    },
    dots: {
      name: 'Dots',
      size: 24,
      svg: (c) => `<circle cx='12' cy='12' r='1.6' fill='${c}'/>`,
    },
    khatam: {
      name: 'Khatam Star',
      size: 64,
      svg: (c) => {
        // {8/3} star: every third point of an octagon joined in one stroke.
        const pts = Array.from({ length: 8 }, (_, k) => {
          const a = (k * 3 * Math.PI) / 4 - Math.PI / 2;
          return `${(32 + 24 * Math.cos(a)).toFixed(1)} ${(32 + 24 * Math.sin(a)).toFixed(1)}`;
        });
        return stroke(c, `<path d='M${pts.join('L')}Z'/><path d='M0 0 8 8M64 0 56 8M0 64 8 56M64 64 56 56'/>`) + `<g fill='${c}'><circle cx='0' cy='0' r='2'/><circle cx='64' cy='0' r='2'/><circle cx='0' cy='64' r='2'/><circle cx='64' cy='64' r='2'/></g>`;
      },
    },
    kekisi: {
      name: 'Kekisi',
      size: 40,
      svg: (c) => stroke(c, "<rect x='10' y='10' width='20' height='20'/><path d='M0 0 10 10M40 0 30 10M0 40 10 30M40 40 30 30'/>"),
    },
    honeycomb: {
      name: 'Honeycomb',
      size: 34.64,
      h: 60,
      svg: (c) => stroke(c, "<path d='M17.32 0 34.64 10V30L17.32 40 0 30V10ZM17.32 40V60'/>"),
    },
    sisik: {
      name: 'Sisik (Scales)',
      size: 40,
      svg: (c) => stroke(c, "<path d='M-20 0a20 20 0 0 0 40 0M20 0a20 20 0 0 0 40 0M0 20a20 20 0 0 0 40 0M-20 40a20 20 0 0 0 40 0M20 40a20 20 0 0 0 40 0'/>"),
    },
    ombak: {
      name: 'Ombak (Waves)',
      size: 40,
      h: 20,
      svg: (c) => stroke(c, "<path d='M0 10q10-10 20 0t20 0'/>"),
    },
    'pucuk-rebung': {
      name: 'Pucuk Rebung',
      size: 30,
      h: 44,
      svg: (c) => stroke(c, "<path d='M0 44 15 6 30 44M7 44 15 24 23 44'/>") + `<circle cx='15' cy='2.500' r='1.400' fill='${c}'/>`,
    },
    kelopak: {
      name: 'Kelopak (Petals)',
      size: 40,
      svg: (c) =>
        stroke(c, "<path d='M20 20C12 12 12 4 20 0 28 4 28 12 20 20ZM20 20C12 28 12 36 20 40 28 36 28 28 20 20ZM20 20C12 12 4 12 0 20 4 28 12 28 20 20ZM20 20C28 12 36 12 40 20 36 28 28 28 20 20Z'/>"),
    },
    daun: {
      name: 'Daun (Vines)',
      size: 50,
      svg: (c) =>
        stroke(c, "<path d='M0 25q12.500-15 25 0t25 0'/><ellipse cx='12.500' cy='10' rx='3' ry='7' transform='rotate(35 12.500 10)'/><ellipse cx='37.500' cy='40' rx='3' ry='7' transform='rotate(35 37.500 40)'/>"),
    },
    wajik: {
      name: 'Wajik (Diamonds)',
      size: 32,
      h: 48,
      svg: (c) => stroke(c, "<path d='M16 0 32 24 16 48 0 24Z'/><path d='M16 14 22.700 24 16 34 9.300 24Z'/>"),
    },
    bintang: {
      name: 'Bintang (Stars)',
      size: 48,
      svg: (c) => `<g fill='${c}'><path d='M12 5q0 7 7 7-7 0-7 7 0-7-7-7 7 0 7-7Z'/><path d='M36 31q0 5 5 5-5 0-5 5 0-5-5-5 5 0 5-5Z'/></g>`,
    },
    jalur: {
      name: 'Jalur (Stripes)',
      size: 16,
      svg: (c) => stroke(c, "<path d='M-4 4 4-4M0 16 16 0M12 20 20 12'/>"),
    },
    tambah: {
      name: 'Plus',
      size: 28,
      svg: (c) => stroke(c, "<path d='M14 9v10M9 14h10'/>"),
    },
  };

  const HERO_SHAPES = { none: 'No shape', arch: 'Arch', pointed: 'Pointed arch', oval: 'Oval', petal: 'Petal', rounded: 'Rounded card', square: 'Square card', octagon: 'Octagon' };
  const HERO_FRAMES = {
    none: 'No frame',
    'floral-corners': 'Flowers, two corners',
    'floral-top': 'Flowers, top corners',
    'floral-four': 'Flowers, all corners',
    leaves: 'Leafy sprigs',
    ornament: 'Gold corners',
    custom: 'My own image',
  };
  const COVER_DESIGNS = { classic: 'Patterned', framed: 'Framed border', arch: 'Arch outline', floral: 'Flower corners', minimal: 'Plain' };
  const COVER_TONES = { primary: 'Main colour', bg: 'Background colour' };
  // Songket strips: a woven band repeated across the top and bottom of the card.
  const SONGKETS = {
    none: { name: 'None' },
    'pucuk-rebung': {
      name: 'Pucuk Rebung',
      motif: (c) =>
        "<path d='M0 43 12 18 24 43 36 18 48 43'/>" +
        `<path fill='${c}' stroke='none' d='M7 43 12 32 17 43ZM31 43 36 32 41 43ZM24 19l3 4-3 4-3-4ZM0 19l3 4-3 4-3-4ZM48 19l3 4-3 4-3-4Z'/>`,
    },
    'bunga-tabur': {
      name: 'Bunga Tabur',
      motif: (c) =>
        "<path d='M24 18 36 30 24 42 12 30Z'/>" +
        `<g fill='${c}' stroke='none'><path d='M24 25l5 5-5 5-5-5Z'/><circle cx='0' cy='30' r='2.400'/><circle cx='48' cy='30' r='2.400'/><circle cx='0' cy='20' r='1.400'/><circle cx='48' cy='20' r='1.400'/><circle cx='0' cy='40' r='1.400'/><circle cx='48' cy='40' r='1.400'/></g>`,
    },
    'teluk-berantai': {
      name: 'Teluk Berantai',
      motif: (c) =>
        "<path d='M12 17 25 30 12 43-1 30ZM36 17 49 30 36 43 23 30Z'/>" +
        `<path fill='${c}' stroke='none' d='M12 24q0 6 6 6-6 0-6 6 0-6-6-6 6 0 6-6ZM36 24q0 6 6 6-6 0-6 6 0-6-6-6 6 0 6-6Z'/>`,
    },
  };
  const SONGKET_PLACES = { both: 'Header and footer', top: 'Header only', bottom: 'Footer only' };

  function songketUrl(id, color) {
    const s = SONGKETS[id];
    if (!s || !s.motif) return 'none';
    const dots = [6, 18, 30, 42].map((x) => `<path d='M${x} 7l2.500 2.500-2.500 2.500-2.500-2.500ZM${x} 48l2.500 2.500-2.500 2.500-2.500-2.500Z'/>`).join('');
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='48' height='60' viewBox='0 0 48 60'>" +
      `<g fill='${color}'><rect y='2.500' width='48' height='1.500'/><rect y='56' width='48' height='1.500'/><rect y='14.200' width='48' height='.800'/><rect y='45' width='48' height='.800'/>${dots}</g>` +
      `<g fill='none' stroke='${color}' stroke-width='1.400'>${s.motif(color)}</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  const BODY_WEIGHTS = { light: { name: 'Light', weight: 300 }, regular: { name: 'Regular', weight: 400 }, medium: { name: 'Medium', weight: 500 }, bold: { name: 'Bold', weight: 600 } };
  const HERO_TEXT_COLORS = { primary: 'Main colour', text: 'Text colour', accent: 'Accent colour' };
  const NAME_HIGHLIGHTS = { none: 'None', soft: 'Soft panel', frame: 'Ornate frame', solid: 'Solid banner' };
  const SEAL_STYLES = { gold: 'Gold seal', outline: 'Outline ring', solid: 'Solid contrast', pill: 'Pill button' };

  // Every piece of text whose size can be changed, by category. Each item is
  // [key, label, [[selector, default size], ...]]. The selectors mirror
  // card.css, and the keys must match `design.fontSizes` in lib/defaults.js.
  const NAMES_SIZE = 'clamp(3rem, 15vw, 4.2rem)';
  const BODY_SIZE = '.9375rem';
  const FONT_SIZES = [
    { title: 'Whole card', items: [['all', 'All text together', [['html', '100%']]]] },
    {
      title: 'Opening cover',
      cover: true,
      items: [
        ['coverTop', 'Top text', [['.cover-top', '.85rem']]],
        ['coverNames', 'Couple names', [['.cover .names', NAMES_SIZE]]],
        ['coverDate', 'Date', [['.cover-date', '1.05rem']]],
        ['coverButton', 'Open button', [['.seal', '.95rem']]],
        ['coverSub', 'Bottom text', [['.cover-sub', '.72rem']]],
      ],
    },
    {
      title: 'Welcome section',
      items: [
        ['bismillah', 'Bismillah', [['.bismillah', '1.7rem']]],
        ['heroTitle', 'Title', [['.eyebrow', '.82rem']]],
        ['heroNames', 'Couple names', [['.hero .names', NAMES_SIZE]]],
        ['heroDate', 'Date', [['.hero-date', '1.25rem']]],
        ['heroVenue', 'Venue', [['.hero-venue', '.85rem']]],
        ['tagline', 'Tagline', [['.tagline', '1.05rem']]],
      ],
    },
    {
      title: 'Invitation',
      items: [
        ['greeting', 'Greeting', [['.greeting', '1.15rem']]],
        ['hosts', 'Hosts (parents) names', [['.hosts', '1.4rem']]],
        ['hostNote', 'Description under a host name', [['.hosts .host-note', '.8rem'], ['.host-between, .host-label', '.72rem']]],
        ['inviteText', 'Invitation and closing text', [['#jemputan .lead', BODY_SIZE]]],
        ['coupleFull', 'Couple full names', [['.couple-name', '1.6rem']]],
        ['ampersand', '"&" between the names', [['.amp', '2.2rem']]],
        ['verse', 'Verse / doa', [['.verse', '1.05rem']]],
      ],
    },
    {
      title: 'Headings and general text',
      items: [
        ['sectionTitle', 'Section titles', [['h2', '2.1rem']]],
        ['subTitle', 'Sub-headings and pop-up titles', [['h3', '1.4rem']]],
        ['description', 'Section descriptions', [['.lead', BODY_SIZE]]],
        ['smallNote', 'Small notes (Hijri date, address, captions)', [['.muted', '.9em']]],
        ['miniTitle', 'Small labels above buttons', [['.mini-title', '.72rem']]],
        ['button', 'Buttons', [['.btn', '.85rem'], ['.gift .btn', '.78rem'], ['.contact .btn', '.76rem']]],
        ['textLink', 'Text links', [['.link', '.85rem']]],
        ['toast', 'Pop-up messages', [['.toast', '.85rem']]],
      ],
    },
    {
      title: 'Event details',
      items: [
        ['eventMain', 'Date and venue name', [['.strong', '1.3rem']]],
        ['eventTime', 'Time', [['#majlis [data-t="event.timeText"]', BODY_SIZE]]],
        ['countdownNumber', 'Countdown numbers', [['.countdown b', '1.9rem']]],
        ['countdownLabel', 'Countdown labels', [['.countdown span', '.66rem']]],
        ['programmeTime', 'Programme time', [['.timeline time', '1.1rem']]],
        ['programmeText', 'Programme activity', [['.timeline span', BODY_SIZE]]],
      ],
    },
    {
      title: 'Attire theme',
      items: [
        ['swatchName', 'Colour names', [['.swatch', '.78rem']]],
        ['attireNotes', 'Dress code notes', [['.notes', '.9rem']]],
      ],
    },
    {
      title: 'RSVP form',
      items: [
        ['rsvpMessage', 'Thank-you and "RSVP closed" messages', [['#rsvpDone p:not(.mini-title), #rsvpClosed', BODY_SIZE]]],
        ['formLabel', 'Field labels', [['.form label > span, .form legend', '.74rem']]],
        ['formChoice', 'Attendance choices', [['.form .seg span', '.92rem']]],
        // Never below 16px: smaller text makes iPhones zoom in on the field.
        ['formInput', 'Typed text (16px minimum)', [['.form input:not([type="radio"]), .form select, .form textarea', 'max(16px, calc(16px * {s}))']]],
      ],
    },
    {
      title: 'Wishes',
      items: [
        ['wishText', 'Wish', [['.wish q', '1.1rem']]],
        ['wishName', 'Guest name', [['.wish cite', '.78rem']]],
        ['emptyText', '"Nothing here yet" text', [['.empty', BODY_SIZE]]],
      ],
    },
    {
      title: 'Salam kaut',
      items: [
        ['bankLabel', 'Labels', [['.bank dt', '.7rem']]],
        ['bankValue', 'Bank and account name', [['.bank dd', '1.25rem']]],
        ['accountNumber', 'Account number', [['.bank .acc', '1.6rem']]],
      ],
    },
    {
      title: 'Gifts',
      items: [
        ['giftName', 'Gift name', [['.gift h4', '1.25rem']]],
        ['giftText', 'Description and price', [['.gift p', '.85rem']]],
        ['giftBadge', '"Reserved" badge', [['.badge', '.74rem']]],
      ],
    },
    {
      title: 'Thank you and contacts',
      items: [
        ['thanksNames', 'Couple names', [['.names.small', '2.4rem']]],
        ['hashtag', 'Hashtag', [['.hashtag', '1.1rem']]],
        ['contactName', 'Contact name', [['.contact b', '1.2rem']]],
        ['contactDetail', 'Contact relationship and phone', [['.contact small', '.8rem']]],
        ['credit', 'Footer "design by" note', [['.credit', '.72rem']]],
      ],
    },
    {
      title: 'Shortcut bar and language switch',
      items: [
        ['dock', 'Shortcut labels', [['.dock button', '.62rem']]],
        ['langSwitch', 'BM / EN switch', [['.lang button', '.72rem']]],
      ],
    },
  ];
  const FONT_SIZE_MIN = 50;
  const FONT_SIZE_MAX = 250;

  function fontSizeCss(sizes) {
    let css = '';
    for (const group of FONT_SIZES) {
      for (const [key, , rules] of group.items) {
        const percent = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Number(sizes && sizes[key]) || 100));
        if (percent === 100) continue;
        const s = percent / 100;
        for (const [selector, base] of rules) css += `${selector}{font-size:${base.includes('{s}') ? base.replace('{s}', s) : `calc(${base} * ${s})`}}\n`;
      }
    }
    return css;
  }

  const EFFECTS = { none: 'None', petals: 'Falling petals', sparkles: 'Sparkles', hearts: 'Floating hearts', dust: 'Gold dust' };
  const SCROLL_ANIMATIONS = { none: 'None', 'fade-up': 'Fade up', zoom: 'Zoom in', slide: 'Slide from sides', flip: 'Flip in', blur: 'Soft focus' };
  const OPENINGS = {
    doors: 'Double doors',
    slide: 'Sliding gates',
    split: 'Split up & down',
    shutters: 'Folding shutters',
    envelope: 'Envelope',
    book: 'Book cover',
    flip: 'Flip up',
    curtain: 'Curtain lift',
    swipe: 'Page swipe',
    swing: 'Swing away',
    iris: 'Closing circle',
    diagonal: 'Diagonal wipe',
    spin: 'Spin away',
    zoom: 'Zoom & fade',
  };

  const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

  function patternUrl(id, color) {
    const p = PATTERNS[id];
    if (!p || !p.svg) return 'none';
    const h = p.h || p.size;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${p.size}' height='${h}' viewBox='0 0 ${p.size} ${h}'>${p.svg(color)}</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  // WCAG relative luminance and contrast ratio.
  function luminance(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  }
  function mixHex(a, b, t) {
    const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const [x, y] = [rgb(a), rgb(b)];
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  // Black or white, whichever reads better on the given background.
  const contrastOn = (hex) => (luminance(hex) > 0.4 ? '#1c1c1c' : '#ffffff');

  // `color` as text on every one of `backgrounds`: returned unchanged when it
  // already reaches the `min` contrast ratio, otherwise darkened (or lightened,
  // on dark backgrounds) just far enough to reach it.
  function readable(color, backgrounds, min) {
    const worst = (c) => Math.min(...backgrounds.map((bg) => contrast(c, bg)));
    if (worst(color) >= min) return color;
    const average = backgrounds.reduce((sum, bg) => sum + luminance(bg), 0) / backgrounds.length;
    const toward = average > 0.18 ? '#000000' : '#ffffff';
    for (let t = 0.05; t < 1; t += 0.05) {
      const c = mixHex(color, toward, t);
      if (worst(c) >= min) return c;
    }
    return toward;
  }

  function palette(design) {
    const theme = THEMES[design.theme] || THEMES.emerald;
    const p = { ...theme };
    const custom = design.custom;
    if (custom && custom.enabled) {
      for (const k of ['primary', 'accent', 'bg', 'surface', 'text']) if (isHex(custom[k])) p[k] = custom[k];
      p.cover = p.primary;
    }
    p.onPrimary = contrastOn(p.primary);
    p.band = p.cover || p.primary; // songket strips: the dark tone of the theme
    if (design.coverTone === 'bg') {
      p.cover = p.bg;
      p.onCover = readable(p.primary, [p.bg], 4.5);
    } else {
      p.cover = p.cover || p.primary;
      p.onCover = contrastOn(p.cover);
    }
    // Text colours, corrected against the backgrounds they are shown on.
    const page = [p.bg, p.surface];
    p.text = readable(p.text, page, 7);
    p.muted = readable(mixHex(p.text, p.bg, 0.28), page, 4.5);
    p.ink = readable(p.primary, page, 4.5); // the main colour, as text
    p.accentInk = readable(p.accent, page, 4.5); // the accent colour, as text
    p.accentOnPrimary = readable(p.accent, [p.primary], 3);
    p.accentOnCover = readable(p.accent, [p.cover], 3);
    return p;
  }

  function loadFonts(fonts) {
    const href =
      'https://fonts.googleapis.com/css2?' +
      fonts.map((f) => `family=${f.name.replace(/ /g, '+')}${f.w ? `:wght@${f.w}` : ''}`).join('&') +
      '&display=swap';
    let link = document.getElementById('kk-fonts');
    if (!link) {
      link = document.createElement('link');
      link.id = 'kk-fonts';
      link.rel = 'stylesheet';
      document.head.append(link);
    }
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  }

  const findFont = (kind, name) => FONTS[kind].find((f) => f.name === name) || FONTS[kind][0];

  function applyDesign(design) {
    const p = palette(design);
    const root = document.documentElement.style;
    root.setProperty('--primary', p.primary);
    root.setProperty('--accent', p.accent);
    root.setProperty('--bg', p.bg);
    root.setProperty('--surface', p.surface);
    root.setProperty('--text', p.text);
    root.setProperty('--on-primary', p.onPrimary);
    root.setProperty('--cover', p.cover);
    root.setProperty('--on-cover', p.onCover);
    root.setProperty('--pattern', patternUrl(design.pattern, p.accent));
    root.setProperty('--band', p.band);
    root.setProperty('--hero-text', readable(p[HERO_TEXT_COLORS[design.heroTextColor] ? design.heroTextColor : 'primary'], [p.bg, p.surface], 4.5));
    root.setProperty('--ink', p.ink);
    root.setProperty('--muted', p.muted);
    root.setProperty('--accent-ink', p.accentInk);
    root.setProperty('--accent-on-cover', p.accentOnCover);
    root.setProperty('--accent-on-primary', p.accentOnPrimary);
    root.setProperty('--body-weight', String((BODY_WEIGHTS[design.bodyWeight] || BODY_WEIGHTS.medium).weight));
    root.setProperty('--songket', songketUrl(design.songket, p.accent));
    root.setProperty('--pattern-opacity', String(Math.min(0.5, Math.max(0, Number(design.patternOpacity) || 0))));

    const heading = findFont('heading', design.fontHeading);
    const script = findFont('script', design.fontScript);
    const body = findFont('body', design.fontBody);
    root.setProperty('--font-heading', `'${heading.name}', serif`);
    root.setProperty('--font-script', `'${script.name}', cursive`);
    root.setProperty('--font-body', `'${body.name}', sans-serif`);
    loadFonts([heading, script, body, ARABIC_FONT]);

    // Size overrides go in a stylesheet after card.css so they win on equal selectors.
    let sizes = document.getElementById('kk-font-sizes');
    if (!sizes) {
      sizes = document.createElement('style');
      sizes.id = 'kk-font-sizes';
      document.head.append(sizes);
    }
    const css = fontSizeCss(design.fontSizes);
    if (sizes.textContent !== css) sizes.textContent = css;

    const data = document.body.dataset;
    data.anim = SCROLL_ANIMATIONS[design.scrollAnimation] ? design.scrollAnimation : 'fade-up';
    data.heroShape = HERO_SHAPES[design.heroShape] ? design.heroShape : 'arch';
    data.coverDesign = COVER_DESIGNS[design.coverDesign] ? design.coverDesign : 'classic';
    data.seal = SEAL_STYLES[design.sealStyle] ? design.sealStyle : 'gold';
    data.nameHighlight = NAME_HIGHLIGHTS[design.nameHighlight] ? design.nameHighlight : 'frame';
    data.songket = SONGKETS[design.songket] ? design.songket : 'none';
    data.songketPlace = SONGKET_PLACES[design.songketPlace] ? design.songketPlace : 'both';

    const coverImage = safeUrl(design.coverImage);
    root.setProperty('--cover-image', coverImage ? `url("${coverImage.replace(/["\\\s]/g, (ch) => encodeURIComponent(ch))}")` : 'none');
    document.body.classList.toggle('has-cover-image', !!coverImage);
    return p;
  }

  // Only uploaded files and http(s) links are ever used as URLs.
  function safeUrl(u) {
    if (typeof u !== 'string') return '';
    u = u.trim();
    if (/^\/uploads\/[\w.-]+$/.test(u) || /^https?:\/\//i.test(u)) return u;
    return '';
  }

  return { FONT_SIZES, FONT_SIZE_MIN, FONT_SIZE_MAX, THEMES, FONTS, PATTERNS, HERO_SHAPES, HERO_FRAMES, COVER_DESIGNS, COVER_TONES, SEAL_STYLES, BODY_WEIGHTS, HERO_TEXT_COLORS, NAME_HIGHLIGHTS, SONGKETS, SONGKET_PLACES, EFFECTS, SCROLL_ANIMATIONS, OPENINGS, isHex, palette, patternUrl, loadFonts, applyDesign, safeUrl };
})();
