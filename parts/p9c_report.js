/* ================= admin: Summary — the Support Data Summary =================
   One document, shown on the Summary tab and printed by Export summary. It is written for a reader
   who will not open the shift notes: key figures first, then one section per area of support, each
   with a numbered figure or table, the denominator it rests on and where the figure comes from.
   Everything renders from the dataset (`ds.profile` and friends in p9a_metrics.js) — never from live
   records — so a finalised version prints exactly as it was frozen. All helpers are prefixed `sr`. */
var SR_C = { ink: '#1b2430', mut: '#5b6673', axis: '#6f7b88', grid: '#e4e8ed', rule: '#b9c1cb', dark: '#1f3a5a', mid: '#7f97b2', pale: '#d7e0ea', band: '#f2f4f7', ref: '#8a2b2b' };

function srN(v, d){ return v == null ? '—' : (+v).toLocaleString('en-AU', { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 0 : d }); }
function srH(v){ return v == null ? '—' : hrsFmt(v); }
function srDate(s){ if (!s) return '—'; var d = pd(s); return d.getDate() + ' ' + MON3[d.getMonth()] + ' ' + d.getFullYear(); }
function srDay(s){ var d = pd(s); return d.getDate() + ' ' + MON3[d.getMonth()]; }
function srWeekLabel(w){ var a = pd(w.from), b = pd(w.to); return a.getMonth() === b.getMonth() ? a.getDate() + '–' + b.getDate() + ' ' + MON3[b.getMonth()] : srDay(w.from) + ' – ' + srDay(w.to); }
function srPlural(n, one, many){ return srN(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
function srPct(n, of){ return of ? Math.round(n / of * 100) + '%' : '—'; }
function srHour(h){ return h === 0 ? '12am' : h < 12 ? h + 'am' : h === 12 ? '12pm' : (h - 12) + 'pm'; }

/* ---------- document details the records do not hold (full name, NDIS number, author), kept on this device ---------- */
function srMetaKey(c){ return 'ac_sr_meta_' + (c ? c.id : ''); }
function srMeta(c){
  var m = {}; try { m = JSON.parse(localStorage.getItem(srMetaKey(c)) || '{}') || {}; } catch (e) { m = {}; }
  return { name: m.name || '', ndis: m.ndis || '', author: m.author || '', role: m.role || '' };
}
function srSaveMeta(c, m){ try { localStorage.setItem(srMetaKey(c), JSON.stringify(m)); } catch (e) {} }

/* ---------- building blocks ---------- */
function srSection(num, title, kids){ return el('section', { 'class': 'sr-sec' }, [ el('h2', { 'class': 'sr-h2' }, [ el('span', { 'class': 'sr-h2n' }, String(num)), title ]) ].concat(kids || [])); }
function srFigure(label, title, node, note){ return el('figure', { 'class': 'sr-fig' }, [ el('figcaption', { 'class': 'sr-figcap' }, [ el('b', null, label), title ]), node, note ? el('div', { 'class': 'sr-note' }, note) : null ]); }
function srKey(items){ return el('div', { 'class': 'sr-key' }, items.map(function(it){ return el('span', null, [ el('i', { style: 'background:' + it.c + (it.line ? ';height:0;border-top:1.5px dashed ' + it.c + ';background:none' : '') + (it.stroke ? ';box-shadow:inset 0 0 0 1px ' + it.stroke : '') }), it.l ]); })); }
function srTable(head, rows, opts){
  opts = opts || {};
  function cell(tag, c, extra){ var o = (c && typeof c === 'object' && !c.nodeType) ? c : { t: c }; return el(tag, { 'class': ((o.n ? 'n ' : '') + (o.m ? 'm ' : '') + (extra || '')).trim() || null, scope: tag === 'th' ? 'col' : null }, o.t == null ? '' : o.t); }
  return el('table', { 'class': 'sr-tbl' + (opts.cls ? ' ' + opts.cls : '') }, [
    el('thead', null, el('tr', null, head.map(function(h){ return cell('th', h); }))),
    el('tbody', null, rows.map(function(r){ return el('tr', { 'class': r.total ? 'tot' : null }, (r.cells || r).map(function(c){ return cell('td', c); })); }))
  ]);
}
function srNice(maxV, min){
  var steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000], st = steps[steps.length - 1];
  for (var i = 0; i < steps.length; i++) if (maxV / steps[i] <= 5) { st = steps[i]; break; }
  return { step: st, max: Math.max(min || 0, Math.ceil((maxV || st) / st) * st) };
}
/* columns. o: { buckets:[{label, vals:[], colors:[], showLabel, title}], series:[{color, stroke}], stacked, width, height,
   yMin (smallest top of scale), ref:{v, label}, band:{from, to, label} (bucket indexes), valueLabels, fmt, aria, missing } */
function srColumns(o){
  var W = o.width || 720, H = o.height || 190, padL = 30, padR = 8, top = o.band ? 24 : 14, bottom = 26, plotW = W - padL - padR, plotH = H - top - bottom;
  var B = o.buckets, n = B.length || 1, k = o.stacked ? 1 : o.series.length, slot = plotW / n;
  var maxV = 0; B.forEach(function(b){ var v = o.stacked ? evSum(b.vals.map(function(x){ return x || 0; })) : Math.max.apply(null, b.vals.map(function(x){ return x || 0; })); if (v > maxV) maxV = v; });
  if (o.ref && o.ref.v > maxV) maxV = o.ref.v;
  var sc = srNice(maxV, o.yMin), yMax = sc.max;
  var gap = slot > 12 ? Math.min(10, slot * 0.28) : (slot > 5 ? 1.5 : 0.6), gw = Math.min(o.maxBar ? o.maxBar * k : 40 * k, slot - gap), bw = (gw - (k - 1) * 1.5) / k;
  var fmt = o.fmt || function(v){ return srN(v, v % 1 ? 1 : 0); }, lfmt = o.labelFmt || fmt;
  var svg = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', 'class': 'sr-svg', role: 'img', 'aria-label': o.aria || 'Chart' });
  function yOf(v){ return top + plotH - v / yMax * plotH; }
  if (o.band) {
    var bx = padL + o.band.from * slot, bwid = (o.band.to - o.band.from + 1) * slot;
    svg.appendChild(svgNode('rect', { x: bx, y: top - 4, width: bwid, height: plotH + 4, fill: SR_C.band }));
    svg.appendChild(svgText(bx + bwid / 2, top - 10, o.band.label, { 'text-anchor': 'middle', 'font-size': 9.5, fill: SR_C.mut }));
  }
  for (var v = 0; v <= yMax + 1e-9; v += sc.step) { var y = yOf(v); svg.appendChild(svgNode('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: v === 0 ? SR_C.axis : SR_C.grid, 'stroke-width': v === 0 ? 1 : 0.75 })); svg.appendChild(svgText(padL - 5, y + 3.2, fmt(v), { 'text-anchor': 'end', 'font-size': 9.5, fill: SR_C.axis })); }
  B.forEach(function(b, i){
    var x0 = padL + i * slot + (slot - gw) / 2, base = yOf(0), acc = 0;
    b.vals.forEach(function(val, si){
      if (val == null) { if (o.missing && !o.stacked) svg.appendChild(svgNode('line', { x1: x0, x2: x0 + gw, y1: base + 3.5, y2: base + 3.5, stroke: SR_C.rule, 'stroke-width': 1.2 })); return; }
      if (!val) return;
      var s = o.series[si], h = base - yOf(val), x = o.stacked ? x0 : x0 + si * (bw + 1.5), w = o.stacked ? gw : bw, yTop = base - acc - h;
      var r = svgNode('rect', { x: x, y: yTop, width: Math.max(0.6, w), height: h, fill: (b.colors && b.colors[si]) || s.color, stroke: s.stroke || 'none', 'stroke-width': s.stroke ? 0.75 : 0 });
      svgTitle(r, (b.title || b.label) + ' · ' + (s.label || '') + ': ' + fmt(val)); svg.appendChild(r);
      if (o.stacked) acc += h;
      if (o.valueLabels && !o.stacked && w >= 9) svg.appendChild(svgText(x + w / 2, yTop - 3, lfmt(val), { 'text-anchor': 'middle', 'font-size': w >= 14 ? 9.5 : 8.5, fill: SR_C.ink }));
    });
    if (o.valueLabels && o.stacked && acc && slot >= 16) svg.appendChild(svgText(x0 + gw / 2, base - acc - 3, fmt(evSum(b.vals.map(function(x){ return x || 0; }))), { 'text-anchor': 'middle', 'font-size': 9.5, fill: SR_C.ink }));
    if (b.tick) svg.appendChild(svgNode('line', { x1: padL + i * slot + slot / 2, x2: padL + i * slot + slot / 2, y1: base, y2: base + 4, stroke: SR_C.axis, 'stroke-width': 0.75 }));
    if (b.showLabel !== false && b.label) svg.appendChild(svgText(padL + i * slot + slot / 2, H - 9, b.label, { 'text-anchor': 'middle', 'font-size': 9.5, fill: SR_C.mut }));
  });
  if (o.ref) {
    var ry = yOf(o.ref.v);
    svg.appendChild(svgNode('line', { x1: padL, x2: W - padR, y1: ry, y2: ry, stroke: '#fff', 'stroke-width': 2.6, opacity: 0.85 }));
    svg.appendChild(svgNode('line', { x1: padL, x2: W - padR, y1: ry, y2: ry, stroke: SR_C.ref, 'stroke-width': 1.2, 'stroke-dasharray': '5 3' }));
    if (o.ref.label) { var lab = svgText(W - padR - 2, ry - 4, o.ref.label, { 'text-anchor': 'end', 'font-size': 9.5, fill: SR_C.ref, 'font-weight': 600 }); lab.setAttribute('paint-order', 'stroke'); lab.setAttribute('stroke', '#fff'); lab.setAttribute('stroke-width', 3); svg.appendChild(lab); }
  }
  return svg;
}
/* horizontal distribution bars: rows [{label, n, strong}] */
function srBars(rows, total, unit, aria){
  var W = 350, rowH = 21, top = 4, H = top + rows.length * rowH + 2, lab = 96, right = 74, plotW = W - lab - right;
  var max = Math.max.apply(null, rows.map(function(r){ return r.n; }).concat([1]));
  var svg = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', 'class': 'sr-svg', role: 'img', 'aria-label': aria || 'Distribution' });
  rows.forEach(function(r, i){
    var y = top + i * rowH, w = r.n / max * plotW;
    svg.appendChild(svgText(lab - 8, y + 13, r.label, { 'text-anchor': 'end', 'font-size': 10, fill: SR_C.ink }));
    svg.appendChild(svgNode('rect', { x: lab, y: y + 3, width: plotW, height: 13, fill: SR_C.band }));
    if (r.n) svg.appendChild(svgNode('rect', { x: lab, y: y + 3, width: Math.max(1, w), height: 13, fill: r.strong ? SR_C.dark : SR_C.mid }));
    svg.appendChild(svgText(lab + plotW + 6, y + 13, srN(r.n) + (total ? ' (' + srPct(r.n, total) + ')' : ''), { 'font-size': 10, fill: SR_C.ink, 'font-weight': 600 }));
  });
  return svg;
}

/* ---------- the figures ---------- */
function srNightFigure(ds){
  var p = ds.profile, rows = ds.overnight.rows.filter(function(r){ return r.status === 'complete' || r.status === 'partial' || r.status === 'missing'; });
  var n = rows.length, every = n <= 21 ? 1 : n <= 45 ? 7 : 14;
  var buckets = rows.map(function(r){
    var d = pd(r.date), mon = d.getDay() === 1, weekNo = Math.round(evDaysBetween(evMondayOf(rows[0].date), evMondayOf(r.date)) / 7);
    var show = every === 1 ? true : (mon && weekNo % (every / 7) === 0);
    return { label: every === 1 ? String(d.getDate()) : srDay(r.date), showLabel: show, tick: every !== 1 && show, title: 'Night of ' + srDate(r.date), vals: [r.assistHours], colors: [r.assistHours != null && r.assistHours > p.allowance ? SR_C.dark : SR_C.mid] };
  });
  return srColumns({ buckets: buckets, series: [{ color: SR_C.dark, label: 'hours of assistance' }], height: 200, yMin: 4, missing: true, maxBar: 16, ref: { v: p.allowance, label: srH(p.allowance) + ' h' }, fmt: function(v){ return srH(v); }, aria: 'Hours of recorded overnight assistance for each night' });
}
function srWeekFigure(ds){
  var wk = ds.profile.weeks;
  return srColumns({ buckets: wk.map(function(w){ return { label: srDay(w.from) + (w.days < 7 ? '*' : ''), title: 'Week ' + srWeekLabel(w), vals: [w.falls, w.nearMisses] }; }), series: [{ color: SR_C.dark, label: 'falls' }, { color: SR_C.pale, stroke: SR_C.mid, label: 'near misses' }], height: 180, yMin: 4, valueLabels: true, maxBar: 18, aria: 'Falls and near misses recorded each week' });
}
function srHourFigure(ds){
  var p = ds.profile, order = []; for (var h = 7; h < 31; h++) order.push(h % 24);
  return srColumns({ buckets: order.map(function(h, i){ return { label: srHour(h), showLabel: i % 3 === 0, tick: i % 3 === 0, title: srHour(h) + ' to ' + srHour((h + 1) % 24), vals: [p.falls.byHour[h], p.nearMisses.byHour[h]] }; }), series: [{ color: SR_C.dark, label: 'falls' }, { color: SR_C.pale, stroke: SR_C.mid, label: 'near misses' }], stacked: true, height: 180, yMin: 4, valueLabels: true, maxBar: 20, band: { from: 16, to: 23, label: 'Overnight, 11pm to 7am' }, aria: 'Falls and near misses by hour of the day' });
}
function srRateFigure(ds, key, aria){
  var wk = ds.profile.weeks;
  return srColumns({ width: 350, height: 150, buckets: wk.map(function(w, i){ return { label: srDay(w.from), showLabel: wk.length <= 6 || i % 3 === 0, tick: wk.length > 6 && i % 3 === 0, title: 'Week ' + srWeekLabel(w), vals: [w[key] != null && w.careDays ? evRound(w[key] / w.careDays, 1) : null] }; }), series: [{ color: SR_C.mid, label: 'per day' }], yMin: 4, missing: true, maxBar: 16, valueLabels: wk.length <= 16, labelFmt: function(v){ return srN(v, 1); }, aria: aria });
}

/* ---------- the plain statements (each one a count and its basis; no adjectives) ---------- */
function srStatements(ds){
  var p = ds.profile, o = p.overnight, f = p.falls, nm = p.nearMisses, c = p.care, out = [];
  out.push([ 'Support delivered. ', 'Support was recorded on ' + srPlural(p.service.days, 'day') + ' between ' + srDate(p.service.first) + ' and ' + srDate(p.service.last) + ': ' + srPlural(p.service.dayShifts, 'day shift') + ' and ' + srPlural(p.service.nightShifts, 'overnight shift') + ', an average of ' + srN(p.service.hoursPerDay, 1) + ' hours of one-to-one support per day.' ]);
  if (o.n) out.push([ 'Overnight. ', 'Between 11:00pm and 7:00am the support worker was actively assisting for an average of ' + srH(o.mean) + ' hours a night (median ' + srH(o.median) + ', range ' + srH(o.min) + ' to ' + srH(o.max) + '), across ' + srN(o.n) + ' of ' + srPlural(o.of, 'night') + ' with an overnight record. Assistance exceeded ' + srH(p.allowance) + ' hours on ' + srN(o.over) + ' of those ' + srN(o.n) + ' nights (' + o.overPct + '%).' + (o.wakesMean != null ? ' The participant woke needing support an average of ' + srN(o.wakesMean, 1) + ' times a night before the final wake.' : '') ]);
  out.push([ 'Falls. ', srPlural(f.n, 'fall') + ' ' + (f.n === 1 ? 'was' : 'were') + ' recorded on incident reports' + (f.perWeek != null ? ', a rate of ' + srN(f.perWeek, 1) + ' per week, on ' + srPlural(f.days, 'separate day') : '') + '.' + (f.n ? ' ' + srN(f.bands.night) + ' happened overnight (11:00pm to 7:00am), ' + srN(f.bands.evening) + ' in the evening and ' + srN(f.bands.day) + ' during the day' + (f.bands.untimed ? '; ' + srN(f.bands.untimed) + ' had no time recorded' : '') + '. ' + srN(f.duringTransfer) + ' happened during a transfer and an emergency service was called for ' + srN(f.emergency) + '. The longest run of days without a recorded fall was ' + srPlural(f.longestFreeRun, 'day') + '.' : '') ]);
  out.push([ 'Near misses. ', srPlural(nm.n, 'near miss', 'near misses') + ' ' + (nm.n === 1 ? 'was' : 'were') + ' recorded' + (nm.perWeek != null ? ' (' + srN(nm.perWeek, 1) + ' per week)' : '') + '.' + (nm.n ? ' ' + srN(nm.duringTransfer) + ' happened during a transfer.' : '') + ' A fall or a near miss was recorded on ' + srN(p.eventDays) + ' of the ' + srPlural(p.service.days, 'day') + ' of support.' ]);
  if (c.logs) out.push([ 'Personal care and transfers. ', (c.padTotal != null ? srPlural(c.padTotal, 'continence pad change') + ' ' + (c.padTotal === 1 ? 'was' : 'were') + ' recorded (' + srN(c.padWet || 0) + ' wet, ' + srN(c.padBowel || 0) + ' bowel), an average of ' + srN(c.padPerDay, 1) + ' per day' + (c.bedWet != null ? '; the participant was found wet in bed ' + srPlural(c.bedWet, 'time') : '') + '. ' : '') + (c.transfers != null ? srPlural(c.transfers, 'assisted transfer') + ' ' + (c.transfers === 1 ? 'was' : 'were') + ' recorded, an average of ' + srN(c.transfersPerDay, 1) + ' per day.' : '') ]);
  return el('ol', { 'class': 'sr-points' }, out.map(function(s){ return el('li', null, [ el('b', null, s[0]), s[1] ]); }));
}
function srStat(value, unit, label, basis){ return el('div', { 'class': 'sr-stat' }, [ el('div', { 'class': 'v' }, [ value, unit ? el('span', null, unit) : null ]), el('div', { 'class': 'l' }, label), el('div', { 'class': 'b' }, basis) ]); }

/* ---------- the document ---------- */
function srReport(ds, ctx){
  /* ctx: { org, meta:{name, ndis, author, role}, status, issued, demo } */
  var p = ds.profile, o = p.overnight, f = p.falls, nm = p.nearMisses, c = p.care, cv = ds.coverage, meta = ctx.meta || {};
  var sheet = el('article', { 'class': 'sr-sheet' });
  var name = meta.name || ds.client.name;
  function row(k, v){ return v ? el('div', null, [ el('dt', null, k), el('dd', null, v) ]) : null; }
  sheet.appendChild(el('header', { 'class': 'sr-head' }, [
    el('div', { 'class': 'sr-org' }, [ el('span', null, ctx.org), el('span', null, ctx.status) ]),
    el('h1', { 'class': 'sr-title' }, 'Support Data Summary'),
    el('div', { 'class': 'sr-subtitle' }, 'Recorded support, falls, personal care and overnight assistance' + (ctx.demo ? ' — demonstration, synthetic data' : '')),
    el('dl', { 'class': 'sr-meta' }, [
      row('Participant', name), row('NDIS number', meta.ndis),
      row('Reporting period', srDate(ds.from) + ' to ' + srDate(ds.to) + ' (' + srPlural(cv.periodDays, 'day') + ')'),
      row('Support recorded', srPlural(p.service.days, 'day') + ' · ' + srPlural(cv.shifts.completed, 'shift') + ' · ' + srN(p.service.hours) + ' hours'),
      row('Prepared by', [meta.author, meta.role].filter(Boolean).join(', ')), row('Date issued', srDate(ctx.issued))
    ])
  ]));

  /* 1 */
  sheet.appendChild(srSection(1, 'Key figures', [
    el('div', { 'class': 'sr-stats' }, [
      srStat(srN(p.service.hoursPerDay, 1), 'h', 'Support per day', srN(p.service.hours) + ' hours over ' + srPlural(p.service.days, 'day')),
      srStat(srH(o.mean), 'h', 'Overnight assistance per night', 'mean of ' + srPlural(o.n, 'night') + ', 11pm to 7am'),
      srStat(o.n ? srN(o.over) + ' of ' + srN(o.n) : '—', '', 'Nights with more than ' + srH(p.allowance) + ' h of assistance', o.overPct != null ? o.overPct + '% of nights with a record' : 'no overnight record'),
      srStat(srN(f.emergency), '', 'Falls with an emergency call', 'of ' + srPlural(f.n, 'fall')),
      srStat(srN(f.perWeek, 1), '', 'Falls per week', srPlural(f.n, 'fall') + ' in ' + srN(p.service.weeks, 1) + ' weeks'),
      srStat(srN(nm.perWeek, 1), '', 'Near misses per week', srPlural(nm.n, 'near miss', 'near misses') + ' in ' + srN(p.service.weeks, 1) + ' weeks'),
      srStat(srN(c.padPerDay, 1), '', 'Continence pad changes per day', c.padTotal != null ? srN(c.padTotal) + ' over ' + srPlural(c.padDays, 'logged day') : 'not recorded'),
      srStat(srN(c.transfersPerDay, 1), '', 'Assisted transfers per day', c.transfers != null ? srN(c.transfers) + ' over ' + srPlural(c.transferDays, 'logged day') : 'not recorded')
    ]),
    srStatements(ds)
  ]));

  /* 2 */
  var missingNights = ds.overnight.missing + ds.overnight.partial - (o.n - ds.overnight.complete);
  sheet.appendChild(srSection(2, 'Overnight assistance', [
    el('p', { 'class': 'sr-lead' }, 'Hours the support worker was actively assisting the participant between 11:00pm and 7:00am. The dashed line marks ' + srH(p.allowance) + ' hours: the NDIS funds a sleepover shift where up to ' + srH(p.allowance) + ' hours of awake support is needed overnight, and active overnight support where more is regularly needed.'),
    srFigure('Figure 1', 'Hours of overnight assistance, each night', srNightFigure(ds), null),
    srKey([{ c: SR_C.dark, l: 'More than ' + srH(p.allowance) + ' h' }, { c: SR_C.mid, l: srH(p.allowance) + ' h or less' }, { c: SR_C.ref, line: true, l: srH(p.allowance) + ' h' }].concat(missingNights > 0 ? [{ c: SR_C.rule, l: 'No overnight record (' + missingNights + ')' }] : [])),
    el('div', { 'class': 'sr-two' }, [
      srFigure('Figure 2', 'Nights by hours of assistance', srBars(o.bands.map(function(b){ return { label: b.label, n: b.n, strong: b.over }; }), o.n, 'nights', 'Number of nights in each band of assistance hours'), null),
      el('figure', { 'class': 'sr-fig' }, [ el('figcaption', { 'class': 'sr-figcap' }, [ el('b', null, 'Table 1'), 'Overnight record' ]), srTable([ 'Measure', { t: 'Recorded', n: true } ], [
        [ 'Nights in the period', { t: srN(o.of), n: true } ], [ 'Nights with an overnight record', { t: srN(o.n), n: true } ],
        [ 'Mean assistance per night', { t: srH(o.mean) + ' h', n: true } ], [ 'Median · range', { t: srH(o.median) + ' h · ' + srH(o.min) + '–' + srH(o.max) + ' h', n: true } ],
        [ 'Nights above ' + srH(p.allowance) + ' h', { t: srN(o.over) + ' (' + (o.overPct == null ? '—' : o.overPct + '%') + ')', n: true } ],
        [ 'Total hours of assistance', { t: srN(o.totalHours, 1) + ' h', n: true } ], [ 'Hours above ' + srH(p.allowance) + ' h a night', { t: srN(o.hoursOver, 1) + ' h', n: true } ],
        [ 'Mean sleep, 11pm to 7am', { t: srH(o.meanAsleep) + ' h', n: true } ], [ 'Mean wakes needing support', { t: srN(o.wakesMean, 1), n: true } ]
      ]) ])
    ])
  ]));

  /* 3 */
  var locs = {}; ds.incidents.byLocation.forEach(function(r){ (locs[r.key] = locs[r.key] || { f: 0, n: 0 }).f = r.n; }); ds.nearMisses.byLocation.forEach(function(r){ (locs[r.key] = locs[r.key] || { f: 0, n: 0 }).n = r.n; });
  var locRows = Object.keys(locs).map(function(k){ return { k: k, f: locs[k].f, n: locs[k].n }; }).sort(function(a, b){ return (b.f + b.n) - (a.f + a.n) || (a.k < b.k ? -1 : 1); });
  var tail = locRows.slice(7), head = locRows.slice(0, 7);
  if (tail.length > 1) head.push({ k: 'Other locations (' + tail.length + ')', f: evSum(tail.map(function(r){ return r.f; })), n: evSum(tail.map(function(r){ return r.n; })) }); else head = locRows;
  function bandRow(lbl, key){ return [ lbl, { t: srN(f.bands[key]), n: true }, { t: srN(nm.bands[key]), n: true } ]; }
  sheet.appendChild(srSection(3, 'Falls and near misses', [
    el('p', { 'class': 'sr-lead' }, 'Falls are recorded on incident reports. A near miss is a loss of balance or a fall that the support worker prevented.'),
    srFigure('Figure 3', 'Falls and near misses recorded each week', srWeekFigure(ds), null),
    srKey([{ c: SR_C.dark, l: 'Falls' }, { c: SR_C.pale, stroke: SR_C.mid, l: 'Near misses' }].concat(p.weeks.some(function(w){ return w.days < 7; }) ? [{ c: 'transparent', l: '* Part week (fewer than seven days in the reporting period)' }] : [])),
    srFigure('Figure 4', 'Falls and near misses by time of day', srHourFigure(ds), (f.bands.untimed + nm.bands.untimed ? srPlural(f.bands.untimed + nm.bands.untimed, 'event') + ' had no time recorded.' : null)),
    el('div', { 'class': 'sr-two' }, [
      el('figure', { 'class': 'sr-fig' }, [ el('figcaption', { 'class': 'sr-figcap' }, [ el('b', null, 'Table 2'), 'Where they happened' ]), srTable([ 'Location recorded', { t: 'Falls', n: true }, { t: 'Near misses', n: true } ], head.map(function(r){ return [ r.k, { t: srN(r.f), n: true }, { t: srN(r.n), n: true } ]; }).concat([{ total: true, cells: [ 'Total', { t: srN(f.n), n: true }, { t: srN(nm.n), n: true } ] }])) ]),
      el('figure', { 'class': 'sr-fig' }, [ el('figcaption', { 'class': 'sr-figcap' }, [ el('b', null, 'Table 3'), 'When and how they happened' ]), srTable([ 'Measure', { t: 'Falls', n: true }, { t: 'Near misses', n: true } ], [
        bandRow('Day, 7am to 6pm', 'day'), bandRow('Evening, 6pm to 11pm', 'evening'), bandRow('Overnight, 11pm to 7am', 'night') ].concat(f.bands.untimed + nm.bands.untimed ? [bandRow('Time not recorded', 'untimed')] : []).concat([
        [ 'During a transfer', { t: srN(f.duringTransfer), n: true }, { t: srN(nm.duringTransfer), n: true } ],
        [ 'Emergency service called', { t: srN(f.emergency), n: true }, { t: '—', n: true } ],
        [ 'Days with at least one', { t: srN(f.days), n: true }, { t: srN(nm.days), n: true } ],
        [ 'Rate per week', { t: srN(f.perWeek, 1), n: true }, { t: srN(nm.perWeek, 1), n: true } ]
      ])) ])
    ])
  ]));

  /* 4 */
  sheet.appendChild(srSection(4, 'Personal care and transfers', [
    el('p', { 'class': 'sr-lead' }, 'From the personal care log completed for each shift (' + srN(cv.shifts.withCareLog) + ' of ' + srPlural(cv.shifts.completed, 'shift') + ').'),
    c.logs ? el('div', { 'class': 'sr-two' }, [
      srFigure('Figure 5', 'Continence pad changes per day, by week', srRateFigure(ds, 'pads', 'Average continence pad changes per logged day, each week'), srN(c.padTotal) + ' changes over ' + srPlural(c.padDays, 'logged day') + ': ' + srN(c.padWet || 0) + ' wet, ' + srN(c.padBowel || 0) + ' bowel' + (c.bedWet != null ? '. Found wet in bed ' + srPlural(c.bedWet, 'time') + '.' : '.')),
      srFigure('Figure 6', 'Assisted transfers per day, by week', srRateFigure(ds, 'transfers', 'Average assisted transfers per logged day, each week'), srN(c.transfers) + ' transfers over ' + srPlural(c.transferDays, 'logged day') + '.')
    ]) : el('p', { 'class': 'sr-lead' }, 'No personal care logs were recorded in this period.')
  ]));

  /* 5 */
  var W = p.weeks;
  function tot(k){ var v = W.filter(function(w){ return w[k] != null; }); return v.length ? evSum(v.map(function(w){ return w[k]; })) : null; }
  sheet.appendChild(srSection(5, 'Week by week', [
    el('figure', { 'class': 'sr-fig' }, [ el('figcaption', { 'class': 'sr-figcap' }, [ el('b', null, 'Table 4'), 'Recorded support, each week of the reporting period' ]),
      srTable([ 'Week', { t: 'Days', n: true }, { t: 'Support hours', n: true }, { t: 'Nights recorded', n: true }, { t: 'Mean overnight assistance', n: true }, { t: 'Nights above ' + srH(p.allowance) + ' h', n: true }, { t: 'Falls', n: true }, { t: 'Near misses', n: true }, { t: 'Pad changes', n: true }, { t: 'Transfers', n: true } ],
        W.map(function(w){ return [ srWeekLabel(w), { t: srN(w.days), n: true }, { t: srN(w.hours), n: true }, { t: srN(w.nights), n: true }, { t: w.assistMean == null ? '—' : srH(w.assistMean) + ' h', n: true }, { t: w.nights ? srN(w.nightsOver) : '—', n: true }, { t: srN(w.falls), n: true }, { t: srN(w.nearMisses), n: true }, { t: srN(w.pads), n: true }, { t: srN(w.transfers), n: true } ]; })
          .concat([{ total: true, cells: [ 'Period', { t: srN(p.service.days), n: true }, { t: srN(p.service.hours), n: true }, { t: srN(o.n), n: true }, { t: srH(o.mean) + ' h', n: true }, { t: srN(o.over), n: true }, { t: srN(f.n), n: true }, { t: srN(nm.n), n: true }, { t: srN(tot('pads')), n: true }, { t: srN(tot('transfers')), n: true } ] }]), { cls: 'sr-wide' }) ])
  ]));

  /* 6 */
  sheet.appendChild(srSection(6, 'Records', [
      el('figure', { 'class': 'sr-fig' }, [ el('figcaption', { 'class': 'sr-figcap' }, [ el('b', null, 'Table 5'), 'Records this summary is drawn from' ]), srTable([ 'Record', { t: 'Number', n: true }, 'Coverage' ], [
        [ 'Shift notes', { t: srN(cv.records.notes), n: true }, srN(cv.shifts.withNote) + ' of ' + srPlural(cv.shifts.completed, 'shift') ],
        [ 'Personal care logs', { t: srN(cv.records.careLogs), n: true }, srN(cv.shifts.withCareLog) + ' of ' + srPlural(cv.shifts.completed, 'shift') ],
        [ 'Overnight summaries', { t: srN(cv.records.overnightLogs), n: true }, srN(o.n) + ' of ' + srPlural(o.of, 'night') ],
        [ 'Incident reports', { t: srN(ds.incidents.n), n: true }, srPlural(f.n, 'fall') + ', ' + srN(ds.incidents.n - f.n) + ' other' ],
        [ 'Near miss records', { t: srN(nm.n), n: true }, srPlural(nm.days, 'day') ]
      ]) ])
  ]));
  return sheet;
}

/* context for the live tab / the printed document */
function srContext(ver){
  var S = sumState(), c = sumClient(), who = ver && ver.snapshot && ver.snapshot.reviewer ? ver.snapshot.reviewer : sumMe(), meta = srMeta(c);
  if (!meta.author) meta.author = who.name || '';
  return { org: state.data.settings.org_name || 'Astar Health Service', meta: meta, demo: S.demo, issued: ver ? (ver.finalised_at || ver.created_at).slice(0, 10) : todayYmd(), status: '' };
}
