/* ================= admin: Summary — the recorded care pattern as compact analytics =================
   Four tabs (Overview · Overnight · Incidents · Near misses), one toolbar, one coverage line.
   Every figure comes from p9a_metrics.js (metrics-v3). Source import, review, checks and report
   versions live behind "Manage data" so the dashboard stays a dashboard. */
var SUM_PAGE = 1000;
var SUM_TABS = [['overview', 'Overview'], ['overnight', 'Overnight'], ['incidents', 'Incidents'], ['near', 'Near misses']];

function sbSelAll(table, query){
  var all = [];
  function page(off){ return sbSel(table, query + '&order=id&limit=' + SUM_PAGE + '&offset=' + off).then(function(rows){ rows = rows || []; all = all.concat(rows); return rows.length === SUM_PAGE ? page(off + SUM_PAGE) : all; }); }
  return page(0);
}
function sumState(){
  if (!state.sum) { var y = addDays(todayYmd(), -1); state.sum = { view: 'overview', client: null, from: addDays(y, -27), to: y, preset: '4w', loading: false, loadedKey: null, data: null, ds: null, evidenceTables: null, versions: [], demo: false, obsFilter: 'proposed', err: null, frozen: null, drawer: null, exportOpts: { overnight: true, incidents: true, near: true, appendix: true } }; }
  return state.sum;
}
function sumClient(){
  var S = sumState();
  if (S.demo) return S.demoClient || (S.demoClient = evDemoDataset(S.from, S.to).client);
  if (!S.client) { var t = state.data.clients.find(function(c){ return c.name === 'Tim'; }); S.client = t ? t.id : (state.data.clients[0] || {}).id; }
  return clientById(S.client);
}
function sumIsMissingTable(e){ return /42P01|does not exist|relation|404|PGRST205|Could not find the table/i.test((e && e.message) || ''); }
/* the authenticated account doing the review: the worker row for this session, or for the
   admin portal (server-verified PIN → the admin auth account) the admin's own worker row */
function sumMe(){ var w = me() || (state.auth && state.auth.mode === 'admin' ? state.data.workers.find(function(x){ return x.is_admin; }) : null); return { id: w ? w.id : null, name: w ? w.name : 'Admin', email: w ? (w.email || '') : '' }; }

/* ---------- load the period: everything from the server, paginated, nothing from the rolling cache ---------- */
function sumLoad(force){
  var S = sumState(), c = sumClient(); if (!c) return Promise.resolve();
  var key = (S.demo ? 'demo' : c.id) + '|' + S.from + '|' + S.to;
  if (!force && S.loadedKey === key && S.data) return Promise.resolve();
  S.loading = true; S.err = null; S.frozen = null; render();
  if (S.demo) {
    var demo = evDemoDataset(S.from, S.to); S.demoClient = demo.client;
    S.data = demo; S.versions = S.demoVersions || []; S.evidenceTables = true; S.loadedKey = key; S.loading = false; sumCompute(); render(); return Promise.resolve();
  }
  var q = 'select=*&participant_id=eq.' + c.id;
  var ev = Promise.all([ sbSelAll('ac_evidence_sources', q), sbSelAll('ac_evidence_observations', q + '&obs_date=gte.' + addDays(S.from, -1) + '&obs_date=lte.' + addDays(S.to, 1)), sbSelAll('ac_report_versions', q) ])
    .then(function(r){ S.evidenceTables = true; return { sources: r[0], observations: r[1], versions: r[2].sort(function(a, b){ return a.created_at < b.created_at ? 1 : -1; }) }; })
    ["catch"](function(e){ if (sumIsMissingTable(e)) { S.evidenceTables = false; return { sources: [], observations: [], versions: [] }; } throw e; });
  return Promise.all([
    sbSelAll('ac_shifts', 'select=*&client_id=eq.' + c.id + '&date=gte.' + S.from + '&date=lte.' + S.to),
    sbSelAll('ac_incident_forms', q + '&incident_date=gte.' + S.from + '&incident_date=lte.' + S.to),
    sbSelAll('ac_near_misses', q + '&nm_date=gte.' + S.from + '&nm_date=lte.' + S.to),
    sbSelAll('ac_care_logs', q), sbSelAll('ac_overnight_logs', q), sbSelAll('ac_note_entries', q + '&note_type=neq.Mileage&select=id,shift_id,participant_id,worker_id,note_type,body,created_at'),
    ev
  ]).then(function(r){
    S.data = { client: c, shifts: r[0], incidents: r[1], nearMisses: r[2], careLogs: r[3], overnightLogs: r[4], notes: r[5], sources: r[6].sources, observations: r[6].observations };
    S.versions = r[6].versions || []; S.loadedKey = key; S.loading = false; sumCompute(); render();
  })["catch"](function(e){ S.loading = false; S.err = e.message; render(); });
}
function sumCompute(){
  var S = sumState(), c = sumClient(); if (!S.data || !c) return;
  var inp = { client: c, from: S.from, to: S.to, tz: 'Australia/Melbourne', now: S.demo ? S.data.now : new Date().toISOString() };
  ['shifts', 'incidents', 'nearMisses', 'careLogs', 'overnightLogs', 'notes', 'sources', 'observations'].forEach(function(k){ inp[k] = S.data[k] || []; });
  S.ds = evBuildDataset(inp);
}
function sumSetPeriod(from, to, preset){ var S = sumState(); S.from = from; S.to = to; S.preset = preset || null; sumLoad(true); }

/* ---------- tiny formatters ---------- */
function anN(v){ return v == null ? 'Not recorded' : String(v); }
function anH(v){ return v == null ? 'Not recorded' : hrsFmt(v) + ' h'; }
function anFmtNight(r){ return fmtDate(r.date) + ' → ' + fmtDate(r.endDate); }
function anShortRange(a, b){ var pa = pd(a), pb = pd(b); return (pa.getMonth() === pb.getMonth() ? pa.getDate() + '–' + pb.getDate() + ' ' + MON3[pb.getMonth()] : fmtDate(a).slice(4) + ' – ' + fmtDate(b).slice(4)) + ' ' + pb.getFullYear(); }
function anStatusWord(s){ return { complete: 'complete', partial: 'partial', missing: 'not recorded', inProgress: 'in progress', future: 'not started' }[s] || s; }

/* ---------- compact building blocks ---------- */
function anMetric(label, value, unit, note, opts){
  opts = opts || {};
  var missing = value == null;
  return el('div', { 'class': 'an-metric' + (missing ? ' na' : ''), role: 'group', 'aria-label': label }, [
    el('div', { 'class': 'l' }, label),
    el('div', { 'class': 'v' }, [ missing ? (opts.insufficient ? 'Insufficient data' : 'Not recorded') : (typeof value === 'number' && opts.hours ? hrsFmt(value) : String(value)), (!missing && unit) ? el('span', { 'class': 'u' }, ' ' + unit) : null ]),
    note ? el('div', { 'class': 'n' }, note) : null
  ]);
}
function anSec(title, caption, kids, opts){
  opts = opts || {};
  return el('section', { 'class': 'an-sec' + (opts.cls ? ' ' + opts.cls : ''), 'aria-label': title }, [
    el('div', { 'class': 'an-sec-h' }, [ el('h3', null, title), caption ? el('div', { 'class': 'an-cap' }, caption) : null, opts.action || null ])
  ].concat(kids || []));
}
function anEmpty(text){ return el('div', { 'class': 'an-empty' }, text); }
function anTableToggle(label, tableNode){ return el('details', { 'class': 'an-details' }, [ el('summary', null, label || 'Show as a table'), tableNode ]); }
function anLegend(items){ return el('div', { 'class': 'an-legend' }, items.map(function(it){ return el('span', null, [ el('i', { style: 'background:' + it.c + (it.dash ? ';background:none;border:1px dashed var(--dim)' : '') + (it.hatch ? ';background:repeating-linear-gradient(45deg,' + it.c + ' 0 2px,#fff 2px 4px)' : '') }), it.l ]); })); }
function anCaption(txt){ return el('div', { 'class': 'an-fig-cap' }, txt); }

/* vertical bars. rows: [{label, value|null, status:'complete'|'partial'|'missing'|'inProgress'|'future', title, onSelect}]
   opts: {unit, yMax, height, color, aria, fmt} */
