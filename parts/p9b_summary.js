/* ================= admin: Summary tab — evidence about support needs =================
   Data for the selected period is fetched from the server in pages (no cache limits), every
   figure is computed by p9a_metrics.js, and only reviewed observations enter the numbers. */
var SUM_PAGE = 1000;
var SUM_VIEWS = [['overview', 'Overview'], ['overnight', 'Overnight'], ['daytime', 'Daytime support'], ['incidents', 'Incidents and outcomes'], ['sources', 'Sources and checks']];

function sbSelAll(table, query){
  var all = [];
  function page(off){
    return sbSel(table, query + '&limit=' + SUM_PAGE + '&offset=' + off).then(function(rows){
      rows = rows || []; all = all.concat(rows);
      return rows.length === SUM_PAGE ? page(off + SUM_PAGE) : all;
    });
  }
  return page(0);
}
function sumState(){
  if (!state.sum) state.sum = { view: 'overview', client: null, from: addDays(todayYmd(), -27), to: todayYmd(), loading: false, loadedKey: null, data: null, ds: null, evidenceTables: null, versions: [], demo: false, statements: null, obsFilter: 'proposed', err: null, frozen: null };
  return state.sum;
}
function sumClient(){ var S = sumState(); if (!S.client) { var t = state.data.clients.find(function(c){ return c.name === 'Tim'; }); S.client = t ? t.id : (state.data.clients[0] || {}).id; } return clientById(S.client); }
function sumIsMissingTable(e){ return /42P01|does not exist|relation|404|PGRST205|Could not find the table/i.test((e && e.message) || ''); }

/* ---------- load the period (server-side, paginated) ---------- */
function sumLoad(force){
  var S = sumState(), c = sumClient(); if (!c) return Promise.resolve();
  var key = c.id + '|' + S.from + '|' + S.to + '|' + (S.demo ? 'demo' : 'live');
  if (!force && S.loadedKey === key && S.data) return Promise.resolve();
  S.loading = true; S.err = null; render();
  var q = 'select=*&participant_id=eq.' + c.id;
  var ev = S.demo ? Promise.resolve(sumDemoData(c, S.from, S.to)) :
    Promise.all([ sbSelAll('ac_evidence_sources', q), sbSelAll('ac_evidence_observations', q + '&obs_date=gte.' + addDays(S.from, -1) + '&obs_date=lte.' + addDays(S.to, 1)), sbSelAll('ac_report_versions', q + '&order=created_at.desc') ])
      .then(function(r){ S.evidenceTables = true; return { sources: r[0], observations: r[1], versions: r[2] }; })
      ["catch"](function(e){ if (sumIsMissingTable(e)) { S.evidenceTables = false; return { sources: [], observations: [], versions: [] }; } throw e; });
  return Promise.all([
    sbSelAll('ac_shifts', 'select=*&client_id=eq.' + c.id + '&date=gte.' + S.from + '&date=lte.' + S.to + '&order=date'),
    sbSelAll('ac_incident_forms', q + '&incident_date=gte.' + S.from + '&incident_date=lte.' + S.to),
    sbSelAll('ac_near_misses', q + '&nm_date=gte.' + S.from + '&nm_date=lte.' + S.to),
    sbSelAll('ac_care_logs', q), sbSelAll('ac_overnight_logs', q), sbSelAll('ac_note_entries', q + '&note_type=neq.Mileage'),
    ev
  ]).then(function(r){
    S.data = { shifts: r[0], incidents: r[1], nearMisses: r[2], careLogs: r[3], overnightLogs: r[4], notes: r[5], sources: r[6].sources, observations: r[6].observations };
    S.versions = r[6].versions || [];
    if (S.demo) S.evidenceTables = true;
    var draft = S.versions.find(function(v){ return v.status === 'draft'; });
    S.statements = (draft && draft.snapshot && draft.snapshot.statements) || sumLocalStatements(c.id) || {};
    S.loadedKey = key; S.loading = false; S.frozen = null;
    sumCompute(); render();
  })["catch"](function(e){ S.loading = false; S.err = e.message; render(); });
}
function sumCompute(){
  var S = sumState(), c = sumClient(); if (!S.data || !c) return;
  var inp = { client: c, from: S.from, to: S.to, tz: 'Australia/Melbourne' };
  Object.keys(S.data).forEach(function(k){ inp[k] = S.data[k]; });
  S.ds = evBuildDataset(inp);
}
function sumLocalStatements(cid){ try { return JSON.parse(localStorage.getItem('ac_sum_statements_' + cid) || 'null'); } catch (e) { return null; } }
function sumSaveStatements(){
  var S = sumState(), c = sumClient();
  try { localStorage.setItem('ac_sum_statements_' + c.id, JSON.stringify(S.statements)); } catch (e) {}
  if (!S.evidenceTables || S.demo) { toast(S.demo ? 'Demonstration mode — kept on this device only' : 'Kept on this device only (evidence tables not deployed yet)'); return Promise.resolve(); }
  var draft = S.versions.find(function(v){ return v.status === 'draft'; });
  var snap = { statements: S.statements, dataset: S.ds };
  var p = draft ? sbUpd('ac_report_versions', 'id=eq.' + draft.id, { snapshot: snap, period_from: S.from, period_to: S.to, calc_version: EV_CALC_VERSION + '+' + BUILD_V })
                : sbIns('ac_report_versions', [{ participant_id: c.id, period_from: S.from, period_to: S.to, status: 'draft', calc_version: EV_CALC_VERSION + '+' + BUILD_V, snapshot: snap, created_by: state.auth && state.auth.workerId || null }]);
  return p.then(function(){ toast('Draft saved'); return sumLoad(true); })["catch"](function(e){ toast(e.message, true); });
}

/* ---------- shared bits ---------- */
function sumN(n){ return n == null ? '—' : String(n); }
function sumH(h){ return h == null ? '—' : hrsFmt(h) + ' h'; }
function sumPct(n, d){ return d ? n + ' of ' + d + ' (' + Math.round(n / d * 100) + '%)' : (n + ' of 0'); }
function sumFmtNight(r){ return fmtDate(r.date) + ' → ' + fmtDate(r.endDate); }
function sumBadge(txt, cls){ return el('span', { 'class': 'status ' + (cls || 'na') }, txt); }
function sumSourceLabel(kind){ return { upload: 'Uploaded document', note: 'Shift note', incident: 'Incident report', near_miss: 'Near miss', care_log: 'Care log', overnight_log: 'Overnight summary' }[kind] || kind; }

/* ---------- the tab ---------- */
function viewReports(main){
  var S = sumState(), c = sumClient();
  main.appendChild(el('div', { 'class': 'section-head rp-controls', style: 'margin:6px 0 12px;flex-wrap:wrap' }, [
    el('h1', { 'class': 't-display' }, 'Summary'),
    el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
      el('button', { 'class': 'btn btn-sec btn-sm', onclick: sumOpenMethod }, 'How the figures are built'),
      el('button', { 'class': 'btn btn-sec btn-sm', onclick: openExportOptions }, [svgIcon(IC.file), 'Export records']),
      el('button', { 'class': 'btn btn-pri btn-sm', onclick: function(){ if (!S.ds) return; state.adminTab = 'sumdoc'; render(); window.scrollTo(0, 0); } }, [svgIcon(IC.file), 'Open report'])
    ])
  ]));
  main.appendChild(el('div', { 'class': 'rp-controls', style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px' }, [
    el('div', { 'class': 'field', style: 'margin:0;min-width:160px' }, [ el('label', { 'for': 'sum-client' }, 'Participant'),
      el('select', { 'class': 'sel', id: 'sum-client', onchange: function(e){ S.client = e.target.value; S.data = null; sumLoad(true); } }, state.data.clients.map(function(x){ return el('option', { value: x.id, selected: x.id === S.client }, x.name); })) ]),
    el('div', { 'class': 'field', style: 'margin:0' }, [ el('label', { 'for': 'sum-from' }, 'From'), el('input', { 'class': 'inp', id: 'sum-from', type: 'date', value: S.from, onchange: function(e){ S.from = e.target.value; sumLoad(true); } }) ]),
    el('div', { 'class': 'field', style: 'margin:0' }, [ el('label', { 'for': 'sum-to' }, 'To'), el('input', { 'class': 'inp', id: 'sum-to', type: 'date', value: S.to, onchange: function(e){ S.to = e.target.value; sumLoad(true); } }) ]),
    el('div', { 'class': 'seg', role: 'group', 'aria-label': 'Quick periods' }, [[27, '4 weeks'], [55, '8 weeks'], [90, '13 weeks']].map(function(p){
      return el('button', { onclick: function(){ S.from = addDays(todayYmd(), -p[0]); S.to = todayYmd(); sumLoad(true); } }, p[1]);
    })),
    el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ sumLoad(true); } }, 'Reload')
  ]));
  if (!S.data && !S.loading && !S.err) { sumLoad(); }
  if (S.loading) { main.appendChild(el('div', { 'class': 'notice', role: 'status' }, 'Loading every record for ' + (c ? c.name : '') + ', ' + fmtDate(S.from) + ' to ' + fmtDate(S.to) + '…')); return; }
  if (S.err) { main.appendChild(el('div', { 'class': 'banner warn' }, [ el('div', null, [ el('b', null, 'Could not load the period'), el('div', { 'class': 't-cap' }, S.err) ]) ])); return; }
  if (!S.ds) return;
  var ds = S.ds;
  if (S.demo) main.appendChild(el('div', { 'class': 'banner warn', style: 'margin-bottom:12px' }, [ el('div', null, [ el('b', null, 'DEMONSTRATION MODE — synthetic evidence data'), el('div', { 'class': 't-cap' }, 'Uploads, observations and versions shown here are generated examples kept in memory. Nothing is saved. Turn it off under Sources and checks.') ]) ]));
  if (S.evidenceTables === false) main.appendChild(el('div', { 'class': 'notice', style: 'margin-bottom:12px' }, 'Source import, review and report versions need database migration 002 (see migrations/README.md). Until it is deployed this tab shows the in-app records only.'));
  main.appendChild(el('div', { 'class': 'seg sum-tabs rp-controls', role: 'tablist', 'aria-label': 'Summary views', style: 'margin-bottom:14px' }, SUM_VIEWS.map(function(v){
    return el('button', { 'class': S.view === v[0] ? 'on' : '', role: 'tab', 'aria-selected': S.view === v[0] ? 'true' : 'false', onclick: function(){ S.view = v[0]; render(); } }, v[1]);
  })));
  var doc = el('div', { 'class': 'rp-doc' }); main.appendChild(doc);
  doc.appendChild(sumMast(ds, c));
  ({ overview: sumOverview, overnight: sumOvernight, daytime: sumDaytime, incidents: sumIncidents, sources: sumSources })[S.view](doc, ds, c);
}
function sumMast(ds, c){
  var cov = ds.coverage;
  return el('div', { 'class': 'rp-mast' }, [
    el('div', { 'class': 'rp-eyebrow' }, (state.data.settings.org_name || 'Astar Health Service') + ' · Support needs summary'),
    el('h2', null, c.name),
    el('p', { 'class': 'rp-period' }, fmtDateFull(ds.from) + ' to ' + fmtDateFull(ds.to) + ' · ' + cov.periodDays + ' days · times are ' + ds.tz),
    el('div', { 'class': 'rp-meta' }, [
      el('div', null, [ el('div', { 'class': 'k' }, 'Shifts rostered'), el('div', { 'class': 'v' }, cov.shiftsRostered + ' on ' + cov.daysWithShifts + ' days') ]),
      el('div', null, [ el('div', { 'class': 'k' }, 'Shift notes / care logs'), el('div', { 'class': 'v' }, sumPct(cov.shiftsWithNote, cov.shiftsRostered) + ' · ' + sumPct(cov.shiftsWithCareLog, cov.shiftsRostered)) ]),
      el('div', null, [ el('div', { 'class': 'k' }, 'Nights with an overnight summary'), el('div', { 'class': 'v' }, sumPct(cov.nightsWithSummary, cov.nightsRostered)) ]),
      el('div', null, [ el('div', { 'class': 'k' }, 'Incident reports · near misses'), el('div', { 'class': 'v' }, cov.incidentReports + ' · ' + cov.nearMisses) ]),
      el('div', null, [ el('div', { 'class': 'k' }, 'Uploaded sources · reviewed observations'), el('div', { 'class': 'v' }, cov.uploads + ' · ' + cov.acceptedObservations + (cov.proposedObservations ? ' (' + cov.proposedObservations + ' awaiting review)' : '')) ])
    ])
  ]);
}

