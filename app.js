/* Jewish Piano Archive — static client app (no build step). */
(function () {
  'use strict';

  // ---------- constants ----------
  const CONN = [
    { key: 'Jewish', cls: 'jewish', label: 'Jewish', help: 'Born or raised Jewish, or identified as Jewish, per the linked sources.' },
    { key: 'Jewish-born; converted or raised Christian', cls: 'convert', label: 'Jewish-born; converted or raised Christian', help: 'Jewish family; the composer or their parents converted, or a source records a Christian religion.' },
    { key: 'Jewish descent (partial or ancestral)', cls: 'descent', label: 'Jewish descent (partial or ancestral)', help: 'One Jewish parent or Jewish ancestry, per the linked sources.' },
    { key: 'Non-Jewish; Jewish connection', cls: 'connection', label: 'Non-Jewish; Jewish connection', help: 'Not Jewish, but worked in Jewish institutions or wrote Jewish-themed music.' }
  ];
  const CONN_BY = Object.fromEntries(CONN.map(c => [c.key, c]));
  const AVAIL = {
    free: 'Free score (IMSLP)',
    page: 'IMSLP page, no score file',
    record: 'Publication record',
    list: 'Listed in a work list'
  };
  const WSRC = {
    'IMSLP': 'IMSLP work page',
    'Catalogue': 'Library / trade catalogue (Domestic Piano Repertoire DB)',
    'LexM': 'LexM work list',
    'Wikipedia': 'Wikipedia work list',
    'Wikidata': 'Wikidata',
    'Women at the Keys': 'Women at the Keys',
    'IEMJ': 'IEMJ / Hofmeister edition',
    'Levande musikarv': 'Levande musikarv (Sweden)'
  };
  const TONICS = ['C', 'C-sharp', 'D-flat', 'D', 'D-sharp', 'E-flat', 'E', 'F', 'F-sharp', 'G-flat', 'G', 'G-sharp', 'A-flat', 'A', 'A-sharp', 'B-flat', 'B'];
  const PAGE = { cards: 60, table: 100 };

  // ---------- state ----------
  const S = {
    tab: 'composers', view: 'cards', page: 1, sort: '',
    q: '', conn: [], primary: false, flags: [], themes: [], region: '', country: '', gender: '',
    bmin: '', bmax: '', genre: '', tonic: '', mode: '', dmin: '', dmax: '', hasdur: false, ymin: '', ymax: '',
    avail: [], wsrc: [], lh: false, open: ''
  };
  const ARR_KEYS = ['conn', 'flags', 'themes', 'avail', 'wsrc'];
  const BOOL_KEYS = ['primary', 'hasdur', 'lh'];
  const STR_KEYS = ['q', 'region', 'country', 'gender', 'bmin', 'bmax', 'genre', 'tonic', 'mode', 'dmin', 'dmax', 'ymin', 'ymax', 'sort', 'view'];

  let DATA = null; // {composers, leads, works, byId, worksBy}
  let map = null, cluster = null;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const nf = n => Number(n).toLocaleString('en-US');

  // ---------- theme ----------
  try { const t = localStorage.getItem('jpa-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) { }
  $('#themeBtn').addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('jpa-theme', next); } catch (e) { }
  });

  // ---------- URL state ----------
  function readHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs] = h.split('?');
    const parts = (path || 'composers').split('/');
    S.tab = ['composers', 'works', 'map', 'timeline', 'leads', 'about', 'composer'].includes(parts[0]) ? parts[0] : 'composers';
    S.open = '';
    if (S.tab === 'composer') { S.open = parts[1] || ''; S.tab = 'composers'; }
    const p = new URLSearchParams(qs || '');
    for (const k of STR_KEYS) S[k] = p.get(k) || (k === 'view' ? 'cards' : '');
    for (const k of ARR_KEYS) S[k] = p.get(k) ? p.get(k).split('|') : [];
    for (const k of BOOL_KEYS) S[k] = p.get(k) === '1';
    S.page = parseInt(p.get('page') || '1', 10) || 1;
  }
  function stateQuery() {
    const p = new URLSearchParams();
    for (const k of STR_KEYS) if (S[k] && !(k === 'view' && S[k] === 'cards')) p.set(k, S[k]);
    for (const k of ARR_KEYS) if (S[k].length) p.set(k, S[k].join('|'));
    for (const k of BOOL_KEYS) if (S[k]) p.set(k, '1');
    if (S.page > 1) p.set('page', S.page);
    const s = p.toString();
    return s ? '?' + s : '';
  }
  function writeHash(replace = true) {
    const path = S.open ? 'composer/' + S.open : S.tab;
    const url = '#/' + path + stateQuery();
    if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  }

  // ---------- load ----------
  Promise.all([
    fetch('data/composers.json').then(r => r.json()),
    fetch('data/works.json').then(r => r.json()),
    fetch('data/meta.json').then(r => r.json()).catch(() => ({}))
  ]).then(([c, w, meta]) => {
    DATA = { composers: c.composers, leads: c.leads, works: w, meta };
    DATA.byId = new Map();
    for (const x of c.composers) { x._lead = false; DATA.byId.set(x.id, x); }
    for (const x of c.leads) { x._lead = true; DATA.byId.set(x.id, x); }
    DATA.worksBy = new Map();
    for (const x of w) {
      if (!DATA.worksBy.has(x.c)) DATA.worksBy.set(x.c, []);
      DATA.worksBy.get(x.c).push(x);
      const cc = DATA.byId.get(x.c);
      x._s = norm([x.t, x.alt, x.op, x.key, x.note, x.ded, x.pub, cc && cc.name].join(' '));
    }
    for (const x of DATA.byId.values()) {
      const wt = (DATA.worksBy.get(x.id) || []).map(w => w.t).join(' ');
      x._s = norm([x.name, x.sort, x.bplace, x.dplace, x.country, x.nat, x.desc, (x.occ || []).join(' '), x.conn, (x.themes || []).join(' ')].join(' '));
      x._sw = norm(wt);
      x._primary = (x.sources || []).some(s => s.strength === 'primary');
    }
    $('#loading').hidden = true;
    buildFilters();
    readHash();
    syncControls();
    render();
    const b = DATA.meta || {};
    $('#buildInfo').textContent = b.built ? `Data compiled ${b.built}. ${nf(c.composers.length)} composers with located works · ${nf(w.length)} work records · ${nf(c.leads.length)} leads.` : '';
  }).catch(err => {
    $('#loading').textContent = 'The data could not be loaded. If you opened this file directly from disk, serve the folder over http (GitHub Pages does this automatically).';
    console.error(err);
  });

  // ---------- filter UI ----------
  function countBy(arr, fn) {
    const m = new Map();
    for (const x of arr) for (const v of [].concat(fn(x) || [])) m.set(v, (m.get(v) || 0) + 1);
    return m;
  }
  function checkList(el, items, key) {
    el.innerHTML = items.map(it => `<label class="check" title="${esc(it.help || '')}"><input type="checkbox" data-arr="${key}" value="${esc(it.value)}">${it.swatch ? `<span class="swatch" style="background:var(--c-${it.swatch})"></span>` : ''}<span>${esc(it.label)}</span><span class="n">${it.n != null ? nf(it.n) : ''}</span></label>`).join('');
  }
  function buildFilters() {
    const all = DATA.composers;
    const cc = countBy(all, x => x.conn);
    checkList($('#f-conn'), CONN.filter(c => cc.get(c.key)).map(c => ({ value: c.key, label: c.label, n: cc.get(c.key), swatch: c.cls, help: c.help })), 'conn');
    const fc = countBy(all, x => x.flags);
    checkList($('#f-flags'), ['Holocaust victim', 'Survived Nazi imprisonment', 'Persecuted under Nazism'].filter(k => fc.get(k)).map(k => ({ value: k, label: k, n: fc.get(k) })), 'flags');
    const tc = countBy(all, x => x.themes);
    checkList($('#f-themes'), [...tc.keys()].sort().map(k => ({ value: k, label: k, n: tc.get(k) })), 'themes');
    const rc = countBy(all, x => x.region);
    $('#f-region').insertAdjacentHTML('beforeend', [...rc.keys()].sort((a, b) => (a === 'Unknown') - (b === 'Unknown') || a.localeCompare(b)).map(k => `<option value="${esc(k)}">${esc(k)} (${rc.get(k)})</option>`).join(''));
    const coc = countBy(all, x => x.country || 'Unknown');
    $('#f-country').insertAdjacentHTML('beforeend', [...coc.keys()].sort((a, b) => a.localeCompare(b)).map(k => `<option value="${esc(k)}">${esc(k)} (${coc.get(k)})</option>`).join(''));
    const gc = countBy(all, x => x.gender);
    $('#f-gender').insertAdjacentHTML('beforeend', [...gc.keys()].sort().map(k => `<option value="${esc(k)}">${esc(k)} (${gc.get(k)})</option>`).join(''));
    const gen = countBy(DATA.works, w => w.g);
    $('#f-genre').insertAdjacentHTML('beforeend', [...gen.keys()].sort().map(k => `<option value="${esc(k)}">${esc(k)} (${nf(gen.get(k))})</option>`).join(''));
    const ton = countBy(DATA.works, w => w.ton);
    $('#f-tonic').insertAdjacentHTML('beforeend', TONICS.filter(t => ton.get(t)).map(t => `<option value="${t}">${t.replace('-sharp', '♯').replace('-flat', '♭')} (${ton.get(t)})</option>`).join(''));
    const av = countBy(DATA.works, w => w.avail);
    checkList($('#f-avail'), Object.keys(AVAIL).filter(k => av.get(k)).map(k => ({ value: k, label: AVAIL[k], n: av.get(k) })), 'avail');
    const ws = countBy(DATA.works, w => w.src);
    checkList($('#f-wsrc'), [...ws.keys()].sort((a, b) => ws.get(b) - ws.get(a)).map(k => ({ value: k, label: WSRC[k] || k, n: ws.get(k) })), 'wsrc');

    // events
    $('#filters').addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.arr) {
        const k = t.dataset.arr;
        S[k] = $$(`input[data-arr="${k}"]:checked`).map(i => i.value);
      } else if (t.id) {
        const k = t.id.replace(/^f-/, '');
        if (t.type === 'checkbox') S[k] = t.checked; else if (t.id !== 'q') S[k] = t.value;
      }
      S.page = 1; writeHash(); render();
    });
    let qt;
    $('#q').addEventListener('input', e => {
      clearTimeout(qt);
      qt = setTimeout(() => { S.q = e.target.value.trim(); S.page = 1; writeHash(); render(); }, 180);
    });
    $('#resetBtn').addEventListener('click', resetAll);
    $('#sort').addEventListener('change', e => { S.sort = e.target.value; S.page = 1; writeHash(); render(); });
    $('#viewSeg').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      S.view = b.dataset.view; S.page = 1; writeHash(); render();
    });
    $('#csvBtn').addEventListener('click', downloadCSV);
    $('#copyLinkBtn').addEventListener('click', () => {
      const u = location.href;
      (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => flash('#copyLinkBtn', 'Copied')).catch(() => prompt('Copy this link:', u));
    });
    $('#filtersToggle').addEventListener('click', () => {
      const f = $('#filters'); const open = !f.classList.contains('open');
      f.classList.toggle('open', open); $('#filtersToggle').setAttribute('aria-expanded', open);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#filters').classList.remove('open'); });
    $('#chips').addEventListener('click', e => {
      const b = e.target.closest('button[data-k]'); if (!b) return;
      const k = b.dataset.k, v = b.dataset.v;
      if (ARR_KEYS.includes(k)) S[k] = S[k].filter(x => x !== v);
      else if (BOOL_KEYS.includes(k)) S[k] = false;
      else S[k] = '';
      S.page = 1; syncControls(); writeHash(); render();
    });
    window.addEventListener('hashchange', () => { readHash(); syncControls(); render(); });
    $('#dClose').addEventListener('click', closeDetail);
    $('#detail').addEventListener('close', () => { if (S.open) { S.open = ''; writeHash(false); } });
    $('#detail').addEventListener('click', e => { if (e.target === $('#detail')) closeDetail(); });
    document.body.addEventListener('click', e => {
      const o = e.target.closest('[data-open]');
      if (o) { e.preventDefault(); openDetail(o.dataset.open); }
      const pg = e.target.closest('[data-page]');
      if (pg && !pg.disabled) { S.page = +pg.dataset.page; writeHash(); render(); window.scrollTo({ top: $('#browse').offsetTop - 120, behavior: 'smooth' }); }
      const sb = e.target.closest('[data-sort]');
      if (sb) { const v = sb.dataset.sort; S.sort = S.sort === v ? v + ':desc' : v; S.page = 1; writeHash(); render(); }
    });
  }
  function flash(sel, txt) { const b = $(sel); const o = b.textContent; b.textContent = txt; setTimeout(() => b.textContent = o, 1200); }
  function resetAll() {
    for (const k of STR_KEYS) if (k !== 'view' && k !== 'sort') S[k] = '';
    for (const k of ARR_KEYS) S[k] = [];
    for (const k of BOOL_KEYS) S[k] = false;
    S.page = 1; syncControls(); writeHash(); render();
  }
  function syncControls() {
    $('#q').value = S.q;
    for (const k of ['region', 'country', 'gender', 'bmin', 'bmax', 'genre', 'tonic', 'mode', 'dmin', 'dmax', 'ymin', 'ymax']) $('#f-' + k).value = S[k];
    for (const k of BOOL_KEYS) $('#f-' + k).checked = S[k];
    for (const k of ARR_KEYS) $$(`input[data-arr="${k}"]`).forEach(i => { i.checked = S[k].includes(i.value); });
  }

  // ---------- filtering ----------
  const hasWorkFilters = () => !!(S.genre || S.tonic || S.mode || S.dmin || S.dmax || S.hasdur || S.ymin || S.ymax || S.avail.length || S.wsrc.length || S.lh);
  function composerPass(c, useQ) {
    if (S.conn.length && !S.conn.includes(c.conn)) return false;
    if (S.primary && !c._primary) return false;
    if (S.flags.length && !S.flags.every(f => (c.flags || []).includes(f))) return false;
    if (S.themes.length && !S.themes.some(f => (c.themes || []).includes(f))) return false;
    if (S.region && c.region !== S.region) return false;
    if (S.country && (c.country || 'Unknown') !== S.country) return false;
    if (S.gender && c.gender !== S.gender) return false;
    if (S.bmin && !(c.born >= +S.bmin)) return false;
    if (S.bmax && !(c.born <= +S.bmax)) return false;
    if (useQ && S.q) {
      const terms = norm(S.q).split(/\s+/).filter(Boolean);
      if (!terms.every(t => c._s.includes(t) || c._sw.includes(t))) return false;
    }
    return true;
  }
  function workPass(w) {
    if (S.genre && !(w.g || []).includes(S.genre)) return false;
    if (S.tonic && w.ton !== S.tonic) return false;
    if (S.mode === 'none' && w.ton) return false;
    if (S.mode && S.mode !== 'none' && w.mode !== S.mode) return false;
    if (S.hasdur && w.dur == null) return false;
    if (S.dmin && !(w.dur >= +S.dmin)) return false;
    if (S.dmax && !(w.dur <= +S.dmax)) return false;
    if (S.ymin && !(w.yr >= +S.ymin)) return false;
    if (S.ymax && !(w.yr <= +S.ymax)) return false;
    if (S.avail.length && !S.avail.includes(w.avail)) return false;
    if (S.wsrc.length && !S.wsrc.includes(w.src)) return false;
    if (S.lh && !w.lh) return false;
    return true;
  }
  function filteredComposers() {
    const wf = hasWorkFilters();
    return DATA.composers.filter(c => composerPass(c, true) && (!wf || (DATA.worksBy.get(c.id) || []).some(workPass)));
  }
  function filteredLeads() { return DATA.leads.filter(c => composerPass(c, true)); }
  function filteredWorks() {
    const terms = norm(S.q).split(/\s+/).filter(Boolean);
    return DATA.works.filter(w => {
      const c = DATA.byId.get(w.c);
      if (!c || !composerPass(c, false)) return false;
      if (!workPass(w)) return false;
      if (terms.length && !terms.every(t => w._s.includes(t) || c._s.includes(t))) return false;
      return true;
    });
  }

  // ---------- sorting ----------
  const SORTS = {
    composers: [['name', 'Name'], ['born', 'Birth year'], ['nworks', 'Number of works'], ['nfree', 'Free scores'], ['country', 'Country'], ['nsites', 'Wikipedia coverage']],
    leads: [['name', 'Name'], ['born', 'Birth year'], ['country', 'Country'], ['nsites', 'Wikipedia coverage']],
    works: [['composer', 'Composer'], ['title', 'Title'], ['yr', 'Year'], ['dur', 'Duration'], ['key', 'Key'], ['avail', 'Availability']]
  };
  function sortList(list, kind) {
    const [k, dir] = (S.sort || '').split(':');
    const d = dir === 'desc' ? -1 : 1;
    const nullLast = (a, b) => (a == null) - (b == null);
    const cmp = {
      name: (a, b) => norm(a.sort).localeCompare(norm(b.sort)),
      born: (a, b) => nullLast(a.born, b.born) || d * (a.born - b.born),
      nworks: (a, b) => d * ((b.nworks || 0) - (a.nworks || 0)),
      nfree: (a, b) => d * ((b.nfree || 0) - (a.nfree || 0)),
      country: (a, b) => (a.country || '~').localeCompare(b.country || '~') * d || norm(a.sort).localeCompare(norm(b.sort)),
      nsites: (a, b) => d * ((b.nsites || 0) - (a.nsites || 0)),
      composer: (a, b) => norm(DATA.byId.get(a.c).sort).localeCompare(norm(DATA.byId.get(b.c).sort)) * d || (a.yr || 9999) - (b.yr || 9999),
      title: (a, b) => d * norm(a.t).localeCompare(norm(b.t)),
      yr: (a, b) => nullLast(a.yr, b.yr) || d * (a.yr - b.yr),
      dur: (a, b) => nullLast(a.dur, b.dur) || d * (a.dur - b.dur),
      key: (a, b) => nullLast(a.ton, b.ton) || d * (TONICS.indexOf(a.ton) - TONICS.indexOf(b.ton)) || (a.mode || '').localeCompare(b.mode || ''),
      avail: (a, b) => d * (Object.keys(AVAIL).indexOf(a.avail) - Object.keys(AVAIL).indexOf(b.avail))
    };
    const def = kind === 'works' ? 'composer' : 'name';
    const f = cmp[k] || cmp[def];
    if (k === 'name' || (!k && kind !== 'works')) return list.slice().sort((a, b) => d * cmp.name(a, b));
    return list.slice().sort(f);
  }

  // ---------- render ----------
  function setTab() {
    $$('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === S.tab));
    const browse = ['composers', 'works', 'leads'].includes(S.tab);
    $('#browse').hidden = !browse;
    $('#mapView').hidden = S.tab !== 'map';
    $('#timelineView').hidden = S.tab !== 'timeline';
    $('#aboutView').hidden = S.tab !== 'about';
    $('#stats').hidden = S.tab === 'about';
    $$('.works-only').forEach(el => el.hidden = S.tab === 'leads');
    $('#viewSeg').hidden = S.tab === 'works';
    const opts = SORTS[S.tab] || SORTS.composers;
    const sel = $('#sort');
    sel.innerHTML = opts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    sel.value = (S.sort || '').split(':')[0] || opts[0][0];
    $$('#viewSeg button').forEach(b => b.classList.toggle('on', b.dataset.view === S.view));
  }
  function render() {
    if (!DATA) return;
    setTab();
    renderChips();
    if (S.tab === 'composers') renderComposers();
    else if (S.tab === 'works') renderWorks();
    else if (S.tab === 'leads') renderLeads();
    else if (S.tab === 'map') renderMap();
    else if (S.tab === 'timeline') renderTimeline();
    else if (S.tab === 'about') renderAbout();
    if (S.open) openDetail(S.open, true); else if ($('#detail').open) $('#detail').close();
  }
  function renderStats(cs, ws, extra) {
    const countries = new Set(cs.map(c => c.country).filter(Boolean)).size;
    const free = ws.filter(w => w.avail === 'free').length;
    const women = cs.filter(c => c.gender === 'Female').length;
    const items = [[nf(cs.length), extra || 'composers'], [nf(ws.length), 'work records'], [nf(free), 'with a free score'], [nf(countries), 'countries of birth'], [nf(women), 'women composers']];
    $('#stats').innerHTML = items.map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
  }
  function renderChips() {
    const chips = [];
    const add = (k, v, label) => chips.push(`<span class="chip">${esc(label)}<button type="button" data-k="${k}" data-v="${esc(v)}" aria-label="Remove ${esc(label)}">×</button></span>`);
    if (S.q) add('q', '', `Search: “${S.q}”`);
    S.conn.forEach(v => add('conn', v, v));
    if (S.primary) add('primary', '', 'Primary source only');
    S.flags.forEach(v => add('flags', v, v));
    S.themes.forEach(v => add('themes', v, v));
    if (S.region) add('region', '', S.region);
    if (S.country) add('country', '', S.country);
    if (S.gender) add('gender', '', S.gender);
    if (S.bmin || S.bmax) { add('bmin', '', `Born ≥ ${S.bmin || '…'}`); }
    if (S.bmax) add('bmax', '', `Born ≤ ${S.bmax}`);
    if (S.tab !== 'leads') {
      if (S.genre) add('genre', '', S.genre);
      if (S.tonic) add('tonic', '', 'Key: ' + S.tonic);
      if (S.mode) add('mode', '', 'Mode: ' + S.mode);
      if (S.dmin) add('dmin', '', `≥ ${S.dmin} min`);
      if (S.dmax) add('dmax', '', `≤ ${S.dmax} min`);
      if (S.hasdur) add('hasdur', '', 'Has duration');
      if (S.ymin) add('ymin', '', `Year ≥ ${S.ymin}`);
      if (S.ymax) add('ymax', '', `Year ≤ ${S.ymax}`);
      S.avail.forEach(v => add('avail', v, AVAIL[v]));
      S.wsrc.forEach(v => add('wsrc', v, WSRC[v] || v));
      if (S.lh) add('lh', '', 'Left hand');
    }
    $('#chips').innerHTML = chips.join('');
  }
  function yrs(c) { return `${c.born || '?'}–${c.died || ''}`; }
  function connTag(c) { const k = CONN_BY[c.conn] || CONN[0]; return `<span class="tag conn ${k.cls}" title="${esc(k.help)}">${esc(k.label)}</span>`; }
  function thumb(c, w) {
    if (c.img) return `<img class="avatar" loading="lazy" alt="" src="${esc(c.img)}?width=${w || 120}" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'avatar',textContent:'${esc((c.sort || c.name)[0])}'}))">`;
    return `<span class="avatar" aria-hidden="true">${esc((c.sort || c.name)[0])}</span>`;
  }
  function place(c) { return [c.bplace, c.country && c.country !== c.bplace ? c.country : ''].filter(Boolean).join(', '); }
  function paginate(list, per) {
    const pages = Math.max(1, Math.ceil(list.length / per));
    if (S.page > pages) S.page = pages;
    const start = (S.page - 1) * per;
    const btns = [];
    if (pages > 1) {
      btns.push(`<button type="button" data-page="${S.page - 1}" ${S.page === 1 ? 'disabled' : ''}>‹ Prev</button>`);
      const shown = new Set([1, pages, S.page - 2, S.page - 1, S.page, S.page + 1, S.page + 2].filter(p => p >= 1 && p <= pages));
      let last = 0;
      [...shown].sort((a, b) => a - b).forEach(p => { if (p - last > 1) btns.push('<span>…</span>'); btns.push(`<button type="button" data-page="${p}" ${p === S.page ? 'disabled aria-current="page"' : ''}>${p}</button>`); last = p; });
      btns.push(`<button type="button" data-page="${S.page + 1}" ${S.page === pages ? 'disabled' : ''}>Next ›</button>`);
    }
    $('#pager').innerHTML = btns.join('');
    return list.slice(start, start + per);
  }
  function composerCards(list, lead) {
    return `<div class="cards">${list.map(c => `
      <button type="button" class="card" data-open="${c.id}">
        <div class="card-top">${thumb(c)}<div>
          <h3>${esc(c.name)}</h3>
          <div class="meta">${esc(yrs(c))}${place(c) ? ' · ' + esc(place(c)) : ''}</div>
        </div></div>
        ${c.desc ? `<p class="desc">${esc(c.desc)}</p>` : ''}
        <div class="tags">${connTag(c)}${(c.flags || []).map(f => `<span class="tag flag">${esc(f)}</span>`).join('')}${(c.themes || []).map(f => `<span class="tag theme">${esc(f)}</span>`).join('')}</div>
        <div class="card-foot">${lead ? `<span>No solo piano work located yet</span>` : `<span><b>${nf(c.nworks)}</b> solo piano work record${c.nworks === 1 ? '' : 's'}${c.nfree ? ` · <b>${nf(c.nfree)}</b> free score${c.nfree === 1 ? '' : 's'}` : ''}</span>`}<span>${(c.sources || []).length} source${(c.sources || []).length === 1 ? '' : 's'}</span></div>
      </button>`).join('')}</div>`;
  }
  function th(label, key) {
    const [k, dir] = (S.sort || '').split(':');
    const arrow = k === key ? (dir === 'desc' ? ' ↓' : ' ↑') : '';
    return key ? `<th><button type="button" data-sort="${key}">${label}${arrow}</button></th>` : `<th>${label}</th>`;
  }
  function composerTable(list, lead) {
    return `<div class="table-wrap"><table><thead><tr>${th('Composer', 'name')}${th('Born', 'born')}<th>Died</th>${th('Country of birth', 'country')}<th>Jewish connection</th><th>Flags</th>${lead ? '' : th('Works', 'nworks') + th('Free', 'nfree')}<th>Sources</th></tr></thead><tbody>
      ${list.map(c => `<tr><td><button type="button" class="rowlink" data-open="${c.id}">${esc(c.sort)}</button><span class="sub">${esc(c.desc || '')}</span></td><td class="num">${c.born || ''}</td><td class="num">${c.died || ''}</td><td>${esc(c.country || '')}<span class="sub">${esc(c.bplace || '')}</span></td><td>${connTag(c)}</td><td>${esc((c.flags || []).join('; '))}</td>${lead ? '' : `<td class="num">${nf(c.nworks)}</td><td class="num">${nf(c.nfree || 0)}</td>`}<td class="num">${(c.sources || []).length}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  function renderComposers() {
    const list = sortList(filteredComposers(), 'composers');
    const ws = list.flatMap(c => (DATA.worksBy.get(c.id) || []).filter(workPass));
    renderStats(list, ws);
    $('#count').textContent = `${nf(list.length)} composer${list.length === 1 ? '' : 's'}${hasWorkFilters() ? ' with matching works' : ''}`;
    if (!list.length) { $('#list').innerHTML = empty(); $('#pager').innerHTML = ''; return; }
    const page = paginate(list, PAGE[S.view] || 60);
    $('#list').innerHTML = S.view === 'table' ? composerTable(page) : composerCards(page);
  }
  function renderLeads() {
    const list = sortList(filteredLeads(), 'leads');
    renderStats(list, [], 'leads (no work located)');
    $('#count').innerHTML = `${nf(list.length)} lead${list.length === 1 ? '' : 's'} <span class="meta">— composers with a sourced Jewish connection but no solo piano work found yet in the sources searched</span>`;
    if (!list.length) { $('#list').innerHTML = empty(); $('#pager').innerHTML = ''; return; }
    const page = paginate(list, PAGE[S.view] || 60);
    $('#list').innerHTML = S.view === 'table' ? composerTable(page, true) : composerCards(page, true);
  }
  function availTag(w) { return `<span class="avail ${w.avail}">${esc(AVAIL[w.avail] || w.avail)}</span>`; }
  function workLink(w, c) {
    if (w.url) return w.url;
    const au = c ? c.sort : '';
    return 'https://search.worldcat.org/search?q=' + encodeURIComponent(`ti:${w.t.slice(0, 80)} au:${au.split(',')[0]}`);
  }
  function durTxt(d) { if (d == null) return ''; if (d >= 60) return `${Math.floor(d / 60)} h ${Math.round(d % 60)} min`; return `${Math.round(d * 10) / 10} min`; }
  function keyTxt(w) { return (w.key || '').replace(/-sharp/g, '♯').replace(/-flat/g, '♭'); }
  function worksTable(list, showComposer) {
    return `<div class="table-wrap"><table><thead><tr>${showComposer ? th('Composer', 'composer') : ''}${th('Title', 'title')}<th>Opus</th>${th('Key', 'key')}${th('Duration', 'dur')}${th('Year', 'yr')}<th>Genre</th>${th('Availability', 'avail')}<th>Source</th></tr></thead><tbody>
    ${list.map(w => {
      const c = DATA.byId.get(w.c);
      const note = [w.alt, w.note, w.ded ? 'Ded.: ' + w.ded : '', w.pub].filter(Boolean).join(' · ');
      return `<tr>${showComposer ? `<td><button type="button" class="rowlink" data-open="${w.c}">${esc(c ? c.sort : w.c)}</button><span class="sub">${c ? esc(yrs(c)) : ''}</span></td>` : ''}
      <td><a href="${esc(workLink(w, c))}" target="_blank" rel="noopener">${esc(w.t)}</a>${w.lh ? ' <span class="tag">left hand</span>' : ''}${note ? `<span class="sub">${esc(note.slice(0, 220))}</span>` : ''}</td>
      <td>${esc(w.op || '')}</td><td>${esc(keyTxt(w))}</td><td class="num">${durTxt(w.dur)}</td><td class="num">${w.yr || ''}</td><td>${esc((w.g || []).join(', '))}</td><td>${availTag(w)}</td><td>${esc(w.src)}${w.ev > 1 ? `<span class="sub">${w.ev} catalogue entries</span>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }
  function renderWorks() {
    const list = sortList(filteredWorks(), 'works');
    const cs = [...new Set(list.map(w => w.c))].map(id => DATA.byId.get(id));
    renderStats(cs, list);
    $('#count').textContent = `${nf(list.length)} work record${list.length === 1 ? '' : 's'} by ${nf(cs.length)} composer${cs.length === 1 ? '' : 's'}`;
    if (!list.length) { $('#list').innerHTML = empty(); $('#pager').innerHTML = ''; return; }
    $('#list').innerHTML = worksTable(paginate(list, PAGE.table), true);
  }
  function empty() { return `<div class="empty">Nothing matches these filters. <button type="button" class="link-btn" onclick="document.getElementById('resetBtn').click()">Reset all filters</button></div>`; }

  // ---------- detail ----------
  function openDetail(id, fromRoute) {
    const c = DATA.byId.get(id);
    if (!c) return;
    if (!fromRoute) { S.open = id; writeHash(false); }
    const ws = (DATA.worksBy.get(id) || []).slice().sort((a, b) => (a.src === 'IMSLP' ? 0 : 1) - (b.src === 'IMSLP' ? 0 : 1) || (a.yr || 9999) - (b.yr || 9999) || norm(a.t).localeCompare(norm(b.t)));
    const enc = encodeURIComponent;
    const au = c.sort;
    const links = [
      c.wp && ['Wikipedia', c.wp], c.wd && ['Wikidata', c.wd], c.imslp && ['IMSLP', c.imslp], c.lexm && ['LexM', c.lexm],
      ['WorldCat: piano scores', `https://search.worldcat.org/search?q=${enc(`au:${au}`)}&itemSubTypeModified=book-printedmusic`],
      !c.imslp && ['Search IMSLP', `https://imslp.org/index.php?search=${enc(c.name)}`],
      ['HathiTrust', `https://catalog.hathitrust.org/Search/Home?lookfor=${enc(c.name + ' piano')}&type=all`]
    ].filter(Boolean);
    const conn = CONN_BY[c.conn] || CONN[0];
    const prim = (c.sources || []).filter(s => s.strength === 'primary');
    const supp = (c.sources || []).filter(s => s.strength !== 'primary');
    const srcLi = s => `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a>` : esc(s.label)}<span class="lvl ${s.strength}">${s.strength}</span></li>`;
    $('#dBody').innerHTML = `
      <div class="d-head">
        ${c.img ? `<img alt="Portrait of ${esc(c.name)}" src="${esc(c.img)}?width=300" onerror="this.remove()">` : ''}
        <div>
          <h2 id="dTitle">${esc(c.name)}</h2>
          <div class="meta">${esc(yrs(c))} · born ${esc(c.bplace || 'place unknown')}${c.country ? ' (' + esc(c.country) + ')' : ''}${c.dplace ? ' · died ' + esc(c.dplace) : ''}</div>
          ${c.desc ? `<p class="desc">${esc(c.desc)}</p>` : ''}
          <div class="tags">${connTag(c)}${(c.flags || []).map(f => `<span class="tag flag">${esc(f)}</span>`).join('')}${(c.themes || []).map(f => `<span class="tag theme">${esc(f)}</span>`).join('')}${c.gender && c.gender !== 'Unknown' ? `<span class="tag">${esc(c.gender)}</span>` : ''}${c.period ? `<span class="tag">IMSLP period: ${esc(c.period)}</span>` : ''}${c.nat ? `<span class="tag">IMSLP nationality: ${esc(c.nat)}</span>` : ''}</div>
        </div>
      </div>
      <div class="d-grid">
        <div class="box">
          <h3>Jewish connection — sources</h3>
          <p class="meta" style="margin-top:0">${esc(conn.help)} “Primary” marks a source that states the connection directly (a Jewish encyclopedia, a database of Jewish or persecuted musicians, a Wikidata statement, a Wikipedia category); “supporting” marks sources that only corroborate.</p>
          <ul class="srclist">${prim.map(srcLi).join('')}${supp.map(srcLi).join('')}</ul>
        </div>
        <div class="box">
          <h3>Links &amp; score searches</h3>
          <div class="links">${links.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)} ↗</a>`).join('')}</div>
          ${c.occ && c.occ.length ? `<p class="meta">Occupations (Wikidata): ${esc(c.occ.join(', '))}</p>` : ''}
          ${c._lead ? `<p class="meta"><b>Lead:</b> no solo piano work was found in the sources searched (IMSLP, LexM, the catalogue database, Wikidata, Wikipedia work lists in several languages). The catalogue links above are the next place to look.</p>` : ''}
        </div>
      </div>
      ${ws.length ? `<div class="d-works">
        <div class="d-works-tools"><h3 style="margin:0;font-family:var(--serif)">Solo piano works (${nf(ws.length)})</h3>
        <input type="search" id="dq" placeholder="Filter these works…">
        <a class="btn ghost" href="#/works?q=${enc(c.name)}">Open in Works tab</a></div>
        <div id="dworks">${worksTable(ws, false)}</div></div>` : ''}`;
    const dq = $('#dq');
    if (dq) dq.addEventListener('input', () => {
      const t = norm(dq.value);
      $('#dworks').innerHTML = worksTable(ws.filter(w => w._s.includes(t)), false);
    });
    const dlg = $('#detail');
    if (!dlg.open) dlg.showModal();
    $('.dialog-inner').scrollTop = 0;
  }
  function closeDetail() { $('#detail').close(); }

  // ---------- map ----------
  function renderMap() {
    const cs = filteredComposers();
    renderStats(cs, cs.flatMap(c => (DATA.worksBy.get(c.id) || []).filter(workPass)));
    if (typeof L === 'undefined') { $('#map').innerHTML = '<p class="empty">The map library could not be loaded.</p>'; return; }
    if (!map) {
      map = L.map('map', { worldCopyJump: true }).setView([50, 15], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
      cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45 });
      map.addLayer(cluster);
    }
    cluster.clearLayers();
    const colors = { jewish: '#2f5d9b', convert: '#b0662a', descent: '#6b7d3a', connection: '#7a4f9a' };
    const pts = [];
    for (const c of cs) {
      if (!c.coord) continue;
      const cls = (CONN_BY[c.conn] || CONN[0]).cls;
      const m = L.circleMarker(c.coord, { radius: 7, weight: 1.5, color: '#fff', fillColor: colors[cls], fillOpacity: .9 });
      m.bindPopup(`<b>${esc(c.name)}</b><br>${esc(yrs(c))} · ${esc(c.bplace || '')}<br>${nf(c.nworks || 0)} works<br><a href="#/composer/${c.id}" data-open="${c.id}">Open profile</a>`);
      cluster.addLayer(m); pts.push(c.coord);
    }
    setTimeout(() => { map.invalidateSize(); if (pts.length) map.fitBounds(pts, { padding: [30, 30], maxZoom: 6 }); }, 50);
  }

  // ---------- timeline ----------
  function renderTimeline() {
    const cs = filteredComposers().filter(c => c.born).sort((a, b) => a.born - b.born || norm(a.sort).localeCompare(norm(b.sort)));
    renderStats(cs, cs.flatMap(c => (DATA.worksBy.get(c.id) || []).filter(workPass)));
    $('#tlLegend').innerHTML = CONN.filter(k => cs.some(c => c.conn === k.key)).map(k => `<span><span class="swatch" style="background:var(--c-${k.cls})"></span>${esc(k.label)}</span>`).join('');
    // decade histogram
    const dec = new Map();
    cs.forEach(c => { const d = Math.floor(c.born / 10) * 10; dec.set(d, (dec.get(d) || 0) + 1); });
    const d0 = 1780, d1 = 1920, maxn = Math.max(1, ...dec.values());
    const W = 900, H = 90, TOP = 14, bw = W / ((d1 - d0) / 10 + 1);
    let hs = `<svg viewBox="0 ${-TOP} ${W} ${H + 18 + TOP}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Composers by birth decade">`;
    for (let d = d0, i = 0; d <= d1; d += 10, i++) {
      const n = dec.get(d) || 0, h = n / maxn * H;
      hs += `<rect x="${i * bw + 2}" y="${H - h}" width="${bw - 4}" height="${h}" rx="3" fill="var(--accent)" opacity=".8"><title>${d}s: ${n}</title></rect>`;
      hs += `<text x="${i * bw + bw / 2}" y="${H + 13}" text-anchor="middle">${d}s</text>`;
      if (n) hs += `<text x="${i * bw + bw / 2}" y="${H - h - 3}" text-anchor="middle">${n}</text>`;
    }
    $('#decades').innerHTML = hs + '</svg>';
    // lifespans
    const y0 = 1780, y1 = 2030, left = 200, row = 16, width = 1100;
    const sx = y => left + (y - y0) / (y1 - y0) * (width - left - 10);
    const h = cs.length * row + 30;
    let s = `<svg width="${width}" height="${h}" role="img" aria-label="Composer lifespans">`;
    for (let y = 1800; y <= 2020; y += 20) s += `<line class="grid" x1="${sx(y)}" x2="${sx(y)}" y1="18" y2="${h}"/><g class="axis"><text x="${sx(y)}" y="12" text-anchor="middle">${y}</text></g>`;
    cs.forEach((c, i) => {
      const y = 22 + i * row;
      const end = c.died || Math.min(new Date().getFullYear(), c.born + 90);
      const cls = (CONN_BY[c.conn] || CONN[0]).cls;
      const hol = (c.flags || []).includes('Holocaust victim');
      s += `<g class="bar" data-open="${c.id}"><title>${esc(c.name)} (${yrs(c)}) — ${esc(c.conn)}</title>
        <text x="${left - 6}" y="${y + 10}" text-anchor="end">${esc(c.sort.length > 30 ? c.sort.slice(0, 29) + '…' : c.sort)}</text>
        <rect x="${sx(c.born)}" y="${y + 2}" width="${Math.max(2, sx(end) - sx(c.born))}" height="10" rx="4" fill="var(--c-${cls})" ${c.died ? '' : 'opacity=".5"'}/>
        ${hol ? `<rect x="${sx(end) - 3}" y="${y}" width="4" height="14" fill="var(--danger)"/>` : ''}</g>`;
    });
    $('#timeline').innerHTML = cs.length ? s + '</svg>' : empty();
  }

  // ---------- about ----------
  function renderAbout() {
    const m = DATA.meta || {};
    const c = DATA.composers, w = DATA.works;
    const bySrc = countBy(w, x => x.src);
    const byConn = countBy(c, x => x.conn);
    $('#aboutView').innerHTML = `
      <h2>What this is</h2>
      <p>An index of <b>solo piano music (two hands, plus left-hand works)</b> by composers of Jewish birth or descent, and a small number of non-Jewish composers with a documented Jewish connection, born c.1790–1920. The range reaches back before 1800 so that earlier figures such as Moscheles, Meyerbeer and Halévy stay in. It currently lists <b>${nf(c.length)}</b> composers with at least one located solo piano work, <b>${nf(w.length)}</b> work records, and <b>${nf(DATA.leads.length)}</b> “leads”: composers with a sourced Jewish connection for whom no solo piano work has been located yet.</p>
      <h2>How the list was built (${esc(m.built || '')})</h2>
      <ol>
        <li><b>Candidates.</b> Wikidata people born 1790–1920 whose occupation includes composer, pianist, organist, conductor, cantor or similar, and who meet at least one of these tests: an ethnic group or religion statement for Jews or Judaism; an identifier in the Jewish Encyclopedia (1901–06), the YIVO Encyclopedia, the Jewish Women’s Archive, the Electronic Jewish Encyclopedia, the Jewish Virtual Library, LexM, the Terezín or Yad Vashem databases, or Holocaust.cz. Added to these: members of the Wikipedia categories for Jewish composers and musicians (English, Hebrew, Czech, Hungarian, Spanish, Ukrainian) and for converts from Judaism; people linked from the Wikipedia lists of Jewish musicians and composers and from the lists of composers persecuted by the Nazi regime (German, French); and the IMSLP user list “Jewish composers at IMSLP”. Composers in earlier versions of this site were checked against the same tests; those that failed them (for example Nikolai Medtner and Aleksandr Grechaninov) are no longer listed.</li>
        <li><b>Confirming the Jewish connection.</b> A composer is included only if at least one <i>primary</i> source states the connection, or two independent <i>supporting</i> sources agree. Primary: Wikidata ethnic-group or religion statements; the Jewish Encyclopedia, YIVO, JWA; Holocaust victim databases; LexM entries recording Jewish religion or persecution on “racial” grounds; English-Wikipedia categories naming the person as Jewish or of Jewish descent; the IMSLP list. Supporting: the Electronic Jewish Encyclopedia and Jewish Virtual Library (both also cover non-Jews); categories on other-language Wikipedias; sentences in Wikipedia articles that describe the composer’s Jewish family. Being linked from a list page, or appearing on a list of persecuted composers, counts for nothing on its own. Every source is shown and linked on each composer’s profile.</li>
        <li><b>Type of connection.</b> <i>Jewish-born; converted or raised Christian</i> is assigned when a source records a conversion or baptism (of the composer or, as with Felix Mendelssohn, in childhood) or a Christian religion. <i>Jewish descent</i> is assigned when the only evidence is ancestry, or a source records one non-Jewish parent or Nazi “Mischling”/“Halbjude” classification. LexM’s “racial persecution” reflects Nazi definitions, which included converts and people with Jewish grandparents.</li>
        <li><b>Works.</b> Solo piano works come from: every IMSLP work page in the composer’s IMSLP category whose instrumentation is piano or whose tags mark solo piano (key, duration, year, dedication and first publisher are taken from the page); the work lists in LexM; the <i>Domestic Piano Repertoire</i> database of library and trade catalogues (Hofmeister, BnF, Jisc, Library of Congress, BNE, National Library of Norway, National Library of Russia), matched on the exact composer name, limited to publications dated within the composer’s working life, and excluding records the database classifies as arrangements (for example dance medleys on an operetta by other hands); Wikidata; Women at the Keys; and piano items in Wikipedia work lists. No score link was typed by hand: IMSLP links come from IMSLP’s own page index, and publication records link to a WorldCat title search.</li>
      </ol>
      <table><thead><tr><th>Source of work records</th><th>Records</th></tr></thead><tbody>${[...bySrc.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(WSRC[k] || k)}</td><td class="num">${nf(v)}</td></tr>`).join('')}</tbody></table>
      <table><thead><tr><th>Jewish connection</th><th>Composers</th></tr></thead><tbody>${[...byConn.entries()].map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${nf(v)}</td></tr>`).join('')}</tbody></table>
      <h2>Limits and cautions</h2>
      <ul>
        <li><b>Coverage is uneven.</b> IMSLP holds mostly public-domain music, so composers active after c.1930 are under-represented unless LexM, Wikipedia or a library catalogue lists their works. The catalogue data lean toward German, French, British and American publishing. Composers who published mainly in Eastern Europe, the Ottoman world or Latin America are the most likely to be missing or to appear only as leads.</li>
        <li><b>Attribution errors are possible.</b> The classification is rule-based. Wikipedia categories and Wikidata statements are crowd-sourced, the IMSLP list is one volunteer’s work, and the Electronic Jewish Encyclopedia and Jewish Virtual Library include people who were not Jewish. That is why every attribution shows its sources, and why a composer needs one primary or two supporting sources.</li>
        <li><b>“Converted or raised Christian”</b> can mean an adult conversion, a childhood baptism, or a Christian religion recorded in Wikidata. Read the linked sources before relying on the label.</li>
        <li><b>Catalogue records are publication evidence.</b> One work can appear under several title variants; the database’s solo/arrangement classification is heuristic, so a few songs or arrangements remain; and a name match can occasionally pick up a different person with the same name. Keys and durations are given only when IMSLP states them; nothing is estimated.</li>
        <li><b>Genre labels</b> are assigned from words in titles and from IMSLP tags, so they are approximate.</li>
        <li><b>History flags.</b> “Holocaust victim” is shown only for composers who died 1939–45 and are recorded as victims in a Holocaust database or Wikipedia category, or who died in a camp or ghetto. “Survived Nazi imprisonment” marks composers in the Terezín Memorial database who survived; that database also lists political prisoners, so it does not count as evidence of Jewish identity on its own. “Persecuted under Nazism” means the composer has an entry in LexM or IMSLP’s list marks them as suppressed.</li>
        <li>Place names are the birthplaces recorded in Wikidata, shown with modern country names. IMSLP’s nationality field is shown on each profile where it exists.</li>
      </ul>
      <h2>Sources and further reading</h2>
      <ul>
        <li><a href="https://imslp.org/" target="_blank" rel="noopener">IMSLP / Petrucci Music Library</a>, including the user list <a href="https://imslp.org/wiki/User:Ravpapa" target="_blank" rel="noopener">“Jewish composers at IMSLP”</a></li>
        <li><a href="https://www.lexm.uni-hamburg.de/" target="_blank" rel="noopener">LexM — Lexikon verfolgter Musiker und Musikerinnen der NS-Zeit</a>, ed. Claudia Maurer Zenck and Peter Petersen (Universität Hamburg)</li>
        <li><a href="https://www.jewishencyclopedia.com/" target="_blank" rel="noopener">The Jewish Encyclopedia</a> (1901–06); <a href="https://yivoencyclopedia.org/" target="_blank" rel="noopener">YIVO Encyclopedia of Jews in Eastern Europe</a>; <a href="https://jwa.org/encyclopedia" target="_blank" rel="noopener">Jewish Women’s Archive encyclopedia</a>; <a href="https://eleven.co.il/" target="_blank" rel="noopener">Electronic Jewish Encyclopedia (ORT)</a>; <a href="https://www.jewishvirtuallibrary.org/" target="_blank" rel="noopener">Jewish Virtual Library</a></li>
        <li><a href="https://www.pamatnik-terezin.cz/" target="_blank" rel="noopener">Terezín Memorial</a>; <a href="https://collections.yadvashem.org/en/names" target="_blank" rel="noopener">Yad Vashem names database</a>; <a href="https://www.holocaust.cz/" target="_blank" rel="noopener">Holocaust.cz</a></li>
        <li><a href="https://www.wikidata.org/" target="_blank" rel="noopener">Wikidata</a> and Wikipedia (several languages)</li>
        <li><a href="https://www.iemj.org/en/piano-music-by-jewish-composers/" target="_blank" rel="noopener">Institut Européen des Musiques Juives: Piano Music by Jewish Composers</a> (Hofmeister FH 3640, ed. Bella and Semjon Kalinowsky)</li>
        <li><a href="https://levandemusikarv.se/" target="_blank" rel="noopener">Levande musikarv / Swedish Musical Heritage</a></li>
        <li><a href="https://guides.loc.gov/jewish-composers" target="_blank" rel="noopener">Library of Congress Music Division: Jewish Composers research guide</a></li>
        <li><a href="https://www.milkenarchive.org/" target="_blank" rel="noopener">Milken Archive of Jewish Music</a>; <a href="https://exilarte.org/" target="_blank" rel="noopener">Exilarte Center for Banned Music (Vienna)</a>; <a href="https://holocaustmusic.ort.org/" target="_blank" rel="noopener">Music and the Holocaust (World ORT)</a></li>
        <li>Jascha Nemtsov, <i>Die Neue Jüdische Schule in der Musik</i> (Wiesbaden: Harrassowitz, 2004); James Loeffler, <i>The Most Musical Nation: Jews and Culture in the Late Russian Empire</i> (Yale University Press, 2010)</li>
        <li><a href="https://josebowen.github.io/women-at-the-keys/" target="_blank" rel="noopener">Women at the Keys</a> (companion database of women composers)</li>
      </ul>
      <h2>Cite this resource</h2>
      <p class="cite">Bowen, José Antonio, comp. <i>Jewish Piano Archive: Solo Piano Music by Composers of Jewish Birth or Descent, c.1790–1920.</i> ${esc((m.built || '').slice(0, 4))}. https://josebowen.github.io/JewishPiano/</p>
      <h2>Corrections</h2>
      <p>To report an error or add a source, open an issue on the <a href="https://github.com/josebowen/JewishPiano" target="_blank" rel="noopener">GitHub repository</a>. The <b>Download CSV</b> button exports whatever is currently filtered.</p>`;
  }

  // ---------- CSV ----------
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function downloadCSV() {
    let rows, name;
    if (S.tab === 'works') {
      const list = sortList(filteredWorks(), 'works');
      rows = [['composer', 'born', 'died', 'country_of_birth', 'jewish_connection', 'title', 'alternative_title', 'opus', 'key', 'duration_min', 'year', 'genres', 'availability', 'record_source', 'url', 'notes']];
      for (const w of list) { const c = DATA.byId.get(w.c); rows.push([c.sort, c.born, c.died, c.country, c.conn, w.t, w.alt, w.op, w.key, w.dur, w.yr, (w.g || []).join('; '), AVAIL[w.avail], w.src, workLink(w, c), [w.note, w.pub, w.ded].filter(Boolean).join(' | ')]); }
      name = 'jewish-piano-works.csv';
    } else {
      const list = S.tab === 'leads' ? sortList(filteredLeads(), 'leads') : sortList(filteredComposers(), 'composers');
      rows = [['composer', 'born', 'died', 'birthplace', 'country_of_birth', 'region', 'gender', 'jewish_connection', 'flags', 'themes', 'works', 'free_scores', 'sources', 'wikipedia', 'wikidata', 'imslp', 'lexm']];
      for (const c of list) rows.push([c.sort, c.born, c.died, c.bplace, c.country, c.region, c.gender, c.conn, (c.flags || []).join('; '), (c.themes || []).join('; '), c.nworks, c.nfree, (c.sources || []).map(s => s.label + (s.url ? ' <' + s.url + '>' : '')).join(' | '), c.wp, c.wd, c.imslp, c.lexm]);
      name = S.tab === 'leads' ? 'jewish-piano-leads.csv' : 'jewish-piano-composers.csv';
    }
    const blob = new Blob(['﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
})();