function anW(opts){ return opts && opts.width ? opts.width : (typeof window !== 'undefined' && window.innerWidth < 640 ? 380 : 720); }
function anBars(rows, opts){
  opts = opts || {};
  var W = anW(opts), H = opts.height || 190, padL = 40, padR = 10, top = 16, bottom = 30, plotH = H - top - bottom, plotW = W - padL - padR;
  var vals = rows.map(function(r){ return r.value; }).filter(function(v){ return v != null; });
  var maxV = vals.length ? Math.max.apply(null, vals) : 0;
  var yMax = opts.yMax || (maxV <= 4 ? 4 : maxV <= 8 ? 8 : Math.ceil(maxV / 5) * 5);
  var n = rows.length || 1, slot = plotW / n, bw = Math.min(22, Math.max(4, slot - 6));
  var svg = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', 'class': 'an-svg', role: 'img', 'aria-label': opts.aria || 'Bar chart' });
  function yOf(v){ return top + plotH - v / yMax * plotH; }
  for (var g = 0; g <= 4; g++) { var v = yMax / 4 * g, y = yOf(v); svg.appendChild(svgNode('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: g === 0 ? '#94A3B8' : '#E5E9EE', 'stroke-width': 1 })); svg.appendChild(svgText(padL - 6, y + 3.5, (Math.round(v * 100) / 100) + (opts.unit ? ' ' + opts.unit : ''), { 'text-anchor': 'end', 'font-size': 10, fill: '#64748B' })); }
  var every = n <= 16 ? 1 : Math.ceil(n / 14);
  rows.forEach(function(r, i){
    var x = padL + i * slot + (slot - bw) / 2, base = yOf(0);
    var g2 = svgNode('g', { 'class': r.onSelect ? 'an-hit' : '', tabindex: r.onSelect ? '0' : null, role: r.onSelect ? 'button' : null, 'aria-label': r.title || r.label });
    if (r.onSelect) { g2.addEventListener('click', r.onSelect); g2.addEventListener('keydown', function(e){ if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.onSelect(); } }); }
    g2.appendChild(svgNode('rect', { x: x - 2, y: top, width: bw + 4, height: plotH, fill: 'transparent' }));
    if (r.value == null) {
      var hh = Math.max(10, plotH * 0.12);
      g2.appendChild(svgNode('rect', { x: x, y: base - hh, width: bw, height: hh, fill: r.status === 'partial' ? 'url(#an-hatch)' : 'none', stroke: '#94A3B8', 'stroke-dasharray': r.status === 'partial' ? '' : '3 2', 'stroke-width': 1 }));
      if (slot >= 34) g2.appendChild(svgText(x + bw / 2, base - hh - 4, r.status === 'inProgress' ? 'now' : (r.status === 'future' ? 'later' : (r.status === 'partial' ? 'partial' : 'n/r')), { 'text-anchor': 'middle', 'font-size': 9, fill: '#64748B' }));
    } else {
      var hgt = Math.max(0, base - yOf(r.value));
      g2.appendChild(svgNode('rect', { x: x, y: base - hgt, width: bw, height: hgt, fill: r.status === 'partial' ? 'url(#an-hatch)' : (opts.color || RP_C.acc), stroke: r.status === 'partial' ? RP_C.acc : 'none', 'stroke-width': 1 }));
      if (slot >= 30 && (opts.labels !== false)) g2.appendChild(svgText(x + bw / 2, base - hgt - 4, opts.fmt ? opts.fmt(r.value) : String(r.value), { 'text-anchor': 'middle', 'font-size': 10, fill: '#172B4D' }));
    }
    var t = svgNode('title'); t.textContent = r.title || (r.label + ': ' + (r.value == null ? anStatusWord(r.status) : r.value + (opts.unit ? ' ' + opts.unit : ''))); g2.appendChild(t);
    svg.appendChild(g2);
    if (i % every === 0) svg.appendChild(svgText(x + bw / 2, H - 10, r.label, { 'text-anchor': 'middle', 'font-size': 10, fill: '#475569' }));
  });
  svg.insertBefore(svgNode('defs', {}, [ (function(){ var p = svgNode('pattern', { id: 'an-hatch', width: 4, height: 4, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }); p.appendChild(svgNode('rect', { width: 2, height: 4, fill: RP_C.acc, opacity: 0.55 })); return p; })() ]), svg.firstChild);
  return el('div', { 'class': 'an-fig' }, svg);
}
/* grouped columns for a time series. buckets:[{label, vals:[..]}] series:[{label,color}] */
function anSeries(buckets, series, opts){
  opts = opts || {};
  var W = anW(opts), H = opts.height || 180, padL = 34, padR = 10, top = 14, bottom = 30, plotH = H - top - bottom, plotW = W - padL - padR;
  var maxV = 0; buckets.forEach(function(b){ b.vals.forEach(function(v){ if (v != null && v > maxV) maxV = v; }); });
  var yMax = maxV <= 4 ? 4 : maxV <= 8 ? 8 : Math.ceil(maxV / 5) * 5;
  var n = buckets.length || 1, slot = plotW / n, k = series.length, bw = Math.min(18, Math.max(3, (slot - 6) / k - 2)), gw = k * bw + (k - 1) * 2;
  var svg = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', 'class': 'an-svg', role: 'img', 'aria-label': opts.aria || 'Time series' });
  function yOf(v){ return top + plotH - v / yMax * plotH; }
  for (var g = 0; g <= 4; g++) { var v = yMax / 4 * g; if (v !== Math.round(v)) continue; var y = yOf(v); svg.appendChild(svgNode('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: g === 0 ? '#94A3B8' : '#E5E9EE', 'stroke-width': 1 })); svg.appendChild(svgText(padL - 6, y + 3.5, String(v), { 'text-anchor': 'end', 'font-size': 10, fill: '#64748B' })); }
  var every = n <= 16 ? 1 : Math.ceil(n / 14);
  buckets.forEach(function(b, i){
    var x0 = padL + i * slot + (slot - gw) / 2, base = yOf(0);
    b.vals.forEach(function(v, si){ if (v == null || v === 0) return; var x = x0 + si * (bw + 2), h = base - yOf(v); var r = svgNode('rect', { x: x, y: base - h, width: bw, height: h, fill: series[si].color }); var t = svgNode('title'); t.textContent = b.label + ' · ' + series[si].label + ': ' + v; r.appendChild(t); svg.appendChild(r); if (slot >= 26) svg.appendChild(svgText(x + bw / 2, base - h - 3, String(v), { 'text-anchor': 'middle', 'font-size': 9, fill: '#172B4D' })); });
    if (b.coverage != null && b.coverage === 0) svg.appendChild(svgText(x0 + gw / 2, base - 4, '·', { 'text-anchor': 'middle', 'font-size': 10, fill: '#94A3B8' }));
    if (i % every === 0) svg.appendChild(svgText(x0 + gw / 2, H - 10, b.label, { 'text-anchor': 'middle', 'font-size': 10, fill: '#475569' }));
  });
  return el('div', { 'class': 'an-fig' }, svg);
}
/* horizontal bars: rows [{label, n, note}] */
function anHBars(rows, opts){
  opts = opts || {};
  if (!rows.length) return anEmpty(opts.empty || 'Nothing recorded in this period.');
  var max = Math.max.apply(null, rows.map(function(r){ return r.n; })) || 1;
  return el('div', { 'class': 'an-hbars', role: 'list' }, rows.map(function(r){
    return el('div', { 'class': 'an-hb', role: 'listitem' }, [ el('div', { 'class': 'l', title: r.label }, r.label), el('div', { 'class': 't' }, el('i', { style: 'width:' + (r.n / max * 100) + '%;background:' + (opts.color || RP_C.acc) })), el('div', { 'class': 'n' }, [ String(r.n), r.note ? el('span', { 'class': 'an-note' }, ' ' + r.note) : null ]) ]);
  }));
}
/* time-of-night timeline organised by the night the shift started */
function anTimeline(events, rows){
  var nightsWith = {}; events.forEach(function(e){ nightsWith[e.night] = 1; });
  var nights = rows.filter(function(r){ return nightsWith[r.date]; }).map(function(r){ return r.date; });
  Object.keys(nightsWith).forEach(function(d){ if (nights.indexOf(d) < 0) nights.push(d); }); nights.sort();
  if (!nights.length) return anEmpty('No reviewed overnight events with a stated time in this period.');
  var W = anW(), padL = W < 500 ? 70 : 92, padR = 10, rowH = 18, top = 22, H = top + nights.length * rowH + 14, plotW = W - padL - padR, span = 15 * 60;
  function xOf(t){ var m = evNightAxis(t); return padL + (m / span) * plotW; }
  var svg = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', 'class': 'an-svg', role: 'img', 'aria-label': 'When overnight assistance happened, one row per night' });
  ['18:00', '20:00', '22:00', '23:00', '01:00', '03:00', '05:00', '07:00', '09:00'].forEach(function(t){ var x = xOf(t); svg.appendChild(svgNode('line', { x1: x, x2: x, y1: top - 4, y2: H - 10, stroke: t === '23:00' || t === '07:00' ? '#94A3B8' : '#E5E9EE', 'stroke-width': 1 })); svg.appendChild(svgText(x, top - 8, fmtTime(t), { 'text-anchor': 'middle', 'font-size': 10, fill: '#64748B' })); });
  svg.appendChild(svgNode('rect', { x: xOf('23:00'), y: top - 2, width: xOf('07:00') - xOf('23:00'), height: nights.length * rowH, fill: RP_C.acc, opacity: 0.05 }));
  var col = { overnight_assist: RP_C.acc, overnight_supervision: RP_C.warn, overnight_awake_no_assist: '#94A3B8' };
  nights.forEach(function(d, i){
    var y = top + i * rowH + 9;
    svg.appendChild(svgText(padL - 6, y + 3.5, fmtDate(d), { 'text-anchor': 'end', 'font-size': 10, fill: '#475569' }));
    events.filter(function(e){ return e.night === d && e.start; }).forEach(function(e){
      var x = xOf(e.start), c = col[e.category] || '#94A3B8';
      var node = e.end ? svgNode('rect', { x: x, y: y - 5, width: Math.max(3, xOf(e.end) - x), height: 10, rx: 1, fill: c }) : svgNode('circle', { cx: x, cy: y, r: 4, fill: c, stroke: '#fff', 'stroke-width': 1.5 });
      var t = svgNode('title'); t.textContent = fmtTime(e.start) + (e.end ? '–' + fmtTime(e.end) : ' (no end time)') + ' · ' + (e.activity || e.category.replace(/_/g, ' ')) + (e.reason ? ' — ' + e.reason : '') + ' · ' + e.timing; node.appendChild(t); svg.appendChild(node);
    });
  });
  return el('div', { 'class': 'an-fig' }, svg);
}

/* ---------- record inspection (what is behind a figure) ---------- */
function anOpenRecord(kind, id){
  var S = sumState(), D = S.data; if (!D) return;
  if (S.demo) { toast('Demonstration data — synthetic record ' + id); return; }
  if (kind === 'incident') { var i = D.incidents.find(function(x){ return x.id === id; }); if (i) openIncidentModal({ incident: i, shift: i.shift_id ? (D.shifts.find(function(s){ return s.id === i.shift_id; }) || shiftById(i.shift_id)) : null }); }
  else if (kind === 'near_miss') { var nmr = D.nearMisses.find(function(x){ return x.id === id; }); if (nmr) openNearMissModal({ nearMiss: nmr, shift: nmr.shift_id ? (D.shifts.find(function(s){ return s.id === nmr.shift_id; }) || null) : null }); }
  else if (kind === 'overnight') { var sh = D.shifts.find(function(s){ return s.id === id; }); if (sh) { if (!state.data.shifts.some(function(x){ return x.id === sh.id; })) state.data.shifts.push(sh); if (!state.data.overnightLogs.some(function(l){ return l.shift_id === sh.id; })) D.overnightLogs.filter(function(l){ return l.shift_id === sh.id; }).forEach(function(l){ state.data.overnightLogs.push(l); }); openOvernightModal({ shift: sh }); } }
  else if (kind === 'care') { var sh2 = D.shifts.find(function(s){ return s.id === id; }); if (sh2) { if (!state.data.shifts.some(function(x){ return x.id === sh2.id; })) state.data.shifts.push(sh2); if (!state.data.careLogs.some(function(l){ return l.shift_id === sh2.id; })) D.careLogs.filter(function(l){ return l.shift_id === sh2.id; }).forEach(function(l){ state.data.careLogs.push(l); }); openCareLogModal({ shift: sh2 }); } }
  else if (kind === 'observation') { var o = (D.observations || []).find(function(x){ return x.id === id; }); if (o) sumObsModal(o); }
}
function anInspect(title, sub, rows){
  /* rows: [{label, detail, open:{kind,id}}] */
  var m = el('div', { 'class': 'modal', style: 'max-width:560px' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', null, [ el('div', { 'class': 't-title' }, title), sub ? el('div', { 'class': 't-cap' }, sub) : null ]), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'modal-body' }, rows.length ? el('div', { 'class': 'an-reclist' }, rows.map(function(r){ return el('div', { 'class': 'an-rec' }, [ el('div', { style: 'flex:1;min-width:0' }, [ el('b', null, r.label), r.detail ? el('div', { 'class': 't-cap' }, r.detail) : null ]), r.open ? el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ anOpenRecord(r.open.kind, r.open.id); } }, 'Open') : null ]); })) : anEmpty('No supporting records.')),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Close') ])
  ]);
  openModal(m);
}
function anNightRecords(r){
  var S = sumState(), rows = [];
  if (r.summaryId) rows.push({ label: 'Overnight summary', detail: (r.bed ? 'bed ' + fmtTime(r.bed) : 'bed time not recorded') + ' · ' + (r.up ? 'up ' + fmtTime(r.up) : 'up time not recorded') + ' · ' + (r.asleep != null ? hrsFmt(r.asleep) + ' h asleep · ' : '') + (r.assistBasis === 'summary' ? hrsFmt(r.assistHours) + ' h assistance' : 'hours not entered'), open: { kind: 'overnight', id: r.shiftId } });
  (S.ds.overnight.timeline || []).filter(function(t){ return t.night === r.date; }).forEach(function(t){ rows.push({ label: (t.start ? fmtTime(t.start) : '') + (t.end ? '–' + fmtTime(t.end) : '') + ' ' + (t.activity || t.category.replace(/_/g, ' ')), detail: (t.reason ? t.reason + ' · ' : '') + t.timing + ' · ' + t.sourceTitle + (t.sourceRef ? ' · ' + t.sourceRef : ''), open: { kind: 'observation', id: t.id } }); });
  (S.data.incidents || []).filter(function(i){ return i.incident_date === r.endDate && i.incident_time && tMin(i.incident_time) < 720 || i.incident_date === r.date && i.incident_time && tMin(i.incident_time) >= 18 * 60; }).forEach(function(i){ rows.push({ label: 'Incident report ' + fmtDate(i.incident_date) + ' ' + fmtTime(i.incident_time), detail: (i.incident_types || []).join(', '), open: { kind: 'incident', id: i.id } }); });
  anInspect('Night of ' + anFmtNight(r), anStatusWord(r.status) + (r.status === 'complete' ? '' : r.status === 'partial' ? ' — only what is recorded is shown' : ' — no record exists for this night'), rows);
}

/* ---------- the tab ---------- */
function viewReports(main){
  var S = sumState(), c = sumClient();
  var doc = el('div', { 'class': 'an-doc' }); main.appendChild(doc);
  /* toolbar */
  var presets = [['7d', '7 days', 6], ['4w', '4 weeks', 27], ['12w', '12 weeks', 83]];
  doc.appendChild(el('div', { 'class': 'an-bar rp-controls' }, [
    el('h1', { 'class': 'an-h1' }, 'Summary'),
    S.demo ? el('span', { 'class': 'status missing' }, 'Demonstration — synthetic participant') : el('select', { 'class': 'sel an-sel', 'aria-label': 'Participant', onchange: function(e){ S.client = e.target.value; S.data = null; sumLoad(true); } }, state.data.clients.map(function(x){ return el('option', { value: x.id, selected: x.id === S.client }, x.name); })),
    el('label', { 'class': 'an-lab' }, [ 'From ', el('input', { 'class': 'inp an-date', type: 'date', value: S.from, 'aria-label': 'From date', onchange: function(e){ sumSetPeriod(e.target.value, S.to, null); } }) ]),
    el('label', { 'class': 'an-lab' }, [ 'To ', el('input', { 'class': 'inp an-date', type: 'date', value: S.to, 'aria-label': 'To date', onchange: function(e){ sumSetPeriod(S.from, e.target.value, null); } }) ]),
    el('div', { 'class': 'seg an-seg', role: 'group', 'aria-label': 'Preset periods' }, presets.map(function(p){ return el('button', { 'class': S.preset === p[0] ? 'on' : '', onclick: function(){ var y = addDays(todayYmd(), -1); sumSetPeriod(addDays(y, -p[2]), y, p[0]); } }, p[1]); })),
    el('div', { 'class': 'spacer' }),
    el('button', { 'class': 'btn btn-sm btn-sec', onclick: sumOpenManage }, 'Manage data' + (S.ds && S.ds.coverage.records.observationsProposed ? ' (' + S.ds.coverage.records.observationsProposed + ')' : '')),
    el('button', { 'class': 'btn btn-sm btn-pri', onclick: sumOpenExport }, [svgIcon(IC.file), 'Export'])
  ]));
  if (!S.data && !S.loading && !S.err) sumLoad();
  if (S.loading) { doc.appendChild(el('div', { 'class': 'an-cov', role: 'status' }, 'Loading every record for ' + (c ? c.name : '') + ', ' + fmtDate(S.from) + ' to ' + fmtDate(S.to) + '…')); return; }
  if (S.err) { doc.appendChild(el('div', { 'class': 'banner warn' }, [ el('div', null, [ el('b', null, 'Could not load the period'), el('div', { 'class': 't-cap' }, S.err) ]) ])); return; }
  if (!S.ds) return;
  var ds = S.ds;
  doc.appendChild(el('div', { 'class': 'an-cov' }, [ el('b', null, c.name + ' · ' + anShortRange(ds.from, ds.to)), ' · ' + sumCoverageLine(ds), S.evidenceTables === false ? el('span', { 'class': 't-cap' }, ' · imports unavailable (migration 002)') : null ]));
  doc.appendChild(el('div', { 'class': 'seg an-tabs rp-controls', role: 'tablist', 'aria-label': 'Summary views' }, SUM_TABS.map(function(v){ return el('button', { 'class': S.view === v[0] ? 'on' : '', role: 'tab', 'aria-selected': S.view === v[0] ? 'true' : 'false', onclick: function(){ S.view = v[0]; render(); } }, v[1]); })));
  ({ overview: sumOverview, overnight: sumOvernight, incidents: sumIncidents, near: sumNearMisses })[S.view](doc, ds, c);
}
function sumCoverageLine(ds){
  var cv = ds.coverage, o = ds.overnight;
  var parts = [];
  parts.push(cv.nights.rostered + ' rostered night' + (cv.nights.rostered === 1 ? '' : 's'));
  if (o.inScope) parts.push(o.complete + ' logged' + (o.partial ? ' · ' + o.partial + ' partial' : '') + ' · ' + o.missing + ' not recorded');
  if (o.notYet) parts.push(o.notYet + ' not yet finished');
  parts.push(cv.shifts.completed + ' completed shift' + (cv.shifts.completed === 1 ? '' : 's') + ', ' + cv.shifts.withNote + ' with a note');
  if (cv.shifts.inProgress) parts.push(cv.shifts.inProgress + ' in progress');
  return parts.join(' · ');
}

/* ---------- Overview ---------- */
function sumMetricsRow(ds){
  var m = ds.metrics;
  return el('div', { 'class': 'an-metrics' }, [
    anMetric('Falls recorded', m.falls.value, 'falls', m.falls.note),
    anMetric('Near misses recorded', m.nearMisses.value, 'near misses', m.nearMisses.note),
    anMetric('Assisted transfers recorded', m.transfers.value, 'transfers', m.transfers.note),
    anMetric('Incidents involving an emergency call', m.emergency.value, 'of ' + m.emergency.of, 'attendance is not recorded on the form'),
    anMetric('Average recorded overnight assistance', m.overnightAvg.value, 'h per night', m.overnightAvg.note, { hours: true, insufficient: true }),
    anMetric('Nights with complete overnight data', m.nightsUsable.value, 'of ' + m.nightsUsable.of + ' in scope', m.nightsUsable.note, { insufficient: true })
  ]);
}
function sumNightBars(ds, height){
  var rows = ds.overnight.rows.filter(function(r){ return r.status !== 'future'; });
  return anBars(rows.map(function(r){ return { label: fmtDM(r.date), value: r.assistHours, status: r.status, title: 'Night of ' + anFmtNight(r) + ': ' + (r.assistHours == null ? anStatusWord(r.status) : hrsFmt(r.assistHours) + ' h recorded assistance' + (r.status === 'partial' ? ' (partial)' : '')), onSelect: function(){ anNightRecords(r); } }; }), { unit: 'h', height: height || 190, aria: 'Recorded overnight assistance per night', fmt: function(v){ return hrsFmt(v); } });
}
function sumNightTable(ds){
  return rpTable([ 'Night', 'Record', { t: 'Assistance', n: true }, { t: 'Asleep', n: true }, { t: 'Unaccounted', n: true }, { t: 'Wakes*', n: true }, { t: 'Episodes', n: true }, '' ], ds.overnight.rows.filter(function(r){ return r.status !== 'future'; }).map(function(r){
    return [ anFmtNight(r), { t: anStatusWord(r.status) + (r.assistBasis === 'observations' ? ' (from intervals)' : ''), m: r.status !== 'complete' }, { t: r.assistHours == null ? '—' : hrsFmt(r.assistHours) + ' h', n: true }, { t: r.asleep == null ? '—' : hrsFmt(r.asleep) + ' h', n: true }, { t: r.awakeNoAssist == null ? '—' : hrsFmt(r.awakeNoAssist) + ' h', n: true }, { t: r.wakes == null ? '—' : String(r.wakes), n: true }, { t: r.observed.episodes ? String(r.observed.episodes) : '—', n: true }, el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ anNightRecords(r); } }, 'Details') ];
  }));
}
function sumSeriesChart(ds, keysWanted, series, height){
  var b = ds.series.buckets;
  return anSeries(b.map(function(k){ return { label: ds.series.mode === 'day' ? fmtDM(k.key) : 'wk ' + fmtDM(k.key), vals: keysWanted.map(function(w){ return k[w]; }), coverage: k.shifts + k.nights }; }), series, { height: height || 170, aria: series.map(function(s){ return s.label; }).join(' and ') + ' per ' + ds.series.mode });
}
function sumSeriesTable(ds, cols){
  return rpTable([ ds.series.mode === 'day' ? 'Day' : 'Week starting' ].concat(cols.map(function(c){ return { t: c[1], n: true }; })).concat([{ t: 'Shifts in scope', n: true }]), ds.series.buckets.map(function(k){ return [ fmtDate(k.key) ].concat(cols.map(function(c){ return { t: k[c[0]] == null ? '—' : String(k[c[0]]), n: true }; })).concat([{ t: String(k.shifts + k.nights), n: true }]); }));
}
function sumOverview(doc, ds, c){
  var o = ds.overnight, cr = ds.care;
  doc.appendChild(sumMetricsRow(ds));
  /* A overnight */
  doc.appendChild(anSec('Overnight assistance', 'Recorded worker assistance per night inside 23:00–07:00, in hours. Hatched = partial record, dashed = not recorded. Select a bar to see its records.', o.rows.length ? [
    sumNightBars(ds), anLegend([{ c: RP_C.acc, l: 'From the overnight summary' }, { c: RP_C.acc, hatch: true, l: 'Partial (reviewed intervals only)' }, { c: '', dash: true, l: 'Not recorded' }]),
    anCaption(o.avgAssist.n + ' of ' + o.inScope + ' nights in scope have a recorded value' + (o.avgAssist.hours != null ? ' · average ' + hrsFmt(o.avgAssist.hours) + ' h' : '') + (o.notYet ? ' · ' + o.notYet + ' not yet finished' : '')),
    anTableToggle('Show nights as a table', sumNightTable(ds))
  ] : [ anEmpty('No sleepover shifts rostered in this period.') ]));
  /* B falls and near misses */
  doc.appendChild(anSec('Falls and near misses over time', 'Recorded events per ' + ds.series.mode + '. A ' + ds.series.mode + ' with no bar had no recorded event; it does not prove nothing happened where records are missing.', [
    sumSeriesChart(ds, ['falls', 'nearMisses'], [{ label: 'Falls', color: RP_C.bad }, { label: 'Near misses', color: RP_C.warn }]), anLegend([{ c: RP_C.bad, l: 'Falls' }, { c: RP_C.warn, l: 'Near misses' }]),
    anCaption(ds.incidents.falls + ' fall' + (ds.incidents.falls === 1 ? '' : 's') + ' and ' + ds.nearMisses.n + ' near miss' + (ds.nearMisses.n === 1 ? '' : 'es') + ' across ' + ds.coverage.shifts.completed + ' completed shift' + (ds.coverage.shifts.completed === 1 ? '' : 's') + ', ' + ds.coverage.shifts.withNote + ' documented with a note'),
    anTableToggle('Show as a table', sumSeriesTable(ds, [['falls', 'Falls'], ['nearMisses', 'Near misses'], ['incidents', 'All incidents']]))
  ]));
  /* C transfers and personal care */
  var meas = cr.measures.filter(function(m){ return m.recorded > 0; });
  doc.appendChild(anSec('Transfers and personal care', 'Assisted transfers per ' + ds.series.mode + ' from the personal care log (structured count), and the care measures that have data. Days without a log are not zero.', cr.logs || cr.transfers.fromObservations ? [
    el('div', { 'class': 'an-grid2' }, [
      el('div', null, [ el('div', { 'class': 'an-sub' }, 'Assisted transfers'), anSeries(ds.series.buckets.map(function(k){ return { label: ds.series.mode === 'day' ? fmtDM(k.key) : 'wk ' + fmtDM(k.key), vals: [k.transfers], coverage: k.transferDays }; }), [{ label: 'Assisted transfers', color: RP_C.acc }], { height: 170, width: window.innerWidth < 640 ? 380 : 460, aria: 'Assisted transfers per ' + ds.series.mode }), anCaption((cr.transfers.logged == null ? 'No care log answered the transfers count' : cr.transfers.logged + ' transfers on ' + cr.transfers.loggedDays + ' logged day' + (cr.transfers.loggedDays === 1 ? '' : 's') + (cr.transfers.perDay != null ? ' · ' + hrsFmt(cr.transfers.perDay) + ' per logged day' : '')) + (cr.transfers.fromObservations ? ' · +' + cr.transfers.fromObservations + ' reviewed on unlogged days' : '')) ]),
      el('div', null, [ el('div', { 'class': 'an-sub' }, 'Care measures (totals over the logs that answered)'), anHBars(meas.map(function(m){ return { label: m.label, n: m.total, note: 'in ' + m.recorded + ' of ' + m.of + ' logs' + (m.perDay != null ? ' · ' + hrsFmt(m.perDay) + '/day' : '') }; }), { empty: 'No care measure has an answer in this period.' }),
        cr.showers.offered ? anCaption('Showers: ' + cr.showers.offered + ' offered · ' + cr.showers.done + ' done · ' + cr.showers.declined + ' declined · ' + cr.showers.outcomeNotRecorded + ' outcome not recorded') : null ])
    ]),
    anTableToggle('Show days as a table', rpTable([ 'Day', { t: 'Care logs', n: true }, { t: 'Transfers', n: true }, '' ], cr.dailyTransfers.map(function(d){ var sh = ds.recordIds && (sumState().data.shifts || []).filter(function(s){ return s.date === d.date && (sumState().data.careLogs || []).some(function(l){ return l.shift_id === s.id; }); }); return [ fmtDate(d.date), { t: String(d.logs), n: true }, { t: d.transfers == null ? 'not answered' : String(d.transfers), n: true, m: d.transfers == null }, sh && sh.length ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ anInspect('Care logs on ' + fmtDateFull(d.date), '', sh.map(function(s){ return { label: (s.type === 'sleepover' ? 'Sleepover ' : 'Day shift ') + fmtRange(s.start_t, s.end_t), open: { kind: 'care', id: s.id } }; })); } }, 'Records') : '' ]; })))
  ] : [ anEmpty('No personal care logs in this period.') ]));
}