/* ---------- Overview ---------- */
function sumFindings(ds){
  var o = ds.overnight, s = ds.safety, d = ds.daytime, cov = ds.coverage, out = [];
  out.push('Records exist for ' + sumPct(cov.shiftsWithNote, cov.shiftsRostered) + ' of rostered shifts (shift note) and ' + sumPct(cov.nightsWithSummary, cov.nightsRostered) + ' of rostered nights (overnight summary). Rostered shifts without a record are shown as not documented, not as no support.');
  if (o.documented) out.push('On the ' + o.documented + ' documented night' + (o.documented === 1 ? '' : 's') + ', direct worker assistance inside 11 pm to 7 am averaged ' + sumH(o.avgActive) + '; ' + o.nightsOver + ' of ' + o.documented + ' exceeded the 2 hours included in the sleepover price, by ' + sumH(o.hoursOver) + ' in total.');
  else out.push('No night in the period has a complete overnight summary, so no overnight figure is reported.');
  out.push(s.falls + ' fall' + (s.falls === 1 ? '' : 's') + ' and ' + s.nearMisses + ' near miss' + (s.nearMisses === 1 ? '' : 'es') + ' were recorded' + (s.events ? '; ' + s.transferRelated + ' of ' + s.events + ' recorded as happening during a transfer; ' + s.secondPerson + ' fall' + (s.secondPerson === 1 ? '' : 's') + ' where a second person was needed to get up; ' + s.emergencyCalls + ' emergency call' + (s.emergencyCalls === 1 ? '' : 's') : '') + '.');
  if (d.careLogs) out.push('Personal care logs cover ' + d.careDays + ' day' + (d.careDays === 1 ? '' : 's') + ': ' + d.measures[5].total + ' assisted transfers recorded (' + d.measures[5].recorded + ' of ' + d.careLogs + ' logs answered), ' + d.measures[6].total + ' recorded as not safely manageable by one worker.');
  else out.push('No personal care logs in the period, so no daytime load figures are reported.');
  return out;
}
function sumOverview(doc, ds, c){
  var S = sumState(), st = S.statements || {};
  doc.appendChild(rpSec(1, 'What the records show', 'Short factual statements computed from the records in this period. Every number has its denominator beside it.', [
    el('ul', { 'class': 'sum-findings' }, sumFindings(ds).map(function(t){ return el('li', null, t); }))
  ]));
  doc.appendChild(rpSec(2, 'Coverage', 'Rostered means a shift exists. It does not mean the support was delivered or documented.', [
    el('div', { 'class': 'rp-grid' }, [
      rpTile('Rostered shifts', String(ds.coverage.shiftsRostered), ds.coverage.daysWithShifts + ' days with a shift in ' + ds.coverage.periodDays),
      rpTile('Shift notes', sumPct(ds.coverage.shiftsWithNote, ds.coverage.shiftsRostered), 'Progress Notes on rostered shifts'),
      rpTile('Care logs', sumPct(ds.coverage.shiftsWithCareLog, ds.coverage.shiftsRostered), 'one expected per shift'),
      rpTile('Overnight summaries', sumPct(ds.coverage.nightsWithSummary, ds.coverage.nightsRostered), 'one expected per sleepover'),
      rpTile('Reviewed observations', String(ds.coverage.acceptedObservations), ds.coverage.proposedObservations ? ds.coverage.proposedObservations + ' proposed, awaiting review' : 'from uploaded or pasted sources')
    ])
  ]));
  var six = [
    ['What the original records document', 'Computed above and in the Overnight, Daytime and Incidents views. Only structured records and accepted observations count.', null],
    ['What the provider reports', 'Statements by the provider that are not themselves records (for example, care supplied beyond the funded hours and paid for privately).', 'provider_reports'],
    ['What a qualified clinician recommends', 'Only from an uploaded clinical document with its author named. Quote the recommendation and cite the source.', 'clinician'],
    ['What support is requested', 'The support the provider is asking to be funded, in plain words. This is a request, not a finding.', 'requested'],
    ['What funding documents establish', 'Plan allocation, remaining balance, delivered, claimed and provider-funded amounts, each with the document and date it came from. Allocation is never treated as the remaining balance.', 'funding'],
    ['What remains unknown or incomplete', 'Missing records, unreviewed proposals and reconciliation items are listed automatically under Sources and checks. Add anything else here.', 'unknown']
  ];
  doc.appendChild(rpSec(3, 'Six things this report keeps apart', 'Records, the provider’s own account, clinical recommendations, the request, funding facts and gaps are never blended. The editable statements are saved with the draft and printed under their own headings.', six.map(function(row){
    return el('div', { 'class': 'sum-six' }, [
      el('div', { 'class': 'sum-six-h' }, row[0]),
      el('div', { 'class': 't-cap', style: 'margin-bottom:6px' }, row[1]),
      row[2] ? el('textarea', { 'class': 'ta', rows: '3', 'aria-label': row[0], placeholder: 'Not stated', oninput: function(e){ st[row[2]] = e.target.value; S.statements = st; } }, st[row[2]] || '') : null
    ]);
  }).concat([ el('div', { style: 'display:flex;gap:8px;margin-top:8px' }, [ el('button', { 'class': 'btn btn-sm btn-pri', onclick: sumSaveStatements }, 'Save statements to the draft') ]) ])));
  doc.appendChild(el('div', { 'class': 'rp-method' }, [ el('b', null, 'This summary never concludes that funding must be approved, predicts a tribunal outcome, or gives legal advice. '), 'It is a reviewed evidence summary prepared by the provider. See “How the figures are built”.' ]));
}