/* ---------- Overnight ---------- */
function sumOvernight(doc, ds, c){
  var o = ds.overnight;
  doc.appendChild(el('div', { 'class': 'an-metrics' }, [
    anMetric('Nights in scope', o.inScope, 'finished nights', o.notYet ? o.notYet + ' not yet finished' : null),
    anMetric('Complete usable data', o.inScope ? o.complete : null, 'of ' + o.inScope, 'summary with hours', { insufficient: true }),
    anMetric('Partial · not recorded', o.inScope ? o.partial + ' · ' + o.missing : null, '', 'partial = record without hours, or intervals only', { insufficient: true }),
    anMetric('Average assistance', o.avgAssist.hours, 'h per night', 'n = ' + o.avgAssist.n + ' of ' + o.inScope + (o.avgAssist.n - o.avgAssist.fromSummary ? ' (' + (o.avgAssist.n - o.avgAssist.fromSummary) + ' from intervals)' : ''), { hours: true, insufficient: true }),
    anMetric('Recorded support episodes', o.episodes.n || null, 'episodes', o.episodes.nights ? 'on ' + o.episodes.nights + ' night' + (o.episodes.nights === 1 ? '' : 's') + ' with reviewed events' : 'from reviewed observations only', { insufficient: true })
  ]));
  doc.appendChild(anSec('Night-by-night assistance duration', 'Elapsed worker assistance inside 23:00–07:00 (hours). Complete = overnight summary with hours; partial = reviewed intervals only or summary without hours; not recorded = no record.', o.rows.length ? [
    sumNightBars(ds, 200), anLegend([{ c: RP_C.acc, l: 'Complete (overnight summary)' }, { c: RP_C.acc, hatch: true, l: 'Partial (what is recorded only)' }, { c: '', dash: true, l: 'Not recorded' }]),
    anCaption('n = ' + o.avgAssist.n + ' nights with a value of ' + o.inScope + ' in scope · window length from the clock (7–9 h on daylight-saving nights)'),
    anTableToggle('Show nights as a table', sumNightTable(ds))
  ] : [ anEmpty('No sleepover shifts rostered in this period.') ]));
  doc.appendChild(anSec('When assistance happens', 'One row per night the shift started. Bars show start and end where recorded; dots show a start time only. Times after midnight are placed on the night they belong to. Unknown times are not plotted.', [
    anTimeline(o.timeline, o.rows), o.timeline.length ? anLegend([{ c: RP_C.acc, l: 'Direct assistance' }, { c: RP_C.warn, l: 'Necessary supervision (reason recorded)' }, { c: '#94A3B8', l: 'Awake, no assistance' }]) : null,
    o.timeline.length ? anCaption(o.timeline.length + ' reviewed event' + (o.timeline.length === 1 ? '' : 's') + ' on ' + o.episodes.nights + ' night' + (o.episodes.nights === 1 ? '' : 's') + ' · shaded band = 23:00–07:00') : null
  ]));
  doc.appendChild(anSec('Overnight support by activity', 'Reviewed assistance episodes by recorded activity. Hours are shown only where start and end were recorded; a long note does not mean a long episode.', [
    anHBars(o.byActivity.map(function(a){ return { label: a.activity, n: a.episodes, note: a.hours != null ? '· ' + hrsFmt(a.hours) + ' h over ' + a.withDuration + ' timed' : '· no timed intervals' }; }), { empty: 'No reviewed overnight observations in this period. Import or paste a sleep-log narrative under Manage data.' })
  ]));
  doc.appendChild(anSec('Nights', '*Wakes = times the participant woke needing support before the wake they got up for the day (the final wake is not counted). One wake can involve several assistance episodes.', [ sumNightTable(ds) ], { cls: 'an-sec-long' }));
}

/* ---------- Incidents ---------- */
function sumIncidents(doc, ds, c){
  var I = ds.incidents;
  doc.appendChild(el('div', { 'class': 'an-metrics' }, [
    anMetric('Incident reports', I.n, 'reports', I.list.filter(function(e){ return e.kind === 'observation'; }).length ? I.list.filter(function(e){ return e.kind === 'observation'; }).length + ' from reviewed documents' : null),
    anMetric('Falls', I.falls, 'of ' + I.n, I.transfers.yes ? I.transfers.yes + ' during a transfer (recorded)' + (I.transfers.inferred ? ', ' + I.transfers.inferred + ' inferred from location' : '') : null),
    anMetric('Involving emergency services', I.emergencyInvolved, 'of ' + I.n, 'a call was recorded; attendance is not on the form'),
    anMetric('Injuries recorded', I.injuriesYes, 'of ' + I.n, I.injuriesUnknown ? I.injuriesUnknown + ' not answered (unknown)' : null),
    anMetric('Time on the floor', I.floor.n ? I.floor.minutes : null, 'min', I.floor.n ? 'recorded on ' + I.floor.n + ' of ' + I.floor.ofFalls + ' falls · time before being helped up' : (I.falls ? 'not recorded on any fall' : 'no falls'), { insufficient: !I.falls })
  ]));
  doc.appendChild(anSec('Incidents and falls over time', 'Recorded per ' + ds.series.mode + '. Zero bars mean no recorded event, not complete observation where records are missing.', [
    sumSeriesChart(ds, ['incidents', 'falls'], [{ label: 'Incidents', color: RP_C.acc }, { label: 'Falls', color: RP_C.bad }]), anLegend([{ c: RP_C.acc, l: 'All incidents' }, { c: RP_C.bad, l: 'Falls' }]),
    anTableToggle('Show as a table', sumSeriesTable(ds, [['incidents', 'Incidents'], ['falls', 'Falls']]))
  ]));
  doc.appendChild(el('div', { 'class': 'an-grid3' }, [
    anSec('Incident types', 'As ticked on the form; one incident can have several types.', [ anHBars(I.byType.map(function(t){ return { label: t.key, n: t.n }; })) ]),
    anSec('Where falls happened', 'Location as recorded. A location does not say whether a transfer was in progress.', [ anHBars(I.byLocation.map(function(t){ return { label: t.key, n: t.n }; }), { empty: 'No falls recorded.' }) ]),
    anSec('Injury answer', 'The worker’s answer to the injury question. Unanswered stays unknown.', [ anHBars(I.byInjury.filter(function(t){ return t.n; }).map(function(t){ return { label: t.key, n: t.n }; }), { empty: 'No incidents recorded.' }) ])
  ]));
  doc.appendChild(anSec('Incident records', 'Short facts from each record. Open the original for the full form.', I.list.length ? [
    rpTable([ 'Date · time', 'Type', 'Location', 'Description', 'Response / outcome', 'Emergency', 'Injury', '' ], I.list.map(function(e){
      return [ fmtDate(e.date) + (e.time ? ' ' + fmtTime(e.time) : ''), e.types.join(', ') + (e.isFall ? ' · fall' : '') + (e.kind === 'observation' ? ' (reviewed doc.)' : ''), e.location || '—', (e.description || '').slice(0, 160) + ((e.description || '').length > 160 ? '…' : ''), [ e.response, e.outcome ].filter(Boolean).join(' · ').slice(0, 160) || '—', e.emergency.length ? e.emergency.join(', ') : '—', e.injuries === 'yes' ? 'Yes' + (e.injuryKind ? ' · ' + e.injuryKind : '') : (e.injuries === 'no' ? 'No injury recorded' : 'Not answered'),
        el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ anOpenRecord(e.kind === 'report' ? 'incident' : 'observation', e.id); } }, 'Open') ];
    }))
  ] : [ anEmpty('No incident reports in this period.') ], { cls: 'an-sec-long' }));
}

/* ---------- Near misses ---------- */
function sumNearMisses(doc, ds, c){
  var N = ds.nearMisses;
  doc.appendChild(el('div', { 'class': 'an-metrics' }, [
    anMetric('Near misses recorded', N.n, 'events', N.days + ' day' + (N.days === 1 ? '' : 's')),
    anMetric('Documented shifts in scope', N.shiftsDocumented, 'of ' + ds.coverage.shifts.completed, 'shifts with any record'),
    anMetric('Linked to equipment', N.equipment, 'of ' + N.n, 'recorded by the worker'),
    anMetric('During a transfer', N.transfers.yes, 'of ' + N.n, (N.transfers.inferred ? N.transfers.inferred + ' inferred from location · ' : '') + N.transfers.unknown + ' not recorded')
  ]));
  doc.appendChild(anSec('Near misses over time', 'Recorded per ' + ds.series.mode + '.', [
    sumSeriesChart(ds, ['nearMisses'], [{ label: 'Near misses', color: RP_C.warn }]),
    anTableToggle('Show as a table', sumSeriesTable(ds, [['nearMisses', 'Near misses']]))
  ]));
  doc.appendChild(el('div', { 'class': 'an-grid3' }, [
    anSec('Location', 'As recorded.', [ anHBars(N.byLocation.map(function(t){ return { label: t.key, n: t.n }; }), { color: RP_C.warn }) ]),
    anSec('Activity', 'Whether a transfer was in progress, as answered.', [ anHBars(N.byActivity.map(function(t){ return { label: t.key, n: t.n }; }), { color: RP_C.warn }) ]),
    anSec('What prevented harm', 'Grouped from the worker’s free-text answer; open the record for the wording.', [ anHBars(N.byPrevention.map(function(t){ return { label: t.key, n: t.n }; }), { color: RP_C.warn }) ])
  ]));
  doc.appendChild(anSec('Near miss records', 'A near miss is a fall or injury that was prevented; it is never counted as a fall.', N.list.length ? [
    rpTable([ 'Date · time', 'Location · activity', 'What nearly happened', 'What prevented it', 'Recorded outcome', '' ], N.list.map(function(e){
      return [ fmtDate(e.date) + (e.time ? ' ' + fmtTime(e.time) : ''), (e.location || '—') + (e.transfer === 'yes' ? ' · during a transfer' : e.transfer === 'inferred' ? ' · transfer (inferred)' : ''), (e.description || '').slice(0, 160), (e.prevented || '—').slice(0, 160), e.outcome || (e.kind === 'observation' ? '—' : 'No injury (by definition)') + (e.equipment ? ' · equipment: ' + (e.equipmentDesc || 'yes') : ''), el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ anOpenRecord(e.kind === 'report' ? 'near_miss' : 'observation', e.id); } }, 'Open') ];
    }))
  ] : [ anEmpty('No near misses recorded in this period.') ], { cls: 'an-sec-long' }));
}