/* ---------- Overnight ---------- */
function sumNightChart(rows){
  var W = 720, H = 220, padL = 40, padR = 14, top = 22, bottom = 34, plotH = H - top - bottom, plotW = W - padL - padR;
  var yMax = 8, n = rows.length || 1, slot = plotW / n, bw = Math.min(24, Math.max(6, slot - 8));
  var svg = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', 'class': 'rp-svg', role: 'img', 'aria-label': 'Direct worker assistance per rostered night, hours inside 11pm to 7am' });
  function yOf(v){ return top + plotH - v / yMax * plotH; }
  for (var g = 0; g <= 8; g += 2) { var y = yOf(g); svg.appendChild(svgNode('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: g === 0 ? RP_C.axis : RP_C.grid, 'stroke-width': 1 })); svg.appendChild(svgText(padL - 8, y + 4, g + ' h', { 'text-anchor': 'end' })); }
  var every = n <= 16 ? 1 : Math.ceil(n / 16);
  rows.forEach(function(r, i){
    var x = padL + i * slot + (slot - bw) / 2, base = yOf(0);
    if (r.status !== 'documented') {
      var box = svgNode('rect', { x: x, y: yOf(1), width: bw, height: base - yOf(1), fill: 'none', stroke: RP_C.axis, 'stroke-dasharray': '3 3', 'stroke-width': 1 });
      svgTitle(box, sumFmtNight(r) + ': ' + (r.status === 'missing' ? 'no overnight summary recorded' : 'summary without sleep-log hours')); svg.appendChild(box);
      if (slot >= 44) svg.appendChild(svgText(x + bw / 2, yOf(1) - 6, r.status === 'missing' ? 'no record' : 'partial', { 'text-anchor': 'middle', 'font-size': 9 }));
    } else {
      var within = Math.min(r.active, EV_SLEEPOVER_INCLUDED_HOURS), over = Math.max(0, r.active - EV_SLEEPOVER_INCLUDED_HOURS);
      if (within > 0) { var a = svgNode(over > 0 ? 'rect' : 'path', over > 0 ? { x: x, y: yOf(within) + 2, width: bw, height: base - yOf(within) - 2, fill: RP_C.acc } : { d: roundTopPath(x, yOf(within), bw, base - yOf(within), 4), fill: RP_C.acc }); svgTitle(a, sumFmtNight(r) + ': ' + hrsFmt(r.active) + ' h direct assistance'); svg.appendChild(a); }
      if (over > 0) { var b = svgNode('path', { d: roundTopPath(x, yOf(r.active), bw, yOf(within) - yOf(r.active), 4), fill: RP_C.bad }); svgTitle(b, sumFmtNight(r) + ': ' + hrsFmt(over) + ' h above the 2 h included'); svg.appendChild(b); svg.appendChild(svgText(x + bw / 2, yOf(r.active) - 6, '+' + hrsFmt(over), { 'text-anchor': 'middle', fill: RP_C.ink, 'font-weight': 600 })); }
      if (r.active === 0) svg.appendChild(svgText(x + bw / 2, base - 6, '0', { 'text-anchor': 'middle', fill: RP_C.ink }));
    }
    if (i % every === 0) svg.appendChild(svgText(x + bw / 2, H - 16, fmtDM(r.date), { 'text-anchor': 'middle' }));
  });
  var ry = yOf(EV_SLEEPOVER_INCLUDED_HOURS);
  svg.appendChild(svgNode('line', { x1: padL, x2: W - padR, y1: ry, y2: ry, stroke: RP_C.bad, 'stroke-width': 1.5 }));
  svg.appendChild(svgText(padL + 4, ry - 6, '2 h included in the sleepover price (NDIS PAPL)', { 'text-anchor': 'start', fill: RP_C.bad, 'font-weight': 600 }));
  svg.appendChild(svgText(padL, H - 3, 'Bars = direct worker assistance inside 11pm–7am · n = ' + rows.filter(function(r){ return r.status === 'documented'; }).length + ' documented of ' + rows.length + ' rostered · dashed = no record', { 'font-size': 10 }));
  return el('div', { 'class': 'rp-fig' }, svg);
}
function sumTimeline(events, rows){
  if (!events.length) return rpEmpty('No reviewed overnight observations yet', 'Import or paste the sleepover narratives under Sources and checks, then accept the time-anchored events. Only accepted events are plotted.');
  var nights = []; rows.forEach(function(r){ nights.push(r.date); }); events.forEach(function(e){ var d = e.start && tMin(e.start) < 720 ? addDays(e.date, -1) : e.date; if (nights.indexOf(d) < 0) nights.push(d); }); nights.sort();
  var W = 720, padL = 96, padR = 12, rowH = 18, top = 26, H = top + nights.length * rowH + 30, plotW = W - padL - padR;
  var span = 13 * 60; /* 18:00 → 07:00 = 13 h */
  function xOf(mins){ var m = mins < 720 ? mins + 1440 : mins; return padL + ((m - 18 * 60) / span) * plotW; }
  var svg = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', 'class': 'rp-svg', role: 'img', 'aria-label': 'Time-of-night timeline of reviewed overnight events' });
  ['18:00', '20:00', '22:00', '23:00', '01:00', '03:00', '05:00', '07:00'].forEach(function(t){ var x = xOf(tMin(t)); svg.appendChild(svgNode('line', { x1: x, x2: x, y1: top - 6, y2: H - 24, stroke: t === '23:00' || t === '07:00' ? RP_C.axis : RP_C.grid, 'stroke-width': 1 })); svg.appendChild(svgText(x, top - 10, fmtTime(t), { 'text-anchor': 'middle' })); });
  svg.appendChild(svgNode('rect', { x: xOf(23 * 60), y: top - 4, width: xOf(7 * 60) - xOf(23 * 60), height: nights.length * rowH + 4, fill: RP_C.acc, opacity: 0.06 }));
  nights.forEach(function(d, i){
    var y = top + i * rowH + 12;
    svg.appendChild(svgText(padL - 8, y + 4, fmtDate(d), { 'text-anchor': 'end' }));
    events.filter(function(e){ var dd = e.start && tMin(e.start) < 720 ? addDays(e.date, -1) : e.date; return dd === d; }).forEach(function(e){
      var x = xOf(tMin(e.start)); var col = e.category === 'overnight_assist' ? RP_C.acc : (e.category === 'overnight_supervision' ? RP_C.warn : RP_C.dim);
      var node = e.end ? svgNode('rect', { x: x, y: y - 5, width: Math.max(4, xOf(tMin(e.end)) - x), height: 10, rx: 2, fill: col }) : svgNode('circle', { cx: x, cy: y, r: 5, fill: col, stroke: '#fff', 'stroke-width': 2 });
      svgTitle(node, fmtTime(e.start) + (e.end ? '–' + fmtTime(e.end) : '') + ' ' + e.assist + (e.reason ? ' — ' + e.reason : '') + ' (' + e.timing + ')'); svg.appendChild(node);
    });
  });
  svg.appendChild(svgText(padL, H - 6, 'Shaded band = 11pm–7am sleep-log block · dot = time stated, bar = start and end stated · n = ' + events.length + ' accepted events', { 'font-size': 10 }));
  return el('div', { 'class': 'rp-fig' }, svg);
}
function sumOvernight(doc, ds, c){
  var o = ds.overnight;
  doc.appendChild(rpSec(1, 'Coverage of rostered nights', 'A night counts only when an overnight summary with sleep-log hours exists. Nights without one are shown as gaps, never as quiet nights.', [
    el('div', { 'class': 'rp-grid' }, [
      rpTile('Nights rostered', String(o.rostered), fmtDate(ds.from) + ' to ' + fmtDate(ds.to)),
      rpTile('Documented', sumPct(o.documented, o.rostered), 'summary with sleep-log hours'),
      rpTile('Partial', String(o.partial), 'summary without hours'),
      rpTile('No record', String(o.missing), 'not counted anywhere')
    ])
  ]));
  doc.appendChild(rpSec(2, 'Direct worker assistance per night (11 pm to 7 am)', 'Direct assistance is the X-coded 15-minute blocks on the paper sleep log: toileting, changes, transfers, prompting. Time the participant was awake without needing the worker is not included. The red line is the 2 hours included in the NDIS sleepover price; time above it is separately claimable. Crossing it is a pricing fact, not an eligibility finding.', o.rostered ? [
    sumNightChart(o.rows),
    rpLegend([{ c: RP_C.acc, l: 'Direct assistance within the 2 h included' }, { c: RP_C.bad, l: 'Direct assistance above 2 h' }, { c: '#fff', l: 'Dashed outline: no record for that night' }]),
    el('div', { 'class': 'rp-mini' }, [
      ['Documented nights', String(o.documented)], ['Average asleep', sumH(o.avgAsleep)], ['Average direct assistance', sumH(o.avgActive)], ['Average awake, no assistance', sumH(o.avgAwake)],
      ['Nights above 2 h', o.documented ? sumPct(o.nightsOver, o.documented) : '—'], ['Hours above 2 h, total', sumH(o.hoursOver)], ['Wakes before up (avg)', o.avgWakes == null ? '—' : hrsFmt(o.avgWakes) + ' · ' + o.wakesRecorded + ' recorded'], ['Average bed / up', (o.avgBed ? fmtTime(o.avgBed) : '—') + ' / ' + (o.avgUp ? fmtTime(o.avgUp) : '—')]
    ].map(function(p){ return el('div', null, [ el('div', { 'class': 'k' }, p[0]), el('div', { 'class': 'v' }, p[1]) ]); }))
  ] : [ rpEmpty('No sleepover shifts rostered in this period') ]));
  doc.appendChild(rpSec(3, 'When support happens during the night', 'Each mark is one reviewed observation from a shift narrative or uploaded document, plotted at the time the author gave. Estimated times are labelled as such in the tooltip and the table.', [
    sumTimeline(o.timeline, o.rows),
    o.timeline.length ? rpLegend([{ c: RP_C.acc, l: 'Direct assistance' }, { c: RP_C.warn, l: 'Necessary supervision (reason recorded)' }, { c: RP_C.dim, l: 'Awake, no assistance' }]) : null
  ]));
  if (o.upBuckets.length) doc.appendChild(rpSec(4, 'Time up for the day', 'Nights per half hour, documented nights only.', [ rpColumns(o.upBuckets.map(function(b){ return { label: fmtTime(b.time), vals: [b.nights] }; }), [{ name: 'Nights', color: RP_C.acc }], { height: 150, capLabel: function(g){ return String(g.vals[0]); } }) ]));
  var typeRows = {}; o.timeline.forEach(function(t){ var k = t.assist || 'unspecified'; typeRows[k] = (typeRows[k] || 0) + 1; });
  var typeKeys = Object.keys(typeRows);
  doc.appendChild(rpSec(5, 'Night by night', 'Every rostered night in the period, with its record status.', [
    rpTable([ 'Night', 'Status', 'Bed', 'Up', { t: 'Wakes', n: true }, { t: 'Asleep', n: true }, { t: 'Direct assistance', n: true }, { t: 'Above 2 h', n: true } ],
      o.rows.map(function(r){ return [ sumFmtNight(r), { t: r.status === 'documented' ? 'documented' : (r.status === 'partial' ? 'partial record' : 'no record'), m: r.status !== 'documented' }, r.bed ? fmtTime(r.bed) : '—', r.up ? fmtTime(r.up) : '—', { t: sumN(r.wakes), n: true }, { t: r.asleep == null ? '—' : hrsFmt(r.asleep) + ' h', n: true }, { t: r.active == null ? '—' : hrsFmt(r.active) + ' h', n: true }, { t: r.over ? '+' + hrsFmt(r.over) + ' h' : (r.active == null ? '—' : '0'), n: true } ]; })),
    typeKeys.length ? el('div', null, [ rpSub('Reviewed overnight events by type'), rpTable([ 'Type', { t: 'Events', n: true } ], typeKeys.map(function(k){ return [ k, { t: String(typeRows[k]), n: true } ]; })) ]) : null
  ], 'rp-sec-long'));
}

/* ---------- Daytime ---------- */
function sumDaytime(doc, ds, c){
  var d = ds.daytime, S = sumState(), st = S.statements || {};
  doc.appendChild(rpSec(1, 'Personal care and manual handling load', d.careLogs ? d.careLogs + ' care log' + (d.careLogs === 1 ? '' : 's') + ' across ' + d.careDays + ' day' + (d.careDays === 1 ? '' : 's') + '. “Recorded” shows how many logs answered that measure; per-day divides by days that have a log.' : 'No personal care logs in this period.', d.careLogs ? [
    rpTable([ 'Measure', { t: 'Total', n: true }, { t: 'Recorded', n: true }, { t: 'Per day', n: true }, 'Note' ], d.measures.map(function(m){
      return [ m.label, { t: String(m.total), n: true }, { t: m.recorded + ' of ' + m.of, n: true }, { t: m.perDay == null ? '—' : hrsFmt(m.perDay), n: true }, { t: m.preNullZero ? m.preNullZero + ' pre-Sep-2026 zero' + (m.preNullZero === 1 ? '' : 's') + ' may be blank' : '', m: true } ];
    }).concat([[ 'Showers offered / done / declined', { t: d.showers.offered + ' / ' + d.showers.done + ' / ' + d.showers.declined, n: true }, { t: '', n: true }, { t: d.showers.avgPrompts == null ? '—' : hrsFmt(d.showers.avgPrompts) + ' prompts avg', n: true }, { t: '“declined” = offered and not completed', m: true } ]]))
  ] : [ rpEmpty('No care logs recorded', 'Workers fill the care log from the shift card.') ]));
  doc.appendChild(rpSec(2, 'Tasks where a second worker is proposed', 'Four different facts, kept apart. Nothing in this table is inferred from a fall, weight, an emergency recovery or a neighbour helping.', [
    el('div', { 'class': 'rp-grid' }, [
      rpTile('Two workers actually assisted', String(d.twoWorkersActual), 'reviewed observations with 2+ workers, plus falls where a second person got the participant up'),
      rpTile('One worker reported difficulty', String(d.difficultyReported), 'transfers logged as not safe alone, plus near misses beyond one worker’s capacity'),
      rpTile('Clinician recommended two', st.clinician ? 'See statement' : 'No assessment on file', st.clinician ? 'from the uploaded clinical document' : 'evidence gap'),
      rpTile('Provider is requesting two', st.requested ? 'See statement' : 'Not stated', 'a request, not a finding')
    ]),
    rpSub('Task-based table (reviewed observations)'),
    d.tasks.length ? rpTable([ 'Date', 'Time', 'Task / activity', 'Assistance observed', { t: 'Workers', n: true }, 'Outcome', 'Source' ], d.tasks.map(function(t){ return [ fmtDate(t.date), t.time ? fmtTime(t.time) + (t.timing === 'estimated' ? ' (approx.)' : '') : '—', t.task, t.assistance, { t: sumN(t.workers), n: true }, t.outcome, { t: t.sourceRef, m: true } ]; })) : rpEmpty('No reviewed daytime observations yet', 'Accept daytime tasks under Sources and checks, or add them by hand from a source document.'),
    rpSub('Proposed staffing (provider statement)'),
    el('textarea', { 'class': 'ta', rows: '3', 'aria-label': 'Proposed staffing', placeholder: 'e.g. Two workers for showering and outdoor transfers, 1 hour per day. Labelled as proposed; not derived from the data.', oninput: function(e){ st.proposed_staffing = e.target.value; S.statements = st; } }, st.proposed_staffing || ''),
    el('div', { style: 'margin-top:8px' }, el('button', { 'class': 'btn btn-sm btn-pri', onclick: sumSaveStatements }, 'Save to the draft'))
  ]));
}

/* ---------- Incidents ---------- */
function sumIncidents(doc, ds, c){
  var ch = ds.chronology;
  doc.appendChild(rpSec(1, 'Chronology', 'One row per structured record. Repeated accounts of the same event (note, report, document) are linked under Sources and checks and are not repeated here. Absence of an incident is not evidence of absence of need. “Time on the floor” is not “time waiting for help”; “offered but not completed” is not “declined”; missing is not “no”.', ch.length ? [
    rpTable([ 'Date', 'Time', 'Type', 'Where', 'Response', 'Outcome', 'Emergency', 'Injury', '' ], ch.map(function(e){
      var rec = e.kind === 'incident' ? sumState().data.incidents.find(function(i){ return i.id === e.id; }) : sumState().data.nearMisses.find(function(n){ return n.id === e.id; });
      return [ fmtDate(e.date), e.time ? fmtTime(e.time) : '—', e.types + (e.fall ? ' · fall' : '') + (e.secondPerson ? ' · 2nd person to get up' : '') + (e.minutesOnFloor != null ? ' · ' + e.minutesOnFloor + ' min on floor' : ''), e.location || '—', e.response || '—', e.outcome || '—', e.emergency || '—', e.injuries, el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ if (!rec) return; if (e.kind === 'incident') openIncidentModal({ incident: rec, shift: rec.shift_id ? shiftById(rec.shift_id) : null }); else openNearMissModal({ nearMiss: rec, shift: rec.shift_id ? shiftById(rec.shift_id) : null }); } }, 'Open') ];
    }))
  ] : [ rpEmpty('No incident reports or near misses in this period') ]));
  doc.appendChild(rpSec(2, 'Successful support and prevention', 'Near misses record what stopped a fall. They are evidence of support that worked, not only of risk.', ds.safety.nearMisses ? [
    rpTable([ 'Date', 'Where', 'What stopped it', 'Beyond one worker' ], sumState().data.nearMisses.filter(function(n){ return n.nm_date >= ds.from && n.nm_date <= ds.to; }).map(function(n){ return [ fmtDate(n.nm_date), n.location || '—', n.prevented_by || '—', n.single_worker_capacity ? 'Yes, as recorded' : 'Not recorded as such' ]; }))
  ] : [ rpEmpty('No near misses recorded') ]));
  var st = sumState().statements || {};
  doc.appendChild(rpSec(3, 'Funding context (as stated, with source)', 'Allocation, remaining balance, delivered, claimed and provider-funded amounts are separate. A shortfall is shown only when allocation, period and claimed are all present and verified. Worker pay rates are never used as NDIS claim rates.', [
    el('div', { 'class': 'grid2' }, ['funding_allocation|Plan allocation for this support (with document and date)', 'funding_remaining|Remaining balance (with statement date)', 'funding_delivered|Support delivered in the period (hours)', 'funding_claimed|Claimed / invoiced in the period ($)', 'funding_provider|Support supplied at the provider’s cost (provider statement)', 'funding_period|Period these figures relate to'].map(function(kv){
      var k = kv.split('|')[0], l = kv.split('|')[1];
      return el('div', { 'class': 'field' }, [ el('label', { 'for': 'sum-' + k }, l), el('input', { 'class': 'inp', id: 'sum-' + k, value: st[k] || '', oninput: function(e){ st[k] = e.target.value; sumState().statements = st; } }) ]);
    })),
    el('button', { 'class': 'btn btn-sm btn-pri', onclick: sumSaveStatements }, 'Save to the draft')
  ]));
}

/* ---------- Sources and checks ---------- */
function sumSources(doc, ds, c){
  var S = sumState(), D = S.data;
  var canEv = S.evidenceTables !== false;
  doc.appendChild(rpSec(1, 'In-app records in this period', 'Counted directly. Open any record from its own tab.', [
    rpTable([ 'Record type', { t: 'Count', n: true }, 'Used for' ], [
      [ 'Shifts (rostered)', { t: String(D.shifts.length), n: true }, 'coverage denominators' ], [ 'Shift notes (Progress Notes)', { t: String(D.notes.length), n: true }, 'coverage; narrative source for reviewed observations' ],
      [ 'Incident reports', { t: String(D.incidents.length), n: true }, 'falls, emergencies, injuries, chronology' ], [ 'Near misses', { t: String(D.nearMisses.length), n: true }, 'prevention, one-worker capacity' ],
      [ 'Personal care logs', { t: String(D.careLogs.filter(function(l){ return D.shifts.some(function(s){ return s.id === l.shift_id; }); }).length), n: true }, 'daytime load' ], [ 'Overnight summaries', { t: String(D.overnightLogs.filter(function(l){ return D.shifts.some(function(s){ return s.id === l.shift_id; }); }).length), n: true }, 'overnight hours' ]
    ])
  ]));
  /* uploads */
  var ups = (D.sources || []).slice().sort(function(a, b){ return (a.event_from || '') < (b.event_from || '') ? 1 : -1; });
  doc.appendChild(rpSec(2, 'Uploaded and pasted sources', canEv ? 'Originals are stored unchanged under the participant’s evidence folder (admin-only). Duplicate files are detected by content hash. Text is extracted locally in the browser; scanned documents are marked as needing OCR or manual entry — no text is invented.' : 'Needs migration 002.', [
    canEv ? el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px' }, [
      el('button', { 'class': 'btn btn-sm btn-pri', onclick: function(){ sumImportModal('file'); } }, [svgIcon(IC.plus), 'Import a document']),
      el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ sumImportModal('text'); } }, 'Paste text'),
      el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ sumImportModal('note'); } }, 'Review an in-app shift note'),
      el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ sumObsModal(null); } }, 'Add an observation by hand')
    ]) : null,
    ups.length ? rpTable([ 'Title', 'Kind', 'Dates it is about', 'Author', 'Text', 'Status', '' ], ups.map(function(s){
      return [ el('div', null, [ el('b', null, s.title || s.file_name || '(untitled)'), s.note ? el('div', { 'class': 't-cap' }, s.note) : null ]), sumSourceLabel(s.kind), (s.event_from ? fmtDate(s.event_from) : '—') + (s.event_to && s.event_to !== s.event_from ? ' – ' + fmtDate(s.event_to) : ''), s.author || '—',
        { t: s.extraction === 'text' ? 'extracted' : (s.extraction === 'needs_ocr' ? 'needs OCR / manual' : (s.extraction === 'manual' ? 'manual' : '—')), m: true },
        s.excluded ? sumBadge('excluded' + (s.excluded_reason ? ': ' + s.excluded_reason : ''), 'missing') : sumBadge('in use', 'done'),
        el('div', { 'class': 'row-actions' }, [
          s.file_path ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ storageSignedUrl(s.file_path).then(function(u){ window.open(u, '_blank'); })["catch"](function(){ toast('Could not open the file', true); }); } }, 'Open original') : null,
          s.text_content ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ sumReviewSource(s); } }, 'Review text') : null,
          el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ sumToggleExclude(s); } }, s.excluded ? 'Include' : 'Exclude…')
        ]) ];
    })) : rpEmpty('No uploaded or pasted sources for this participant', canEv ? 'Import clinical reports, older shift notes or paper sleep logs here. They are kept as originals and reviewed before anything is counted.' : '')
  ], 'rp-sec-long'));
  /* observations review */
  var obsAll = (D.observations || []).filter(function(o){ return o.obs_date >= addDays(ds.from, -1) && o.obs_date <= addDays(ds.to, 1); });
  var counts = { proposed: 0, accepted: 0, rejected: 0 }; obsAll.forEach(function(o){ counts[o.status] = (counts[o.status] || 0) + 1; });
  var list = obsAll.filter(function(o){ return S.obsFilter === 'all' || o.status === S.obsFilter; }).sort(function(a, b){ return a.obs_date === b.obs_date ? ((a.start_time || '') < (b.start_time || '') ? -1 : 1) : (a.obs_date < b.obs_date ? -1 : 1); });
  doc.appendChild(rpSec(3, 'Observation review', 'Each proposal shows the source text it came from. Accept it as stated, edit it, reject it, or link it as a duplicate of another observation. Only accepted, non-duplicate observations enter the figures. Review the meaning, not just the match.', [
    el('div', { 'class': 'seg', role: 'group', 'aria-label': 'Filter observations', style: 'margin-bottom:10px' }, [['proposed', 'To review (' + counts.proposed + ')'], ['accepted', 'Accepted (' + counts.accepted + ')'], ['rejected', 'Rejected (' + counts.rejected + ')'], ['all', 'All']].map(function(f){ return el('button', { 'class': S.obsFilter === f[0] ? 'on' : '', onclick: function(){ S.obsFilter = f[0]; render(); } }, f[1]); })),
    list.length ? el('div', { 'class': 'sum-obs-list' }, list.map(sumObsRow)) : rpEmpty(S.obsFilter === 'proposed' ? 'Nothing waiting for review' : 'No observations here', '')
  ], 'rp-sec-long'));
  /* checks */
  doc.appendChild(rpSec(4, 'Checks for a reviewer', 'Items a person must look at before finalising. Nothing here has been changed automatically.', ds.checks.length ? [
    rpTable([ 'Kind', 'Date', 'Detail' ], ds.checks.map(function(k){ return [ sumBadge(k.kind, k.kind === 'unreviewed' ? 'missing' : 'na'), k.date ? fmtDate(k.date) : '—', k.detail ]; }))
  ] : [ rpEmpty('No checks outstanding') ]));
  /* versions */
  doc.appendChild(rpSec(5, 'Report versions', 'A draft can be re-saved. Finalising freezes the dataset, the included sources and observations, the reviewer and the time; later uploads cannot change it.', [
    el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px' }, [
      el('button', { 'class': 'btn btn-sm btn-sec', onclick: sumSaveStatements }, 'Save draft'),
      el('button', { 'class': 'btn btn-sm btn-pri', disabled: !canEv, onclick: sumFinalise }, 'Finalise this report…'),
      S.frozen ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ S.frozen = null; sumCompute(); render(); } }, 'Back to live data') : null
    ]),
    S.versions.length ? rpTable([ 'Created', 'Status', 'Period', 'Reviewer', 'Version', '' ], S.versions.map(function(v){
      return [ fmtDT(v.created_at), v.status === 'final' ? sumBadge('final', 'done') : sumBadge('draft', 'na'), fmtDate(v.period_from) + ' – ' + fmtDate(v.period_to), v.reviewer || '—', v.calc_version, el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ if (v.snapshot && v.snapshot.dataset) { S.frozen = v; S.ds = v.snapshot.dataset; S.statements = v.snapshot.statements || S.statements; state.adminTab = 'sumdoc'; render(); } else toast('This version has no stored dataset', true); } }, 'Open') ];
    })) : el('div', { 'class': 'notice' }, 'No versions yet.')
  ]));
  doc.appendChild(rpSec(6, 'Demonstration mode', 'Loads clearly labelled synthetic sources, observations and a version so the review screens and the sample report can be seen without real data. Nothing is saved.', [
    el('button', { 'class': 'btn btn-sm ' + (S.demo ? 'btn-dark' : 'btn-sec'), onclick: function(){ S.demo = !S.demo; S.data = null; sumLoad(true); } }, S.demo ? 'Turn demonstration mode off' : 'Turn demonstration mode on')
  ]));
}
function sumObsRow(o){
  var src = (sumState().data.sources || []).find(function(s){ return s.id === o.source_id; });
  return el('div', { 'class': 'sum-obs ' + o.status }, [
    el('div', { 'class': 'sum-obs-h' }, [
      el('b', null, fmtDate(o.obs_date) + (o.start_time ? ' · ' + fmtTime(o.start_time) + (o.end_time ? '–' + fmtTime(o.end_time) : '') : '') + (o.timing === 'estimated' ? ' (approx.)' : o.timing === 'interval' ? ' (15-min block)' : '')),
      sumBadge(o.category.replace(/_/g, ' '), 'na'), sumBadge(o.status, o.status === 'accepted' ? 'done' : (o.status === 'proposed' ? 'missing' : 'na')),
      o.duplicate_of ? sumBadge('duplicate — not counted', 'na') : null
    ]),
    el('div', null, [ el('b', null, o.assist_type || '(type not set)'), o.reason ? ' — ' + o.reason : '', o.workers_involved != null ? ' · ' + o.workers_involved + ' worker' + (o.workers_involved === 1 ? '' : 's') : '', o.outcome ? ' · ' + o.outcome : '' ]),
    el('div', { 'class': 'sum-quote' }, (src ? (src.title || src.file_name || sumSourceLabel(src.kind)) + ': ' : '') + (o.source_ref || 'no source reference')),
    o.review_note ? el('div', { 'class': 't-cap' }, 'Reviewer: ' + o.review_note + (o.reviewer ? ' — ' + o.reviewer : '')) : null,
    el('div', { 'class': 'row-actions', style: 'justify-content:flex-start;margin-top:6px' }, [
      o.status !== 'accepted' ? el('button', { 'class': 'btn btn-sm btn-pri', onclick: function(){ sumSetObs(o, { status: 'accepted' }); } }, 'Accept as stated') : null,
      el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ sumObsModal(o); } }, 'Edit'),
      o.status !== 'rejected' ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ var why = prompt('Why is this rejected? (kept for the audit trail)'); if (why === null) return; sumSetObs(o, { status: 'rejected', review_note: why }); } }, 'Reject') : null,
      !o.duplicate_of ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ sumMarkDuplicate(o); } }, 'Duplicate of…') : el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ sumSetObs(o, { duplicate_of: null }); } }, 'Unlink duplicate')
    ])
  ]);
}
function sumReviewer(){ var r = localStorage.getItem('ac_reviewer_name'); if (!r) { r = prompt('Your name, for the review audit trail:'); if (r) localStorage.setItem('ac_reviewer_name', r); } return r || 'Office'; }
function sumSetObs(o, patch){
  var S = sumState(); patch.reviewer = sumReviewer(); patch.reviewed_at = new Date().toISOString(); patch.updated_at = patch.reviewed_at;
  if (S.demo) { Object.keys(patch).forEach(function(k){ o[k] = patch[k]; }); sumCompute(); render(); return Promise.resolve(); }
  return sbUpd('ac_evidence_observations', 'id=eq.' + o.id, patch).then(function(){ Object.keys(patch).forEach(function(k){ o[k] = patch[k]; }); sumCompute(); render(); })["catch"](function(e){ toast(e.message, true); });
}
function sumMarkDuplicate(o){
  var S = sumState();
  var others = (S.data.observations || []).filter(function(x){ return x.id !== o.id && x.obs_date === o.obs_date && !x.duplicate_of; });
  var chron = S.ds.chronology.filter(function(e){ return e.date === o.obs_date; });
  if (!others.length && !chron.length) { toast('No other record on ' + fmtDate(o.obs_date) + ' to link to', true); return; }
  var sel = el('select', { 'class': 'sel' }, [el('option', { value: '' }, 'Choose the record this repeats…')]
    .concat(chron.map(function(e){ return el('option', { value: 'rec:' + e.id }, (e.kind === 'incident' ? 'Incident report' : 'Near miss') + ' ' + (e.time ? fmtTime(e.time) : '') + ' — ' + e.types); }))
    .concat(others.map(function(x){ return el('option', { value: x.id }, 'Observation ' + (x.start_time ? fmtTime(x.start_time) : '') + ' — ' + (x.assist_type || x.category)); })));
  var m = el('div', { 'class': 'modal', style: 'max-width:460px' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', { 'class': 't-title' }, 'Link as a duplicate'), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'modal-body' }, [ el('p', { 'class': 't-mut', style: 'font-size:14px;margin-bottom:10px' }, 'The same event told twice counts once. Linking keeps this observation for the audit trail but removes it from every figure.'), el('div', { 'class': 'field' }, [ el('label', null, 'This repeats'), sel ]) ]),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'), el('button', { 'class': 'btn btn-pri', onclick: function(){
      if (!sel.value) return; var v = sel.value;
      /* a structured record has no observation id; mark self-duplicate with the record reference in the note */
      var patch = v.indexOf('rec:') === 0 ? { duplicate_of: o.id, review_note: 'Duplicate of structured record ' + v.slice(4) } : { duplicate_of: v };
      closeModal(); sumSetObs(o, patch);
    } }, 'Link') ])
  ]);
  openModal(m);
}
function sumToggleExclude(s){
  var S = sumState();
  var patch = s.excluded ? { excluded: false, excluded_reason: null } : (function(){ var why = prompt('Why exclude this source? (e.g. training sample, generated example, wrong participant)'); return why === null ? null : { excluded: true, excluded_reason: why }; })();
  if (!patch) return;
  if (S.demo) { Object.keys(patch).forEach(function(k){ s[k] = patch[k]; }); sumCompute(); render(); return; }
  sbUpd('ac_evidence_sources', 'id=eq.' + s.id, patch).then(function(){ Object.keys(patch).forEach(function(k){ s[k] = patch[k]; }); sumCompute(); render(); })["catch"](function(e){ toast(e.message, true); });
}