/* ---------- Manage data (drawer): sources · review queue · checks · versions · demo ---------- */
function sumOpenManage(tab){
  var S = sumState(); S.drawer = tab || S.drawer || 'review';
  var body = el('div', { 'class': 'modal-body an-manage' });
  function draw(){ body.innerHTML = ''; sumManageBody(body); }
  var tabs = [['review', 'Review queue'], ['sources', 'Sources'], ['checks', 'Checks'], ['versions', 'Versions'], ['demo', 'Demonstration']];
  var m = el('div', { 'class': 'modal modal-wide', style: 'max-width:900px' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', null, [ el('div', { 'class': 't-title' }, 'Manage data'), el('div', { 'class': 't-cap' }, 'Uploads, review, duplicate resolution, missing-data checks and report versions. Nothing here changes a worker’s record.') ]), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'seg', role: 'tablist', 'aria-label': 'Manage data sections', style: 'margin:0 20px' }, tabs.map(function(t){ return el('button', { 'class': S.drawer === t[0] ? 'on' : '', role: 'tab', 'aria-selected': S.drawer === t[0] ? 'true' : 'false', onclick: function(){ S.drawer = t[0]; openModal(sumOpenManage.modal = null) || sumOpenManage(t[0]); } }, t[1]); })),
    body,
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Close') ])
  ]);
  draw();
  openModal(m, { noDismiss: true });
}
function sumManageBody(body){
  var S = sumState(), D = S.data || {}, ds = S.ds, canEv = S.evidenceTables !== false;
  if (!ds) { body.appendChild(anEmpty('Load a period first.')); return; }
  if (S.drawer === 'review') {
    var obsAll = (D.observations || []).filter(function(o){ var nt = evNightOf(o); return nt >= ds.from && nt <= ds.to; });
    var counts = { proposed: 0, accepted: 0, rejected: 0 }; obsAll.forEach(function(o){ counts[o.status] = (counts[o.status] || 0) + 1; });
    var list = obsAll.filter(function(o){ return S.obsFilter === 'all' || o.status === S.obsFilter; }).sort(function(a, b){ return a.obs_date === b.obs_date ? ((a.start_time || '') < (b.start_time || '') ? -1 : 1) : (a.obs_date < b.obs_date ? -1 : 1); });
    body.appendChild(el('div', { 'class': 'an-row' }, [
      el('div', { 'class': 'seg', role: 'group', 'aria-label': 'Filter observations' }, [['proposed', 'To review (' + counts.proposed + ')'], ['accepted', 'Accepted (' + counts.accepted + ')'], ['rejected', 'Rejected (' + counts.rejected + ')'], ['all', 'All']].map(function(f){ return el('button', { 'class': S.obsFilter === f[0] ? 'on' : '', onclick: function(){ S.obsFilter = f[0]; sumOpenManage('review'); } }, f[1]); })),
      el('div', { 'class': 'spacer' }),
      canEv ? el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ sumObsModal(null); } }, 'Add an observation by hand') : null
    ]));
    body.appendChild(el('p', { 'class': 't-cap', style: 'margin:8px 0 10px' }, 'Each proposal shows the sentence it came from. Accept it as stated, edit it, reject it, or link it to the record it repeats. Only accepted, unlinked observations enter the figures. Review the meaning, not just the match.'));
    body.appendChild(list.length ? el('div', { 'class': 'sum-obs-list' }, list.map(sumObsRow)) : anEmpty(S.obsFilter === 'proposed' ? 'Nothing waiting for review.' : 'No observations here.'));
  } else if (S.drawer === 'sources') {
    var ups = (D.sources || []).slice().sort(function(a, b){ return (a.event_from || '') < (b.event_from || '') ? 1 : -1; });
    body.appendChild(el('div', { 'class': 'an-row' }, canEv ? [
      el('button', { 'class': 'btn btn-sm btn-pri', onclick: function(){ sumImportModal('file'); } }, [svgIcon(IC.plus), 'Import a document']),
      el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ sumImportModal('text'); } }, 'Paste text'),
      el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ sumImportModal('note'); } }, 'Review an in-app shift note')
    ] : [ el('div', { 'class': 'notice' }, 'Imports need database migration 002.') ]));
    body.appendChild(el('p', { 'class': 't-cap', style: 'margin:8px 0 10px' }, 'Originals are stored unchanged in the participant’s private evidence folder (admin-only). Exact duplicate files are refused by content hash. Text is extracted in your browser; scans are marked for manual entry — no text is invented.'));
    body.appendChild(ups.length ? rpTable([ 'Title', 'Kind', 'About', 'Author', 'Text', 'Status', '' ], ups.map(function(s){
      return [ el('div', null, [ el('b', null, s.title || s.file_name || '(untitled)'), s.note ? el('div', { 'class': 't-cap' }, s.note) : null ]), sumSourceLabel(s.kind), (s.event_from ? fmtDate(s.event_from) : '—') + (s.event_to && s.event_to !== s.event_from ? ' – ' + fmtDate(s.event_to) : ''), s.author || '—',
        { t: s.extraction === 'text' ? 'extracted' : (s.extraction === 'needs_ocr' ? 'manual entry needed' : (s.extraction === 'manual' ? 'manual' : '—')), m: true },
        s.excluded ? el('span', { 'class': 'status missing' }, 'excluded' + (s.excluded_reason ? ': ' + s.excluded_reason : '')) : el('span', { 'class': 'status done' }, 'in use'),
        el('div', { 'class': 'row-actions' }, [
          s.file_path ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ storageSignedUrl(s.file_path).then(function(u){ window.open(u, '_blank'); })["catch"](function(){ toast('Could not open the file', true); }); } }, 'Open original') : null,
          s.text_content ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ sumReviewSource(s); } }, 'Text') : null,
          el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ sumToggleExclude(s); } }, s.excluded ? 'Include' : 'Exclude…')
        ]) ];
    })) : anEmpty('No uploaded or pasted sources for this participant.'));
    body.appendChild(el('div', { 'class': 'an-sub', style: 'margin-top:14px' }, 'In-app records in this period'));
    body.appendChild(rpTable([ 'Record type', { t: 'Count', n: true } ], [ ['Shifts', String((D.shifts || []).length)], ['Shift notes', String((D.notes || []).length)], ['Incident reports', String((D.incidents || []).length)], ['Near misses', String((D.nearMisses || []).length)], ['Personal care logs', String(ds.care.logs)], ['Overnight summaries', String(ds.coverage.records.overnightLogs)] ].map(function(r){ return [ r[0], { t: r[1], n: true } ]; })));
  } else if (S.drawer === 'checks') {
    body.appendChild(el('p', { 'class': 't-cap', style: 'margin:0 0 10px' }, 'Things a person should look at. Nothing here has been changed automatically.'));
    body.appendChild(ds.checks.length ? rpTable([ 'Kind', 'Date', 'Detail' ], ds.checks.map(function(k){ return [ el('span', { 'class': 'status ' + (k.kind === 'unreviewed' || k.kind === 'possible duplicate' ? 'missing' : 'na') }, k.kind), k.date ? fmtDate(k.date) : '—', k.detail ]; })) : anEmpty('No checks outstanding.'));
  } else if (S.drawer === 'versions') {
    body.appendChild(el('div', { 'class': 'an-row' }, [
      el('button', { 'class': 'btn btn-sm btn-pri', disabled: !canEv, onclick: sumFinalise }, 'Finalise this period…'),
      S.frozen ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ S.frozen = null; sumCompute(); closeModal(); render(); } }, 'Back to live data') : null
    ]));
    body.appendChild(el('p', { 'class': 't-cap', style: 'margin:8px 0 10px' }, 'Finalising freezes the computed dataset, the included records, sources (with their content hashes) and accepted observations, the reviewer account and the time. The export of a finalised version renders only from that frozen dataset; later uploads cannot change it.'));
    body.appendChild(S.versions.length ? rpTable([ 'Created', 'Status', 'Period', 'Reviewer', 'Version', '' ], S.versions.map(function(v){
      var legacy = !(v.snapshot && v.snapshot.dataset && v.snapshot.dataset.version === EV_CALC_VERSION);
      return [ fmtDT(v.created_at), v.status === 'final' ? el('span', { 'class': 'status done' }, 'final') : el('span', { 'class': 'status na' }, 'draft'), fmtDate(v.period_from) + ' – ' + fmtDate(v.period_to), v.reviewer || '—', v.calc_version + (legacy ? ' (legacy format)' : ''),
        el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ if (!v.snapshot || !v.snapshot.dataset) { toast('This version has no stored dataset', true); return; } S.frozen = v; S.ds = v.snapshot.dataset; closeModal(); state.adminTab = 'sumdoc'; render(); } }, 'Open') ];
    })) : anEmpty('No versions yet.'));
  } else if (S.drawer === 'demo') {
    body.appendChild(el('p', { 'class': 't-cap', style: 'margin:0 0 10px' }, 'Demonstration mode replaces the participant with an entirely synthetic one — synthetic shifts, incidents, near misses, care logs, overnight summaries, sources and observations. Nothing is saved and no real record is shown.'));
    body.appendChild(el('button', { 'class': 'btn btn-sm ' + (S.demo ? 'btn-dark' : 'btn-sec'), onclick: function(){ S.demo = !S.demo; S.data = null; S.demoVersions = []; S.frozen = null; closeModal(); sumLoad(true); } }, S.demo ? 'Turn demonstration mode off' : 'Turn demonstration mode on'));
  }
}
function sumSourceLabel(kind){ return { upload: 'Uploaded document', note: 'Shift note', incident: 'Incident report', near_miss: 'Near miss', care_log: 'Care log', overnight_log: 'Overnight summary' }[kind] || kind; }
function sumObsRow(o){
  var S = sumState(), src = (S.data.sources || []).find(function(s){ return s.id === o.source_id; });
  var linked = evIsLinked(o), night = evNightOf(o);
  return el('div', { 'class': 'sum-obs ' + o.status }, [
    el('div', { 'class': 'sum-obs-h' }, [
      el('b', null, fmtDate(o.obs_date) + (o.start_time ? ' · ' + fmtTime(o.start_time) + (o.end_time ? '–' + fmtTime(o.end_time) : '') : ' · time not stated') + (o.timing === 'estimated' ? ' (approx.)' : o.timing === 'interval' ? ' (15-min block)' : '') + (night !== o.obs_date ? ' · night of ' + fmtDate(night) : '')),
      el('span', { 'class': 'status na' }, o.category.replace(/_/g, ' ')), el('span', { 'class': 'status ' + (o.status === 'accepted' ? 'done' : (o.status === 'proposed' ? 'missing' : 'na')) }, o.status),
      linked ? el('span', { 'class': 'status na' }, 'linked as a repeat — not counted') : null, o.uncertain ? el('span', { 'class': 'status missing' }, 'uncertain') : null
    ]),
    el('div', null, [ el('b', null, o.assist_type || '(type not set)'), o.reason ? ' — ' + o.reason : '', o.outcome ? ' · ' + o.outcome : '' ]),
    el('div', { 'class': 'sum-quote' }, (src ? (src.title || src.file_name || sumSourceLabel(src.kind)) + ': ' : '') + (o.source_ref || 'no source reference')),
    o.review_note ? el('div', { 'class': 't-cap' }, 'Reviewer: ' + o.review_note + (o.reviewer ? ' — ' + o.reviewer : '')) : null,
    el('div', { 'class': 'row-actions', style: 'justify-content:flex-start;margin-top:6px' }, [
      o.status !== 'accepted' ? el('button', { 'class': 'btn btn-sm btn-pri', onclick: function(){ sumSetObs(o, { status: 'accepted' }); } }, 'Accept as stated') : null,
      el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ sumObsModal(o); } }, 'Edit'),
      o.status !== 'rejected' ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ var why = prompt('Why is this rejected? (kept for the audit trail)'); if (why === null) return; sumSetObs(o, { status: 'rejected', review_note: why }); } }, 'Reject') : null,
      !linked ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ sumMarkDuplicate(o); } }, 'Repeats another record…') : el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ sumSetObs(o, { duplicate_of: null, duplicate_of_record: null, review_note: '' }); } }, 'Unlink')
    ])
  ]);
}
function sumReviewer(){ var w = sumMe(); return w.name + (w.email ? ' <' + w.email + '>' : ''); }
function sumSetObs(o, patch){
  var S = sumState(); patch.reviewer = sumReviewer(); patch.reviewed_at = new Date().toISOString(); patch.updated_at = patch.reviewed_at;
  function apply(){ Object.keys(patch).forEach(function(k){ o[k] = patch[k]; }); sumCompute(); if (document.getElementById('ac-modal')) sumOpenManage(S.drawer); render(); }
  if (S.demo) { apply(); return Promise.resolve(); }
  return sbUpd('ac_evidence_observations', 'id=eq.' + o.id, patch).then(apply)["catch"](function(e){
    if (/duplicate_of_record/.test(e.message || '') && 'duplicate_of_record' in patch) { /* migration 005 not applied yet: legacy self-link */ var p2 = {}; Object.keys(patch).forEach(function(k){ p2[k] = patch[k]; }); if (patch.duplicate_of_record) { p2.duplicate_of = o.id; p2.review_note = 'Duplicate of structured record ' + patch.duplicate_of_record; } delete p2.duplicate_of_record; return sbUpd('ac_evidence_observations', 'id=eq.' + o.id, p2).then(function(){ Object.keys(p2).forEach(function(k){ o[k] = p2[k]; }); sumCompute(); if (document.getElementById('ac-modal')) sumOpenManage(S.drawer); render(); }); }
    toast(e.message, true);
  });
}
function sumMarkDuplicate(o){
  var S = sumState(), ds = S.ds, d = evNightOf(o);
  var others = (S.data.observations || []).filter(function(x){ return x.id !== o.id && evNightOf(x) === d && !evIsLinked(x) && x.status === 'accepted'; });
  var recs = ds.incidents.list.filter(function(e){ return e.kind === 'report' && (e.date === o.obs_date || e.date === d); }).map(function(e){ return { id: e.id, label: 'Incident report ' + fmtDate(e.date) + ' ' + (e.time ? fmtTime(e.time) : '') + ' — ' + e.types.join(', ') }; })
    .concat(ds.nearMisses.list.filter(function(e){ return e.kind === 'report' && (e.date === o.obs_date || e.date === d); }).map(function(e){ return { id: e.id, label: 'Near miss ' + fmtDate(e.date) + ' ' + (e.time ? fmtTime(e.time) : '') + ' — ' + e.location }; }));
  if (!others.length && !recs.length) { toast('No other record on ' + fmtDate(o.obs_date) + ' to link to', true); return; }
  var sel = el('select', { 'class': 'sel', id: 'dup-sel' }, [el('option', { value: '' }, 'Choose the record this repeats…')].concat(recs.map(function(r){ return el('option', { value: 'rec:' + r.id }, r.label); })).concat(others.map(function(x){ return el('option', { value: x.id }, 'Observation ' + (x.start_time ? fmtTime(x.start_time) : '') + ' — ' + (x.assist_type || x.category)); })));
  var m = el('div', { 'class': 'modal', style: 'max-width:460px' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', { 'class': 't-title' }, 'This repeats another record'), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: function(){ closeModal(); sumOpenManage('review'); } }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'modal-body' }, [ el('p', { 'class': 't-mut', style: 'font-size:14px;margin-bottom:10px' }, 'One event told twice counts once. Linking keeps this observation as a source reference on the record it repeats and removes it from every figure.'), el('div', { 'class': 'field' }, [ el('label', { 'for': 'dup-sel' }, 'It repeats'), sel ]) ]),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: function(){ closeModal(); sumOpenManage('review'); } }, 'Cancel'), el('button', { 'class': 'btn btn-pri', onclick: function(){ if (!sel.value) return; var v = sel.value; closeModal(); sumSetObs(o, v.indexOf('rec:') === 0 ? { duplicate_of_record: v.slice(4) } : { duplicate_of: v }); } }, 'Link') ])
  ]);
  openModal(m);
}
function sumToggleExclude(s){
  var S = sumState();
  var patch = s.excluded ? { excluded: false, excluded_reason: null } : (function(){ var why = prompt('Why exclude this source? (e.g. training sample, generated example, wrong participant)'); return why === null ? null : { excluded: true, excluded_reason: why }; })();
  if (!patch) return;
  function apply(){ Object.keys(patch).forEach(function(k){ s[k] = patch[k]; }); sumCompute(); sumOpenManage('sources'); render(); }
  if (S.demo) { apply(); return; }
  sbUpd('ac_evidence_sources', 'id=eq.' + s.id, patch).then(apply)["catch"](function(e){ toast(e.message, true); });
}