/* ---------- observation editor ---------- */
var SUM_CATS = [['overnight_assist', 'Overnight: direct worker assistance'], ['overnight_supervision', 'Overnight: necessary supervision (record the reason)'], ['overnight_awake_no_assist', 'Overnight: awake, no assistance needed'], ['daytime_task', 'Daytime task / activity'], ['incident', 'Incident (fall, injury, emergency)'], ['near_miss', 'Near miss'], ['other', 'Other']];
function sumObsModal(o){
  var S = sumState(), c = sumClient(), isNew = !o;
  var f = { obs_date: o ? o.obs_date : S.to, start_time: o ? (o.start_time || '') : '', end_time: o ? (o.end_time || '') : '', timing: o ? o.timing : 'estimated', category: o ? o.category : 'overnight_assist', assist_type: o ? (o.assist_type || '') : '', reason: o ? (o.reason || '') : '', outcome: o ? (o.outcome || '') : '', workers_involved: o && o.workers_involved != null ? String(o.workers_involved) : '', source_id: o ? (o.source_id || '') : '', source_ref: o ? (o.source_ref || '') : '', review_note: o ? (o.review_note || '') : '' };
  function fld(label, key, type, opts){ return el('div', { 'class': 'field' }, [ el('label', null, label), el('input', { 'class': 'inp', type: type || 'text', value: f[key], oninput: function(e){ f[key] = e.target.value; }, onchange: function(e){ f[key] = e.target.value; } }) ]); }
  var srcSel = el('select', { 'class': 'sel', onchange: function(e){ f.source_id = e.target.value; } }, [el('option', { value: '' }, 'No source (state it in the reference)')].concat((S.data.sources || []).map(function(s){ return el('option', { value: s.id, selected: f.source_id === s.id }, (s.title || s.file_name || sumSourceLabel(s.kind))); })));
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', { 'class': 't-title' }, isNew ? 'Add an observation' : 'Edit observation'), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 'q-help' }, 'Record only what the source says. If the time is not stated, leave it blank rather than guessing. Every observation needs a source reference a reader could check.'),
      el('div', { 'class': 'grid2' }, [ fld('Date the event started', 'obs_date', 'date'), el('div', { 'class': 'field' }, [ el('label', null, 'Timing basis'), el('select', { 'class': 'sel', onchange: function(e){ f.timing = e.target.value; } }, [['exact', 'Exact (stated)'], ['estimated', 'Estimated ("about", "around")'], ['interval', '15-minute block (sleep log)']].map(function(t){ return el('option', { value: t[0], selected: f.timing === t[0] }, t[1]); })) ]) ]),
      el('div', { 'class': 'grid2' }, [ fld('Start time', 'start_time', 'time'), fld('End time (if stated)', 'end_time', 'time') ]),
      el('div', { 'class': 'field' }, [ el('label', null, 'Category'), el('select', { 'class': 'sel', onchange: function(e){ f.category = e.target.value; } }, SUM_CATS.map(function(t){ return el('option', { value: t[0], selected: f.category === t[0] }, t[1]); })) ]),
      el('div', { 'class': 'grid2' }, [ fld('Type of assistance / task', 'assist_type'), fld('Workers actually involved (number)', 'workers_involved', 'number') ]),
      fld('Reason assistance was needed (as recorded)', 'reason'), fld('Outcome (as recorded)', 'outcome'),
      el('div', { 'class': 'field' }, [ el('label', null, 'Source document'), srcSel ]),
      el('div', { 'class': 'field' }, [ el('label', null, 'Source reference (page, section or quoted text)'), el('textarea', { 'class': 'ta', rows: '2', oninput: function(e){ f.source_ref = e.target.value; } }, f.source_ref) ]),
      el('div', { 'class': 'field' }, [ el('label', null, 'Reviewer note'), el('input', { 'class': 'inp', value: f.review_note, oninput: function(e){ f.review_note = e.target.value; } }) ])
    ]),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'), el('button', { 'class': 'btn btn-pri', onclick: function(e){
      if (!f.obs_date) { toast('Enter the date.', true); return; }
      if (!f.source_ref.trim()) { toast('Give a source reference a reader could check.', true); return; }
      var rec = { obs_date: f.obs_date, start_time: f.start_time || null, end_time: f.end_time || null, timing: f.timing, category: f.category, assist_type: f.assist_type, reason: f.reason, outcome: f.outcome, workers_involved: f.workers_involved === '' ? null : parseInt(f.workers_involved, 10), source_id: f.source_id || null, source_ref: f.source_ref, review_note: f.review_note, status: 'accepted', reviewer: sumReviewer(), reviewed_at: new Date().toISOString() };
      busyBtn(e.currentTarget, true);
      if (S.demo) { if (isNew) { rec.id = 'demo-' + randId(); rec.participant_id = c.id; S.data.observations.push(rec); } else Object.keys(rec).forEach(function(k){ o[k] = rec[k]; }); closeModal(); sumCompute(); render(); return; }
      var p = isNew ? sbIns('ac_evidence_observations', [Object.assign({ participant_id: c.id, created_by: state.auth && state.auth.workerId || null }, rec)]) : sbUpd('ac_evidence_observations', 'id=eq.' + o.id, Object.assign({ updated_at: rec.reviewed_at }, rec));
      p.then(function(){ closeModal(); toast(isNew ? 'Observation added (accepted)' : 'Observation updated'); sumLoad(true); })["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
    } }, isNew ? 'Add as accepted' : 'Save') ])
  ]);
  openModal(m, { noDismiss: true });
}

/* ---------- import: file / pasted text / in-app note ---------- */
function loadScript(src){ return new Promise(function(res, rej){ if (document.querySelector('script[src="' + src + '"]')) return res(); var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function(){ rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); }); }
function sumSha256(buf){ return crypto.subtle.digest('SHA-256', buf).then(function(h){ return Array.prototype.map.call(new Uint8Array(h), function(b){ return ('0' + b.toString(16)).slice(-2); }).join(''); }); }
function sumExtractText(file, buf){
  var t = file.type || '';
  if (/^text\//.test(t) || /\.(txt|md|csv)$/i.test(file.name)) return Promise.resolve({ text: new TextDecoder().decode(buf), extraction: 'text' });
  if (t === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    return loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js').then(function(){
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      return window.pdfjsLib.getDocument({ data: buf }).promise.then(function(pdf){
        var chain = Promise.resolve(''), pages = [];
        for (var i = 1; i <= pdf.numPages; i++) (function(i){ chain = chain.then(function(acc){ return pdf.getPage(i).then(function(pg){ return pg.getTextContent(); }).then(function(tc){ var s = tc.items.map(function(it){ return it.str; }).join(' '); pages.push('[Page ' + i + '] ' + s); return acc; }); }); })(i);
        return chain.then(function(){ var text = pages.join('\n\n'); var words = text.replace(/\[Page \d+\]/g, '').trim(); return words.length < 40 ? { text: null, extraction: 'needs_ocr' } : { text: text, extraction: 'text' }; });
      });
    });
  }
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
  var S = sumState(), c = sumClient();
  var f = { title: '', author: '', event_from: S.to, event_to: '', note: '', text: '', noteId: '' }, file = null;
  var fileIn = el('input', { type: 'file', accept: '.pdf,.docx,.txt,.md,.csv,image/*', 'aria-label': 'Choose a document', onchange: function(e){ file = e.target.files[0] || null; if (file && !f.title) { f.title = file.name; titleIn.value = file.name; } } });
  var titleIn = el('input', { 'class': 'inp', value: f.title, oninput: function(e){ f.title = e.target.value; } });
  var noteSel = el('select', { 'class': 'sel', onchange: function(e){ f.noteId = e.target.value; } }, [el('option', { value: '' }, 'Choose a shift note…')].concat((S.data.notes || []).slice().sort(function(a, b){ var sa = S.data.shifts.find(function(s){ return s.id === a.shift_id; }) || {}, sb = S.data.shifts.find(function(s){ return s.id === b.shift_id; }) || {}; return (sa.date || '') < (sb.date || '') ? 1 : -1; }).map(function(n){ var s = S.data.shifts.find(function(x){ return x.id === n.shift_id; }) || {}; return el('option', { value: n.id }, (s.date ? fmtDate(s.date) + (s.type === 'sleepover' ? ' (night)' : ' (day)') : '?') + ' · ' + n.note_type); })));
  var prog = el('div', { 'class': 'notice', style: 'display:none', role: 'status' });
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', { 'class': 't-title' }, mode === 'file' ? 'Import a document' : (mode === 'text' ? 'Paste text' : 'Review an in-app shift note')), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 'q-help' }, mode === 'file' ? 'The original file is stored unchanged. Text is extracted in your browser (PDF, Word, plain text). Photos and scans are stored but marked as needing OCR or manual entry. Time-anchored sentences become proposals for you to review — nothing is counted until accepted.' : (mode === 'text' ? 'For notes that are not in the app (older WhatsApp notes, typed-up paper logs). Say who wrote it and which date it is about.' : 'Finds time-anchored sentences in the note and proposes observations. The note itself is never changed.')),
      mode === 'file' ? el('div', { 'class': 'field' }, [ el('label', null, 'Document'), fileIn ]) : null,
      mode === 'note' ? el('div', { 'class': 'field' }, [ el('label', null, 'Shift note'), noteSel ]) : null,
      mode === 'text' ? el('div', { 'class': 'field' }, [ el('label', null, 'Text'), el('textarea', { 'class': 'ta', rows: '8', oninput: function(e){ f.text = e.target.value; } }) ]) : null,
      mode !== 'note' ? el('div', { 'class': 'field' }, [ el('label', null, 'Title'), titleIn ]) : null,
      mode !== 'note' ? el('div', { 'class': 'grid2' }, [ el('div', { 'class': 'field' }, [ el('label', null, 'Original author (as stated)'), el('input', { 'class': 'inp', oninput: function(e){ f.author = e.target.value; } }) ]), el('div', { 'class': 'field' }, [ el('label', null, 'Note'), el('input', { 'class': 'inp', placeholder: 'e.g. OT manual-handling report', oninput: function(e){ f.note = e.target.value; } }) ]) ]) : null,
      mode !== 'note' ? el('div', { 'class': 'grid2' }, [ el('div', { 'class': 'field' }, [ el('label', null, 'Date it is about (start)'), el('input', { 'class': 'inp', type: 'date', value: f.event_from, onchange: function(e){ f.event_from = e.target.value; } }) ]), el('div', { 'class': 'field' }, [ el('label', null, 'To (if a range)'), el('input', { 'class': 'inp', type: 'date', onchange: function(e){ f.event_to = e.target.value; } }) ]) ]) : null,
      prog
    ]),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'), el('button', { 'class': 'btn btn-pri', onclick: function(e){
      var btn = e.currentTarget; function say(t){ prog.style.display = ''; prog.textContent = t; }
      if (mode === 'file' && !file) { toast('Choose a document.', true); return; }
      if (mode === 'text' && !f.text.trim()) { toast('Paste some text.', true); return; }
      if (mode === 'note' && !f.noteId) { toast('Choose a note.', true); return; }
      if (mode !== 'note' && !f.event_from) { toast('Say which date the document is about.', true); return; }
      busyBtn(btn, true);
      var src, text, extraction, sha, buf;
      var prep = mode === 'file' ? file.arrayBuffer().then(function(b){ buf = b; say('Checking for duplicates…'); return sumSha256(b); }).then(function(h){ sha = h;
          if ((S.data.sources || []).some(function(s){ return s.sha256 === h; })) throw new Error('This exact file is already imported for ' + c.name + '.');
          say('Extracting text…'); return sumExtractText(file, buf); }).then(function(r){ text = r.text; extraction = r.extraction; })
        : mode === 'text' ? sumSha256(new TextEncoder().encode(f.text)).then(function(h){ sha = h; text = f.text; extraction = 'text'; if ((S.data.sources || []).some(function(s){ return s.sha256 === h; })) throw new Error('This exact text is already imported.'); })
        : Promise.resolve().then(function(){ var n = S.data.notes.find(function(x){ return x.id === f.noteId; }); var s = S.data.shifts.find(function(x){ return x.id === n.shift_id; }); text = n.body; extraction = 'text'; f.title = 'Shift note ' + (s ? fmtDate(s.date) : ''); f.event_from = s ? s.date : S.to; f.author = (workerById(n.worker_id) || {}).name || ''; sha = null; });
      prep.then(function(){
        if (mode === 'file' && !S.demo) { say('Storing the original…'); return storageUpload('evidence/' + c.id + '/' + sha.slice(0, 12) + '_' + sanitizeName(file.name), file); }
        return null;
      }).then(function(path){
        src = { participant_id: c.id, kind: mode === 'note' ? 'note' : 'upload', ref_id: mode === 'note' ? f.noteId : null, file_path: path, file_name: file ? file.name : null, mime: file ? file.type : (mode === 'text' ? 'text/plain' : null), size_bytes: file ? file.size : null, sha256: sha, event_from: f.event_from || null, event_to: f.event_to || null, author: f.author || null, title: f.title || null, note: f.note || null, text_content: text, extraction: extraction, uploaded_by: state.auth && state.auth.workerId || null };
        if (mode === 'note' && (S.data.sources || []).some(function(s){ return s.kind === 'note' && s.ref_id === f.noteId; })) throw new Error('This note has already been reviewed. Find its proposals under Observation review.');
        say('Saving the source…');
        if (S.demo) { src.id = 'demo-' + randId(); src.created_at = new Date().toISOString(); S.data.sources.push(src); return [src]; }
        return sbIns('ac_evidence_sources', [src]);
      }).then(function(rows){
        var saved = rows[0];
        var cands = text ? evFindCandidates(text, f.event_from) : [];
        cands.forEach(function(x){ x.participant_id = c.id; x.source_id = saved.id; x.created_by = state.auth && state.auth.workerId || null; });
        say(cands.length ? 'Saving ' + cands.length + ' proposal' + (cands.length === 1 ? '' : 's') + ' for review…' : 'No time-anchored sentences found; add observations by hand.');
        if (S.demo) { cands.forEach(function(x){ x.id = 'demo-' + randId(); x.status = 'proposed'; S.data.observations.push(x); }); return cands.length; }
        return cands.length ? sbIns('ac_evidence_observations', cands).then(function(){ return cands.length; }) : 0;
      }).then(function(n){
        closeModal(); S.obsFilter = 'proposed'; S.view = 'sources';
        toast(extraction === 'needs_ocr' ? 'Stored. No machine-readable text — enter observations by hand from the original.' : (n ? n + ' proposal' + (n === 1 ? '' : 's') + ' ready for review' : 'Source stored; nothing to propose'));
        if (S.demo) { sumCompute(); render(); } else sumLoad(true);
      })["catch"](function(err){ busyBtn(btn, false); say(''); prog.style.display = 'none'; toast(err.message, true); });
    } }, 'Import') ])
  ]);
  openModal(m, { noDismiss: true });
}
function sumReviewSource(s){
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', null, [ el('div', { 'class': 't-title' }, s.title || s.file_name || 'Source'), el('div', { 'class': 't-cap' }, (s.author ? 'Author as stated: ' + s.author + ' · ' : '') + (s.event_from ? 'about ' + fmtDate(s.event_from) : '')) ]), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'modal-body' }, [ el('div', { 'class': 'q-help' }, 'Extracted text, shown unchanged. Proposals were made from the sentences with a clock time; add anything else by hand.'), el('pre', { 'class': 'sum-pre' }, s.text_content || '') ]),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-sec', onclick: function(){ closeModal(); sumObsModal(null); } }, 'Add an observation from this'), el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Close') ])
  ]);
  openModal(m);
}