/* ---------- observation editor ---------- */
var SUM_CATS = [['overnight_assist', 'Overnight: direct worker assistance'], ['overnight_supervision', 'Overnight: necessary supervision (record the reason)'], ['overnight_awake_no_assist', 'Overnight: awake, no assistance needed'], ['daytime_task', 'Daytime task / activity'], ['incident', 'Incident (fall, injury, emergency)'], ['near_miss', 'Near miss'], ['other', 'Other']];
var SUM_ACTS = { overnight_assist: ['Continence / toileting', 'Transfer', 'Repositioning', 'Prompting / resettling', 'Attended after waking', 'Medication support', 'Other'], overnight_supervision: ['Monitoring after a fall', 'Monitoring for behaviour', 'Other'], overnight_awake_no_assist: ['Awake, no assistance'], daytime_task: ['Transfer', 'Shower', 'Continence / toileting', 'Medication support', 'Meal support', 'Other'], incident: ['Fall', 'Injury', 'Medical concern', 'Behaviour of concern', 'Other'], near_miss: ['Near miss'], other: ['Other'] };
function sumObsModal(o){
  var S = sumState(), c = sumClient(), isNew = !o, uid = 'ob-' + randId();
  var f = { obs_date: o ? o.obs_date : S.to, start_time: o ? (o.start_time || '') : '', end_time: o ? (o.end_time || '') : '', timing: o ? o.timing : 'estimated', category: o ? o.category : 'overnight_assist', assist_type: o ? (o.assist_type || '') : '', reason: o ? (o.reason || '') : '', outcome: o ? (o.outcome || '') : '', source_id: o ? (o.source_id || '') : '', source_ref: o ? (o.source_ref || '') : '', review_note: o ? (o.review_note || '') : '' };
  function fld(label, key, type){ var id = uid + key; return el('div', { 'class': 'field' }, [ el('label', { 'for': id }, label), el('input', { 'class': 'inp', id: id, type: type || 'text', value: f[key], oninput: function(e){ f[key] = e.target.value; }, onchange: function(e){ f[key] = e.target.value; } }) ]); }
  var actSel = el('select', { 'class': 'sel', id: uid + 'act', onchange: function(e){ f.assist_type = e.target.value; } });
  function fillActs(){ actSel.innerHTML = ''; (SUM_ACTS[f.category] || ['Other']).forEach(function(a){ actSel.appendChild(el('option', { value: a, selected: f.assist_type === a }, a)); }); if (!(SUM_ACTS[f.category] || []).some(function(a){ return a === f.assist_type; })) { if (f.assist_type) actSel.appendChild(el('option', { value: f.assist_type, selected: true }, f.assist_type)); else f.assist_type = actSel.value; } }
  fillActs();
  var srcSel = el('select', { 'class': 'sel', id: uid + 'src', onchange: function(e){ f.source_id = e.target.value; } }, [el('option', { value: '' }, 'No source document (state it in the reference)')].concat((S.data.sources || []).map(function(s){ return el('option', { value: s.id, selected: f.source_id === s.id }, (s.title || s.file_name || sumSourceLabel(s.kind))); })));
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', { 'class': 't-title' }, isNew ? 'Add an observation' : 'Edit observation'), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: function(){ closeModal(); sumOpenManage('review'); } }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 'q-help' }, 'Record only what the source says. If a time is not stated, leave it blank. Enter the date the event STARTED; an event at 3:30am on the 5th is dated the 5th and is placed on the night of the 4th automatically.'),
      el('div', { 'class': 'grid2' }, [ fld('Date the event started', 'obs_date', 'date'), el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'tim' }, 'Timing basis'), el('select', { 'class': 'sel', id: uid + 'tim', onchange: function(e){ f.timing = e.target.value; } }, [['exact', 'Exact (stated)'], ['estimated', 'Estimated ("about", "around")'], ['interval', '15-minute block (sleep log)']].map(function(t){ return el('option', { value: t[0], selected: f.timing === t[0] }, t[1]); })) ]) ]),
      el('div', { 'class': 'grid2' }, [ fld('Start time', 'start_time', 'time'), fld('End time (if stated)', 'end_time', 'time') ]),
      el('div', { 'class': 'grid2' }, [ el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'cat' }, 'Category'), el('select', { 'class': 'sel', id: uid + 'cat', onchange: function(e){ f.category = e.target.value; fillActs(); } }, SUM_CATS.map(function(t){ return el('option', { value: t[0], selected: f.category === t[0] }, t[1]); })) ]), el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'act' }, 'Activity / type'), actSel ]) ]),
      fld('What was recorded (reason / description)', 'reason'), fld('Recorded outcome', 'outcome'),
      el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'src' }, 'Source document'), srcSel ]),
      el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'ref' }, 'Source reference (page, section or quoted text)'), el('textarea', { 'class': 'ta', id: uid + 'ref', rows: '2', oninput: function(e){ f.source_ref = e.target.value; } }, f.source_ref) ]),
      el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'rn' }, 'Reviewer note'), el('input', { 'class': 'inp', id: uid + 'rn', value: f.review_note, oninput: function(e){ f.review_note = e.target.value; } }) ])
    ]),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: function(){ closeModal(); sumOpenManage('review'); } }, 'Cancel'), el('button', { 'class': 'btn btn-pri', onclick: function(e){
      if (!f.obs_date) { toast('Enter the date.', true); return; }
      if (!f.source_ref.trim()) { toast('Give a source reference a reader could check.', true); return; }
      var rec = { obs_date: f.obs_date, start_time: f.start_time || null, end_time: f.end_time || null, timing: f.timing, category: f.category, assist_type: f.assist_type, reason: f.reason, outcome: f.outcome, workers_involved: null, source_id: f.source_id || null, source_ref: f.source_ref, review_note: f.review_note, status: 'accepted', reviewer: sumReviewer(), reviewed_at: new Date().toISOString() };
      busyBtn(e.currentTarget, true);
      if (S.demo) { if (isNew) { rec.id = 'demo-' + randId(); rec.participant_id = c.id; S.data.observations.push(rec); } else Object.keys(rec).forEach(function(k){ o[k] = rec[k]; }); closeModal(); sumCompute(); render(); sumOpenManage('review'); return; }
      var p = isNew ? sbIns('ac_evidence_observations', [Object.assign({ participant_id: c.id, created_by: sumMe().id }, rec)]) : sbUpd('ac_evidence_observations', 'id=eq.' + o.id, Object.assign({ updated_at: rec.reviewed_at }, rec));
      p.then(function(){ closeModal(); toast(isNew ? 'Observation added (accepted)' : 'Observation updated'); return sumLoad(true); }).then(function(){ sumOpenManage('review'); })["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
    } }, isNew ? 'Add as accepted' : 'Save') ])
  ]);
  openModal(m, { noDismiss: true });
}