/* ---------- finalise ---------- */
function sumFinalise(){
  var S = sumState(), c = sumClient();
  if (S.ds.checks.some(function(k){ return k.kind === 'unreviewed'; }) && !confirm('There are proposals still awaiting review. They are excluded from the figures. Finalise anyway?')) return;
  var reviewer = prompt('Reviewer name (printed on the report):', localStorage.getItem('ac_reviewer_name') || ''); if (!reviewer) return;
  localStorage.setItem('ac_reviewer_name', reviewer);
  var obsIds = (S.data.observations || []).filter(function(o){ return o.status === 'accepted' && !o.duplicate_of; }).map(function(o){ return o.id; });
  var srcIds = (S.data.sources || []).filter(function(s){ return !s.excluded; }).map(function(s){ return s.id; });
  var row = { participant_id: c.id, period_from: S.from, period_to: S.to, status: 'final', calc_version: EV_CALC_VERSION + '+' + BUILD_V, snapshot: { statements: S.statements, dataset: S.ds, exported_at: new Date().toISOString(), tz: 'Australia/Melbourne' }, source_ids: srcIds, observation_ids: obsIds, reviewer: reviewer, finalised_at: new Date().toISOString(), created_by: state.auth && state.auth.workerId || null };
  if (S.demo) { row.id = 'demo-' + randId(); row.created_at = row.finalised_at; S.versions.unshift(row); toast('Demonstration: version finalised in memory'); render(); return; }
  sbIns('ac_report_versions', [row]).then(function(){ toast('Report finalised and frozen'); sumLoad(true); })["catch"](function(e){ toast(e.message, true); });
}

/* ---------- methodology ---------- */
function sumOpenMethod(){
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'modal-head' }, [ el('div', null, [ el('div', { 'class': 't-title' }, 'How the figures are built'), el('div', { 'class': 't-cap' }, 'Metric definitions ' + EV_CALC_VERSION + ' · EVIDENCE_METRICS.md') ]), el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x)) ]),
    el('div', { 'class': 'modal-body' }, EV_METHOD.map(function(r){ return el('div', { style: 'margin-bottom:12px' }, [ el('b', null, r[0]), el('div', { style: 'font-size:14px;color:var(--mut);line-height:1.5' }, r[1]) ]); })),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Close') ])
  ]);
  openModal(m);
}