/* ---------- import: file / pasted text / in-app note ---------- */
var PDFJS_VER = '4.9.124';   // pdfjs-dist on cdnjs, ES module build (3.x is end-of-life; see migrations/README.md)
function sumPdfText(buf){
  return import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.min.mjs').then(function(pdfjs){
    pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/pdf.worker.min.mjs';
    return pdfjs.getDocument({ data: buf, isEvalSupported: false, disableFontFace: true }).promise.then(function(pdf){
      var chain = Promise.resolve(), pages = [];
      for (var i = 1; i <= pdf.numPages; i++) (function(i){ chain = chain.then(function(){ return pdf.getPage(i).then(function(pg){ return pg.getTextContent(); }).then(function(tc){ pages.push('[Page ' + i + '] ' + tc.items.map(function(it){ return it.str; }).join(' ')); }); }); })(i);
      return chain.then(function(){ var text = pages.join('\n\n'); var words = text.replace(/\[Page \d+\]/g, '').trim(); return words.length < 40 ? { text: null, extraction: 'needs_ocr' } : { text: text, extraction: 'text' }; });
    });
  });
}
function loadScript(src){ return new Promise(function(res, rej){ if (document.querySelector('script[src="' + src + '"]')) return res(); var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function(){ rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); }); }
function sumSha256(buf){ return crypto.subtle.digest('SHA-256', buf).then(function(h){ return Array.prototype.map.call(new Uint8Array(h), function(b){ return ('0' + b.toString(16)).slice(-2); }).join(''); }); }
function sumExtractText(file, buf){
  var t = file.type || '';
  if (/^text\//.test(t) || /\.(txt|md|csv)$/i.test(file.name)) return Promise.resolve({ text: new TextDecoder().decode(buf), extraction: 'text' });
  if (t === 'application/pdf' || /\.pdf$/i.test(file.name)) return sumPdfText(buf);
  if (/wordprocessingml/.test(t) || /\.docx$/i.test(file.name)) {
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js').then(function(){
      return window.JSZip.loadAsync(buf).then(function(z){ var f = z.file('word/document.xml'); if (!f) throw new Error('Not a Word document'); return f.async('string'); }).then(function(xml){
        var text = xml.replace(/<\/w:p>/g, '\n').replace(/<w:tab\/>/g, '\t').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        return { text: text.trim(), extraction: text.trim().length ? 'text' : 'needs_ocr' };
      });
    });
  }
  return Promise.resolve({ text: null, extraction: 'needs_ocr' });
}
function sumImportModal(mode){
  var S = sumState(), c = sumClient(), uid = 'imp-' + randId();
  var f = { title: '', author: '', event_from: S.to, event_to: '', note: '', text: '', noteId: '', overnight: false }, file = null;
  var fileIn = el('input', { type: 'file', id: uid + 'file', accept: '.pdf,.docx,.txt,.md,.csv,image/*', onchange: function(e){ file = e.target.files[0] || null; if (file && !f.title) { f.title = file.name; titleIn.value = file.name; } } });
  var titleIn = el('input', { 'class': 'inp', id: uid + 'title', value: f.title, oninput: function(e){ f.title = e.target.value; } });
  var noteSel = el('select', { 'class': 'sel', id: uid + 'note', onchange: function(e){ f.noteId = e.target.value; } }, [el('option', { value: '' }, 'Choose a shift note…')].concat((S.data.notes || []).slice().sort(function(a, b){ var sa = S.data.shifts.find(function(s){ return s.id === a.shift_id; }) || {}, sb = S.data.shifts.find(function(s){ return s.id === b.shift_id; }) || {}; return (sa.date || '') < (sb.date || '') ? 1 : -1; }).map(function(n){ var s = S.data.shifts.find(function(x){ return x.id === n.shift_id; }) || {}; return el('option', { value: n.id }, (s.date ? fmtDate(s.date) + (s.type === 'sleepover' ? ' (sleepover)' : ' (day)') : '?') + ' · ' + n.note_type); })));
  var prog = el('div', { 'class': 'notice', style: 'display:none', role: 'status' });
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', { 'class': 't-title' }, mode === 'file' ? 'Import a document' : (mode === 'text' ? 'Paste text' : 'Review an in-app shift note')), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: function(){ closeModal(); sumOpenManage('sources'); } }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 'q-help' }, mode === 'file' ? 'The original file is stored unchanged. Text is extracted in your browser. Photos and scans are stored but marked for manual entry. Sentences with a clock time become proposals for you to review — nothing is counted until accepted.' : (mode === 'text' ? 'For notes that are not in the app. Say who wrote it and which date it is about.' : 'Finds sentences with a clock time in the note and proposes observations. The note itself is never changed.')),
      mode === 'file' ? el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'file' }, 'Document'), fileIn ]) : null,
      mode === 'note' ? el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'note' }, 'Shift note'), noteSel ]) : null,
      mode === 'text' ? el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'text' }, 'Text'), el('textarea', { 'class': 'ta', id: uid + 'text', rows: '8', oninput: function(e){ f.text = e.target.value; } }) ]) : null,
      mode !== 'note' ? el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'title' }, 'Title'), titleIn ]) : null,
      mode !== 'note' ? el('div', { 'class': 'grid2' }, [ el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'au' }, 'Original author (as stated)'), el('input', { 'class': 'inp', id: uid + 'au', oninput: function(e){ f.author = e.target.value; } }) ]), el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'nt' }, 'Note'), el('input', { 'class': 'inp', id: uid + 'nt', placeholder: 'e.g. typed-up paper sleep log', oninput: function(e){ f.note = e.target.value; } }) ]) ]) : null,
      mode !== 'note' ? el('div', { 'class': 'grid2' }, [ el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'from' }, 'Date it is about (start)'), el('input', { 'class': 'inp', id: uid + 'from', type: 'date', value: f.event_from, onchange: function(e){ f.event_from = e.target.value; } }) ]), el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'to' }, 'To (if a range)'), el('input', { 'class': 'inp', id: uid + 'to', type: 'date', onchange: function(e){ f.event_to = e.target.value; } }) ]) ]) : null,
      mode !== 'note' ? el('label', { 'class': 'checkrow' }, [ el('input', { type: 'checkbox', onchange: function(e){ f.overnight = e.target.checked; } }), el('span', { style: 'font-size:14px' }, 'This describes a sleepover night that started on the date above (times before noon are the next morning)') ]) : null,
      prog
    ]),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: function(){ closeModal(); sumOpenManage('sources'); } }, 'Cancel'), el('button', { 'class': 'btn btn-pri', onclick: function(e){
      var btn = e.currentTarget; function say(t){ prog.style.display = ''; prog.textContent = t; }
      if (mode === 'file' && !file) { toast('Choose a document.', true); return; }
      if (mode === 'text' && !f.text.trim()) { toast('Paste some text.', true); return; }
      if (mode === 'note' && !f.noteId) { toast('Choose a note.', true); return; }
      if (mode !== 'note' && !f.event_from) { toast('Say which date the document is about.', true); return; }
      busyBtn(btn, true);
      var src, text, extraction, sha, buf, overnight = f.overnight;
      var prep = mode === 'file' ? file.arrayBuffer().then(function(b){ buf = b; say('Checking for duplicates…'); return sumSha256(b); }).then(function(h){ sha = h;
          if ((S.data.sources || []).some(function(s){ return s.sha256 === h; })) throw new Error('This exact file is already imported for ' + c.name + '.');
          say('Extracting text…'); return sumExtractText(file, buf); }).then(function(r){ text = r.text; extraction = r.extraction; })
        : mode === 'text' ? sumSha256(new TextEncoder().encode(f.text)).then(function(h){ sha = h; text = f.text; extraction = 'text'; if ((S.data.sources || []).some(function(s){ return s.sha256 === h; })) throw new Error('This exact text is already imported.'); })
        : Promise.resolve().then(function(){ var nn = S.data.notes.find(function(x){ return x.id === f.noteId; }); var s = S.data.shifts.find(function(x){ return x.id === nn.shift_id; }); text = nn.body; extraction = 'text'; f.title = 'Shift note ' + (s ? fmtDate(s.date) : ''); f.event_from = s ? s.date : S.to; f.author = (workerById(nn.worker_id) || {}).name || ''; overnight = !!(s && s.type === 'sleepover'); sha = null; });
      prep.then(function(){
        if (mode === 'file' && !S.demo) { say('Storing the original…'); return storageUpload('evidence/' + c.id + '/' + sha.slice(0, 12) + '_' + sanitizeName(file.name), file); }
        return null;
      }).then(function(path){
        src = { participant_id: c.id, kind: mode === 'note' ? 'note' : 'upload', ref_id: mode === 'note' ? f.noteId : null, file_path: path, file_name: file ? file.name : null, mime: file ? file.type : (mode === 'text' ? 'text/plain' : null), size_bytes: file ? file.size : null, sha256: sha, event_from: f.event_from || null, event_to: f.event_to || null, author: f.author || null, title: f.title || null, note: (f.note || '') + (overnight ? ' [sleepover narrative]' : ''), text_content: text, extraction: extraction, uploaded_by: sumMe().id };
        if (mode === 'note' && (S.data.sources || []).some(function(s){ return s.kind === 'note' && s.ref_id === f.noteId; })) throw new Error('This note has already been reviewed. Find its proposals in the review queue.');
        say('Saving the source…');
        if (S.demo) { src.id = 'demo-' + randId(); src.created_at = new Date().toISOString(); S.data.sources.push(src); return [src]; }
        return sbIns('ac_evidence_sources', [src]);
      }).then(function(rows){
        var saved = rows[0];
        var cands = text ? evFindCandidates(text, { baseDate: f.event_from, overnight: overnight }) : [];
        cands.forEach(function(x){ x.participant_id = c.id; x.source_id = saved.id; x.created_by = sumMe().id; if (x.uncertain) x.review_note = 'Uncertain: night-time clock time in a document not marked as a sleepover narrative'; delete x.uncertain; });
        say(cands.length ? 'Saving ' + cands.length + ' proposal' + (cands.length === 1 ? '' : 's') + ' for review…' : 'No sentences with a clock time found; add observations by hand.');
        if (S.demo) { cands.forEach(function(x){ x.id = 'demo-' + randId(); x.status = 'proposed'; S.data.observations.push(x); }); return cands.length; }
        return cands.length ? sbIns('ac_evidence_observations', cands).then(function(){ return cands.length; }) : 0;
      }).then(function(nn){
        closeModal(); S.obsFilter = 'proposed'; S.drawer = 'review';
        toast(extraction === 'needs_ocr' ? 'Stored. No machine-readable text — enter observations by hand from the original.' : (nn ? nn + ' proposal' + (nn === 1 ? '' : 's') + ' ready for review' : 'Source stored; nothing to propose'));
        if (S.demo) { sumCompute(); render(); sumOpenManage('review'); } else sumLoad(true).then(function(){ sumOpenManage('review'); });
      })["catch"](function(err){ busyBtn(btn, false); say(''); prog.style.display = 'none'; toast(err.message, true); });
    } }, 'Import') ])
  ]);
  openModal(m, { noDismiss: true });
}
function sumReviewSource(s){
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', null, [ el('div', { 'class': 't-title' }, s.title || s.file_name || 'Source'), el('div', { 'class': 't-cap' }, (s.author ? 'Author as stated: ' + s.author + ' · ' : '') + (s.event_from ? 'about ' + fmtDate(s.event_from) : '')) ]), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: function(){ closeModal(); sumOpenManage('sources'); } }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'modal-body' }, [ el('div', { 'class': 'q-help' }, 'Extracted text, shown unchanged.'), el('pre', { 'class': 'sum-pre' }, s.text_content || '') ]),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-sec', onclick: function(){ closeModal(); sumObsModal(null); } }, 'Add an observation from this'), el('button', { 'class': 'btn btn-ghost', onclick: function(){ closeModal(); sumOpenManage('sources'); } }, 'Close') ])
  ]);
  openModal(m);
}

/* ---------- finalise: freeze the dataset with its records, sources and reviewer ---------- */
function sumFinalise(){
  var S = sumState(), c = sumClient();
  if (S.ds.checks.some(function(k){ return k.kind === 'unreviewed'; }) && !confirm('There are proposals still awaiting review. They are excluded from the figures. Finalise anyway?')) return;
  var who = sumMe();
  if (!confirm('Finalise ' + c.name + ', ' + fmtDate(S.from) + ' to ' + fmtDate(S.to) + ', as reviewed by ' + who.name + (who.email ? ' (' + who.email + ')' : '') + '? The figures and included records are frozen.')) return;
  var obsIds = S.ds.recordIds.observations.slice(), srcIds = S.ds.sourceIndex.map(function(s){ return s.id; });
  var row = { participant_id: c.id, period_from: S.from, period_to: S.to, status: 'final', calc_version: EV_CALC_VERSION + '+' + BUILD_V,
    snapshot: { dataset: S.ds, exportOpts: S.exportOpts, tz: 'Australia/Melbourne', exported_at: new Date().toISOString(), reviewer: who, source_versions: S.ds.sourceIndex.map(function(s){ return { id: s.id, sha256: s.sha256, updated_at: s.updated_at }; }) },
    source_ids: srcIds, observation_ids: obsIds, reviewer: who.name + (who.email ? ' <' + who.email + '>' : ''), finalised_at: new Date().toISOString(), created_by: who.id };
  if (S.demo) { row.id = 'demo-' + randId(); row.created_at = row.finalised_at; S.demoVersions = [row].concat(S.demoVersions || []); S.versions = S.demoVersions; toast('Demonstration: version finalised in memory'); sumOpenManage('versions'); return; }
  sbIns('ac_report_versions', [row]).then(function(){ toast('Finalised and frozen'); return sumLoad(true); }).then(function(){ sumOpenManage('versions'); })["catch"](function(e){ toast(e.message, true); });
}

/* ---------- export ---------- */
function sumOpenExport(){
  var S = sumState(); if (!S.ds) return;
  var o = S.exportOpts;
  var m = el('div', { 'class': 'modal', style: 'max-width:460px' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', null, [ el('div', { 'class': 't-title' }, 'Export'), el('div', { 'class': 't-cap' }, sumClient().name + ' · ' + fmtDate(S.from) + ' to ' + fmtDate(S.to) + (S.frozen ? ' · finalised version' : ' · live data (draft)')) ]), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 't-label', style: 'margin-bottom:8px' }, 'Overview is always included. Add detail sections:'),
      [['overnight', 'Overnight'], ['incidents', 'Incidents'], ['near', 'Near misses'], ['appendix', 'Appendix: sources, record ids and definitions']].map(function(k){ return el('label', { 'class': 'checkrow' }, [ el('input', { type: 'checkbox', checked: !!o[k[0]], onchange: function(e){ o[k[0]] = e.target.checked; } }), el('span', { style: 'font-size:14px' }, k[1]) ]); }),
      el('div', { 'class': 'q-help', style: 'margin-top:10px' }, 'Opens the document; use Print / save as PDF. Record exports (full notes, incident forms, logs) are under Export records.'),
      el('button', { 'class': 'btn btn-sm btn-ghost', style: 'margin-top:8px', onclick: function(){ closeModal(); openExportOptions(); } }, 'Export records instead…')
    ]),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'), el('button', { 'class': 'btn btn-pri', onclick: function(){ closeModal(); state.adminTab = 'sumdoc'; render(); window.scrollTo(0, 0); } }, 'Open document') ])
  ]);
  openModal(m);
}
/* the document renders from `ds` ONLY — a frozen version's dataset or the live one — never from live sources */
function viewSumDoc(main){
  var S = sumState(), c = sumClient(), ds = S.ds; if (!ds) { state.adminTab = 'reports'; render(); return; }
  var ver = S.frozen, o = (ver && ver.snapshot && ver.snapshot.exportOpts) || S.exportOpts;
  var legacy = ds.version !== EV_CALC_VERSION;
  main.appendChild(el('div', { 'class': 'rp-controls an-bar', style: 'margin:6px 0 12px' }, [
    el('button', { 'class': 'btn btn-sec btn-sm', onclick: function(){ state.adminTab = 'reports'; render(); } }, [svgIcon(IC.left), 'Back to summary']),
    el('button', { 'class': 'btn btn-pri btn-sm', onclick: function(){ window.print(); } }, [svgIcon(IC.file), 'Print / save as PDF']),
    el('span', { 'class': 't-cap' }, ver ? 'Finalised version · ' + (ver.reviewer || '—') + ' · ' + fmtDT(ver.finalised_at || ver.created_at) : 'DRAFT — live data, not finalised')
  ]));
  var doc = el('div', { 'class': 'an-doc an-print' }); main.appendChild(doc);
  if (legacy) { doc.appendChild(el('div', { 'class': 'banner warn' }, [ el('div', null, [ el('b', null, 'Legacy version (' + (ds.version || 'unknown') + ')'), el('div', { 'class': 't-cap' }, 'This finalised version was produced by an earlier format and is preserved as it was. Its stored figures are listed below without the current charts.') ]) ])); doc.appendChild(el('pre', { 'class': 'sum-pre' }, JSON.stringify({ coverage: ds.coverage, overnight: ds.overnight && { rostered: ds.overnight.rostered, documented: ds.overnight.documented, avgActive: ds.overnight.avgActive }, safety: ds.safety }, null, 2))); return; }
  var org = state.data.settings.org_name || 'Astar Health Service';
  var who = ver && ver.snapshot && ver.snapshot.reviewer ? ver.snapshot.reviewer : sumMe();
  doc.appendChild(el('div', { 'class': 'an-doc-head' }, [
    el('div', null, [ el('div', { 'class': 'an-eyebrow' }, org + ' · Recorded support summary' + (S.demo ? ' · DEMONSTRATION (synthetic)' : '')), el('h2', { 'class': 'an-doc-title' }, ds.client.name + ' · ' + fmtDateFull(ds.from) + ' to ' + fmtDateFull(ds.to)) ]),
    el('div', { 'class': 'an-doc-meta' }, [ el('div', null, [ el('b', null, ver ? 'Final' : 'Draft'), ' · ' + (ver ? 'reviewed by ' + (who.name || ver.reviewer) + ' on ' + fmtDateFull((ver.finalised_at || ver.created_at).slice(0, 10)) : 'prepared by ' + who.name + ', not finalised') ]), el('div', null, 'Version ' + (ver ? ver.calc_version : EV_CALC_VERSION + '+' + BUILD_V) + ' · exported ' + fmtDateFull(todayYmd()) + ' · times ' + ds.tz) ])
  ]));
  doc.appendChild(el('div', { 'class': 'an-cov' }, sumCoverageLine(ds) + ' · ' + ds.coverage.periodDays + ' days'));
  doc.appendChild(sumMetricsRow(ds));
  var ov = ds.overnight;
  doc.appendChild(anSec('Overnight assistance per night', 'Hours of recorded worker assistance inside 23:00–07:00. Hatched = partial, dashed = not recorded.', ov.rows.length ? [ sumNightBars(ds, 170), anCaption('n = ' + ov.avgAssist.n + ' nights with a value of ' + ov.inScope + ' in scope · ' + ov.missing + ' not recorded · average ' + anH(ov.avgAssist.hours)) ] : [ anEmpty('No sleepover shifts in this period.') ]));
  doc.appendChild(anSec('Falls and near misses over time', 'Recorded events per ' + ds.series.mode + '. No bar = no recorded event.', [ sumSeriesChart(ds, ['falls', 'nearMisses'], [{ label: 'Falls', color: RP_C.bad }, { label: 'Near misses', color: RP_C.warn }], 150), anLegend([{ c: RP_C.bad, l: 'Falls' }, { c: RP_C.warn, l: 'Near misses' }]), anCaption(ds.incidents.falls + ' falls · ' + ds.nearMisses.n + ' near misses · ' + ds.coverage.shifts.completed + ' completed shifts, ' + ds.coverage.shifts.withNote + ' with a note') ]));
  var meas = ds.care.measures.filter(function(m){ return m.recorded > 0; });
  doc.appendChild(anSec('Transfers and personal care', 'Structured counts from the personal care log; totals are over the logs that answered.', ds.care.logs ? [ el('div', { 'class': 'an-grid2' }, [ el('div', null, [ el('div', { 'class': 'an-sub' }, 'Assisted transfers per ' + ds.series.mode), anSeries(ds.series.buckets.map(function(k){ return { label: ds.series.mode === 'day' ? fmtDM(k.key) : 'wk ' + fmtDM(k.key), vals: [k.transfers] }; }), [{ label: 'Assisted transfers', color: RP_C.acc }], { height: 160, width: 460 }), anCaption(ds.metrics.transfers.value == null ? 'Transfers not recorded' : ds.metrics.transfers.value + ' transfers · ' + ds.metrics.transfers.note) ]), el('div', null, [ el('div', { 'class': 'an-sub' }, 'Care measures'), anHBars(meas.map(function(m){ return { label: m.label, n: m.total, note: 'in ' + m.recorded + ' of ' + m.of + ' logs' }; })) ]) ]) ] : [ anEmpty('No personal care logs in this period.') ]));
  if (o.overnight) doc.appendChild(anSec('Overnight detail', 'One row per night the shift started. Wakes exclude the final wake.', [ sumNightTable(ds), ov.timeline.length ? anTimeline(ov.timeline, ov.rows) : null, ov.byActivity.length ? anHBars(ov.byActivity.map(function(a){ return { label: a.activity, n: a.episodes, note: a.hours != null ? '· ' + hrsFmt(a.hours) + ' h timed' : '' }; })) : null ], { cls: 'an-sec-long an-break' }));
  if (o.incidents) doc.appendChild(anSec('Incident detail', ds.incidents.n + ' incident report' + (ds.incidents.n === 1 ? '' : 's') + ' · ' + ds.incidents.falls + ' falls · ' + ds.incidents.emergencyInvolved + ' involving an emergency call · injuries recorded ' + ds.incidents.injuriesYes + ', not answered ' + ds.incidents.injuriesUnknown, ds.incidents.list.length ? [ rpTable([ 'Date · time', 'Type', 'Location', 'Description', 'Response / outcome', 'Emergency', 'Injury' ], ds.incidents.list.map(function(e){ return [ fmtDate(e.date) + (e.time ? ' ' + fmtTime(e.time) : ''), e.types.join(', ') + (e.isFall ? ' · fall' : ''), e.location || '—', (e.description || '').slice(0, 200), [ e.response, e.outcome ].filter(Boolean).join(' · ').slice(0, 200) || '—', e.emergency.join(', ') || '—', e.injuries === 'yes' ? 'Yes' : e.injuries === 'no' ? 'No injury recorded' : 'Not answered' ]; })) ] : [ anEmpty('No incident reports.') ], { cls: 'an-sec-long an-break' }));
  if (o.near) doc.appendChild(anSec('Near miss detail', ds.nearMisses.n + ' recorded · ' + ds.nearMisses.equipment + ' linked to equipment', ds.nearMisses.list.length ? [ rpTable([ 'Date · time', 'Location · activity', 'What nearly happened', 'What prevented it' ], ds.nearMisses.list.map(function(e){ return [ fmtDate(e.date) + (e.time ? ' ' + fmtTime(e.time) : ''), (e.location || '—') + (e.transfer === 'yes' ? ' · during a transfer' : ''), (e.description || '').slice(0, 200), (e.prevented || '—').slice(0, 200) ]; })) ] : [ anEmpty('No near misses.') ], { cls: 'an-sec-long an-break' }));
  if (o.appendix) doc.appendChild(anSec('Appendix: sources, records and definitions', 'The records and sources this document was computed from, as frozen with it.', [
    el('div', { 'class': 'an-sub' }, 'Record ids'), el('div', { 'class': 't-cap' }, 'Incident reports ' + ds.recordIds.incidents.length + ' · near misses ' + ds.recordIds.nearMisses.length + ' · care logs ' + ds.recordIds.careLogs.length + ' · overnight summaries ' + ds.recordIds.overnightLogs.length + ' · accepted observations ' + ds.recordIds.observations.length),
    el('div', { 'class': 't-cap', style: 'overflow-wrap:anywhere' }, [].concat(ds.recordIds.incidents, ds.recordIds.nearMisses, ds.recordIds.careLogs, ds.recordIds.overnightLogs, ds.recordIds.observations).join(', ') || '—'),
    ds.sourceIndex.length ? el('div', null, [ el('div', { 'class': 'an-sub', style: 'margin-top:10px' }, 'Sources'), rpTable([ '#', 'Source', 'Kind', 'About', 'Author', 'Content hash' ], ds.sourceIndex.map(function(s){ return [ 'S' + s.n, s.title, sumSourceLabel(s.kind), s.from ? fmtDate(s.from) + (s.to && s.to !== s.from ? ' – ' + fmtDate(s.to) : '') : '—', s.author || '—', { t: (s.sha256 || '').slice(0, 12), m: true } ]; })) ]) : null,
    ds.checks.length ? el('div', null, [ el('div', { 'class': 'an-sub', style: 'margin-top:10px' }, 'Checks recorded with this version'), rpTable([ 'Kind', 'Date', 'Detail' ], ds.checks.map(function(k){ return [ k.kind, k.date ? fmtDate(k.date) : '—', k.detail ]; })) ]) : null,
    el('div', { 'class': 'an-sub', style: 'margin-top:10px' }, 'Definitions (' + ds.version + ')'), rpTable([ 'Term', 'Definition' ], ds.definitions.map(function(r){ return [ r[0], r[1] ]; }))
  ], { cls: 'an-sec-long an-break' }));
  doc.appendChild(el('div', { 'class': 'rp-foot' }, [ el('span', null, org + ' · Recorded support summary · ' + ds.client.name + ' · ' + fmtDate(ds.from) + ' – ' + fmtDate(ds.to) + ' · ' + (ver ? 'Final' : 'Draft')), el('span', null, '') ]));
}