/* ---------- the report document (screen + print) ---------- */
function viewSumDoc(main){
  var S = sumState(), c = sumClient(), ds = S.ds; if (!ds) { state.adminTab = 'reports'; render(); return; }
  var st = S.statements || {}, ver = S.frozen;
  main.appendChild(el('div', { 'class': 'rp-controls', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0 16px' }, [
    el('button', { 'class': 'btn btn-sec btn-sm', onclick: function(){ state.adminTab = 'reports'; render(); } }, [svgIcon(IC.left), 'Back to summary']),
    el('button', { 'class': 'btn btn-pri btn-sm', onclick: function(){ window.print(); } }, [svgIcon(IC.file), 'Print / save as PDF']),
    el('span', { 'class': 't-cap' }, ver ? 'Finalised version · reviewer ' + (ver.reviewer || '—') + ' · ' + fmtDT(ver.finalised_at || ver.created_at) : 'DRAFT — live data, not yet finalised')
  ]));
  var doc = el('div', { 'class': 'rp-doc sum-doc' }); main.appendChild(doc);
  var org = state.data.settings.org_name || 'Astar Health Service';
  var ident = org + ' · Support needs summary · ' + c.name + ' · ' + fmtDate(ds.from) + ' – ' + fmtDate(ds.to) + ' · ' + (ver ? 'Final' : 'Draft');
  doc.appendChild(el('div', { 'class': 'rp-mast' }, [
    el('div', { 'class': 'rp-eyebrow' }, org + ' · Support needs summary · ' + (ver ? 'FINAL' : 'DRAFT') + (S.demo ? ' · DEMONSTRATION DATA' : '')),
    el('h2', null, c.name),
    el('p', { 'class': 'rp-period' }, fmtDateFull(ds.from) + ' to ' + fmtDateFull(ds.to) + ' · ' + ds.coverage.periodDays + ' days · times in ' + ds.tz),
    el('div', { 'class': 'rp-meta' }, [
      el('div', null, [ el('div', { 'class': 'k' }, 'Prepared by'), el('div', { 'class': 'v' }, org) ]),
      el('div', null, [ el('div', { 'class': 'k' }, 'Status'), el('div', { 'class': 'v' }, ver ? 'Final · reviewed by ' + (ver.reviewer || '—') + ' on ' + fmtDateFull((ver.finalised_at || ver.created_at).slice(0, 10)) : 'Draft — subject to review') ]),
      el('div', null, [ el('div', { 'class': 'k' }, 'Calculation version'), el('div', { 'class': 'v' }, ver ? ver.calc_version : EV_CALC_VERSION + '+' + BUILD_V) ]),
      el('div', null, [ el('div', { 'class': 'k' }, 'Exported'), el('div', { 'class': 'v' }, fmtDateFull(todayYmd())) ])
    ])
  ]));
  var n = 0; function sec(t, lead, kids, cls){ return rpSec(++n, t, lead, kids, cls); }
  /* 1 context */
  doc.appendChild(sec('Participant, period and requested support', 'The request and the provider’s account are stated here as statements. They are not findings.', [
    rpTable([ '', '' ], [ [ 'Participant', c.name ], [ 'Reporting period', fmtDateFull(ds.from) + ' to ' + fmtDateFull(ds.to) ], [ 'Support requested', st.requested || 'Not stated' ], [ 'Provider reports', st.provider_reports || 'Not stated' ], [ 'Clinician recommendations on file', st.clinician || 'No assessment on file (evidence gap)' ] ])
  ]));
  /* 2 coverage + findings */
  doc.appendChild(sec('Evidence coverage and findings', 'What exists, and what it shows. Every figure is a count from a dated record with its denominator.', [
    el('div', { 'class': 'rp-grid' }, [ rpTile('Rostered shifts', String(ds.coverage.shiftsRostered), ds.coverage.daysWithShifts + ' days'), rpTile('Shift notes', sumPct(ds.coverage.shiftsWithNote, ds.coverage.shiftsRostered), ''), rpTile('Care logs', sumPct(ds.coverage.shiftsWithCareLog, ds.coverage.shiftsRostered), ''), rpTile('Overnight summaries', sumPct(ds.coverage.nightsWithSummary, ds.coverage.nightsRostered), ''), rpTile('Reviewed observations', String(ds.coverage.acceptedObservations), ds.coverage.uploads + ' uploaded sources') ]),
    el('ul', { 'class': 'sum-findings' }, sumFindings(ds).map(function(t){ return el('li', null, t); }))
  ]));
  /* 3 overnight */
  var o = ds.overnight;
  doc.appendChild(sec('Overnight evidence (11 pm to 7 am)', 'Direct worker assistance per rostered night. Nights without a record are shown as gaps. The 2-hour line is the active support included in the NDIS sleepover price; time above it is separately claimable. Crossing it is not an eligibility finding.', o.rostered ? [
    sumNightChart(o.rows), rpLegend([{ c: RP_C.acc, l: 'Direct assistance within 2 h' }, { c: RP_C.bad, l: 'Above 2 h' }]),
    el('div', { 'class': 'rp-mini' }, [ ['Nights rostered', String(o.rostered)], ['Documented', sumPct(o.documented, o.rostered)], ['Average asleep', sumH(o.avgAsleep)], ['Average direct assistance', sumH(o.avgActive)], ['Nights above 2 h', o.documented ? sumPct(o.nightsOver, o.documented) : '—'], ['Hours above 2 h', sumH(o.hoursOver)], ['Average bed / up', (o.avgBed ? fmtTime(o.avgBed) : '—') + ' / ' + (o.avgUp ? fmtTime(o.avgUp) : '—')] ].map(function(p){ return el('div', null, [ el('div', { 'class': 'k' }, p[0]), el('div', { 'class': 'v' }, p[1]) ]); })),
    o.timeline.length ? sumTimeline(o.timeline, o.rows) : el('p', { 'class': 't-cap' }, 'No reviewed time-of-night observations in this period.'),
    rpTable([ 'Night', 'Status', 'Bed', 'Up', { t: 'Wakes', n: true }, { t: 'Asleep', n: true }, { t: 'Assistance', n: true }, { t: 'Above 2 h', n: true } ], o.rows.map(function(r){ return [ sumFmtNight(r), r.status === 'documented' ? 'documented' : (r.status === 'partial' ? 'partial' : 'no record'), r.bed ? fmtTime(r.bed) : '—', r.up ? fmtTime(r.up) : '—', { t: sumN(r.wakes), n: true }, { t: r.asleep == null ? '—' : hrsFmt(r.asleep) + ' h', n: true }, { t: r.active == null ? '—' : hrsFmt(r.active) + ' h', n: true }, { t: r.over ? '+' + hrsFmt(r.over) + ' h' : (r.active == null ? '—' : '0'), n: true } ]; }))
  ] : [ rpEmpty('No sleepover shifts rostered in this period') ], 'rp-sec-long'));
  /* 4 daytime */
  var d = ds.daytime;
  doc.appendChild(sec('Daytime support and proposed additional staffing', 'Recorded load, and four facts kept apart: two workers actually assisted; one worker reported difficulty; a clinician recommended two; the provider requests two.', [
    d.careLogs ? rpTable([ 'Measure', { t: 'Total', n: true }, { t: 'Recorded', n: true }, { t: 'Per day', n: true } ], d.measures.map(function(m){ return [ m.label, { t: String(m.total), n: true }, { t: m.recorded + ' of ' + m.of, n: true }, { t: m.perDay == null ? '—' : hrsFmt(m.perDay), n: true } ]; })) : el('p', { 'class': 't-cap' }, 'No personal care logs in this period.'),
    el('div', { 'class': 'rp-grid', style: 'margin-top:10px' }, [ rpTile('Two workers actually assisted', String(d.twoWorkersActual), 'recorded events'), rpTile('One worker reported difficulty', String(d.difficultyReported), 'recorded events'), rpTile('Clinician recommended two', st.clinician ? 'Yes — see section 1' : 'No assessment on file', ''), rpTile('Provider requests two', st.requested ? 'Yes — see section 1' : 'Not stated', '') ]),
    d.tasks.length ? rpTable([ 'Date', 'Time', 'Task', 'Assistance observed', { t: 'Workers', n: true }, 'Outcome', 'Source' ], d.tasks.map(function(t){ return [ fmtDate(t.date), t.time ? fmtTime(t.time) + (t.timing === 'estimated' ? ' (approx.)' : '') : '—', t.task, t.assistance, { t: sumN(t.workers), n: true }, t.outcome, { t: t.sourceRef, m: true } ]; })) : el('p', { 'class': 't-cap', style: 'margin-top:8px' }, 'No reviewed daytime task observations.'),
    st.proposed_staffing ? el('div', { style: 'margin-top:10px' }, [ rpSub('Proposed staffing (provider statement)'), el('p', null, st.proposed_staffing) ]) : null
  ], 'rp-sec-long'));
  /* 5 incidents */
  doc.appendChild(sec('Incidents, responses and outcomes', 'Chronology of structured records. Time on the floor is not time waiting for help; missing information is not “no”.', ds.chronology.length ? [
    rpTable([ 'Date', 'Time', 'Type', 'Where', 'Response', 'Outcome', 'Emergency', 'Injury' ], ds.chronology.map(function(e){ return [ fmtDate(e.date), e.time ? fmtTime(e.time) : '—', e.types + (e.fall ? ' · fall' : '') + (e.secondPerson ? ' · 2nd person to get up' : '') + (e.minutesOnFloor != null ? ' · ' + e.minutesOnFloor + ' min on floor' : ''), e.location || '—', e.response || '—', e.outcome || '—', e.emergency || '—', e.injuries ]; }))
  ] : [ rpEmpty('No incident reports or near misses in this period') ], 'rp-sec-long'));
  /* 6 schedule + gaps */
  var gaps = ds.checks.slice();
  if (o.missing) gaps.unshift({ kind: 'missing records', date: '', detail: o.missing + ' rostered night' + (o.missing === 1 ? '' : 's') + ' without an overnight summary.' });
  if (ds.coverage.shiftsRostered - ds.coverage.shiftsWithNote) gaps.unshift({ kind: 'missing records', date: '', detail: (ds.coverage.shiftsRostered - ds.coverage.shiftsWithNote) + ' rostered shift' + (ds.coverage.shiftsRostered - ds.coverage.shiftsWithNote === 1 ? '' : 's') + ' without a shift note.' });
  if (!st.clinician) gaps.unshift({ kind: 'evidence gap', date: '', detail: 'No clinician assessment on file for the requested support.' });
  doc.appendChild(sec('Proposed support schedule and evidence gaps', 'The proposed schedule is the provider’s statement. Gaps are listed so the reader knows what is missing, not to suggest anything about the support delivered.', [
    el('p', null, st.proposed_staffing || st.requested || 'No proposed schedule stated.'),
    st.funding_allocation || st.funding_claimed || st.funding_provider ? rpTable([ 'Funding item', 'As stated (with source)' ], [ ['Plan allocation', st.funding_allocation || '—'], ['Remaining balance', st.funding_remaining || '—'], ['Delivered in period', st.funding_delivered || '—'], ['Claimed in period', st.funding_claimed || '—'], ['Supplied at provider’s cost', st.funding_provider || '—'], ['Period', st.funding_period || '—'] ]) : null,
    rpTable([ 'Gap / check', 'Date', 'Detail' ], gaps.map(function(g){ return [ g.kind, g.date ? fmtDate(g.date) : '—', g.detail ]; })),
    st.unknown ? el('p', { style: 'margin-top:8px' }, st.unknown) : null
  ], 'rp-sec-long'));
  /* 7 method + source index */
  var srcs = (S.data && S.data.sources || []).filter(function(s){ return !s.excluded; });
  doc.appendChild(sec('Methodology, reviewer and source index', 'Definitions ' + EV_CALC_VERSION + '. Full records are available on request from the provider.', [
    rpTable([ 'Rule', 'Definition' ], ds.method.map(function(r){ return [ r[0], r[1] ]; })),
    el('p', { style: 'margin-top:10px' }, (ver ? 'Reviewed and finalised by ' + (ver.reviewer || '—') + ' on ' + fmtDT(ver.finalised_at || ver.created_at) + '. ' : 'This is a draft that has not been reviewed or finalised. ') + 'This document is a reviewed evidence summary prepared by the provider. It does not conclude that any funding must be approved, does not predict any tribunal outcome and is not legal advice.'),
    srcs.length ? el('div', null, [ rpSub('Source index'), rpTable([ '#', 'Source', 'Kind', 'About', 'Author' ], srcs.map(function(s, i){ return [ 'S' + (i + 1), s.title || s.file_name || '—', sumSourceLabel(s.kind), s.event_from ? fmtDate(s.event_from) + (s.event_to && s.event_to !== s.event_from ? ' – ' + fmtDate(s.event_to) : '') : '—', s.author || '—' ]; })) ]) : null
  ], 'rp-sec-long'));
  doc.appendChild(el('div', { 'class': 'rp-foot' }, [ el('span', null, ident), el('span', { 'class': 'rp-pageno' }, '') ]));
}

/* ---------- demonstration data (synthetic, in memory, clearly labelled) ---------- */
function sumDemoData(c, from, to){
  var s1 = { id: 'demo-src-1', participant_id: c.id, kind: 'upload', title: 'DEMO — Occupational therapy manual-handling report (synthetic)', author: 'A. Example, OT (synthetic)', event_from: from, mime: 'application/pdf', extraction: 'text', excluded: false, created_at: new Date().toISOString(), text_content: 'DEMONSTRATION DOCUMENT. This is synthetic text. At about 10:30am the participant was transferred from the shower chair with two workers assisting. At 2:15pm the participant slipped during a couch to wheelchair transfer and was steadied by the worker.' };
  var s2 = { id: 'demo-src-2', participant_id: c.id, kind: 'upload', title: 'DEMO — Training sample note (excluded)', author: 'Generated example', event_from: from, mime: 'text/plain', extraction: 'text', excluded: true, excluded_reason: 'training sample', created_at: new Date().toISOString(), text_content: 'Generated example — excluded from calculations.' };
  var s3 = { id: 'demo-src-3', participant_id: c.id, kind: 'upload', title: 'DEMO — Photo of paper sleep log (scan)', author: 'Support worker (synthetic)', event_from: addDays(from, 3), mime: 'image/jpeg', extraction: 'needs_ocr', excluded: false, created_at: new Date().toISOString(), text_content: null };
  var d1 = addDays(from, 1), d2 = addDays(from, 2);
  var obs = [
    { id: 'demo-o1', participant_id: c.id, source_id: s1.id, obs_date: d1, start_time: '10:30', timing: 'estimated', category: 'daytime_task', assist_type: 'Shower chair transfer', reason: 'Limited weight-bearing (as recorded)', outcome: 'Completed with two workers', workers_involved: 2, status: 'accepted', source_ref: 'Sentence 3: “At about 10:30am the participant was transferred…”', reviewer: 'Demo reviewer', reviewed_at: new Date().toISOString() },
    { id: 'demo-o2', participant_id: c.id, source_id: s1.id, obs_date: d1, start_time: '14:15', timing: 'exact', category: 'near_miss', assist_type: 'near miss', reason: '', outcome: '', workers_involved: 1, status: 'proposed', source_ref: 'Sentence 4: “At 2:15pm the participant slipped…”' },
    { id: 'demo-o3', participant_id: c.id, source_id: s1.id, obs_date: addDays(d2, 1), start_time: '01:00', end_time: '01:15', timing: 'estimated', category: 'overnight_assist', assist_type: 'Resettled after waking', reason: 'Asked for a drink (as recorded)', workers_involved: 1, status: 'accepted', source_ref: 'DEMO narrative: “woke at about 1:00am…”', reviewer: 'Demo reviewer', reviewed_at: new Date().toISOString() },
    { id: 'demo-o4', participant_id: c.id, source_id: s1.id, obs_date: addDays(d2, 1), start_time: '03:30', end_time: '04:20', timing: 'estimated', category: 'overnight_assist', assist_type: 'Continence care and change', reason: 'Found wet (as recorded)', workers_involved: 1, status: 'accepted', source_ref: 'DEMO narrative: “woke at about 3:30am wet…”', reviewer: 'Demo reviewer', reviewed_at: new Date().toISOString() },
    { id: 'demo-o5', participant_id: c.id, source_id: s1.id, obs_date: addDays(d2, 1), start_time: '03:35', timing: 'estimated', category: 'overnight_assist', assist_type: 'Continence care (repeat account)', workers_involved: 1, status: 'accepted', duplicate_of: 'demo-o4', source_ref: 'DEMO incident report repeating the 3:30am event', reviewer: 'Demo reviewer', review_note: 'Same event as demo-o4' }
  ];
  var ver = { id: 'demo-ver-1', participant_id: c.id, period_from: from, period_to: to, status: 'final', calc_version: EV_CALC_VERSION + '+demo', reviewer: 'Demo reviewer', finalised_at: new Date(Date.now() - 86400000).toISOString(), created_at: new Date(Date.now() - 86400000).toISOString(), snapshot: null };
  return { sources: [s1, s2, s3], observations: obs, versions: [ver] };
}
