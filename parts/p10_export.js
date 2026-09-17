/* ================= admin: export records — ONE record type per document, one record per page ================= */
var XP_TYPES = [
  { id: 'notes',     label: 'Shift notes',            help: 'Every progress note in the period. Each note starts on a new page under its date.' },
  { id: 'incidents', label: 'Incident reports',       help: 'Full form, all questions, with fall details. One report per page.' },
  { id: 'near',      label: 'Near misses',            help: 'One near miss record per page.' },
  { id: 'care',      label: 'Personal care logs',     help: 'One shift\'s care log per page.' },
  { id: 'overnight', label: 'Overnight summaries',    help: 'One night per page (11pm–7am block figures).' },
  { id: 'summary',   label: 'Summary (analytics)',    help: 'The Summary tab figures and charts for the selected participant and period.' }
];

function xpDefaults(){
  var base = state.sum ? { client: state.sum.client, from: state.sum.from, to: state.sum.to } : { client: null, from: addDays(todayYmd(), -27), to: todayYmd() };
  if (!base.client) { var t = state.data.clients.find(function(c){ return c.name === 'Tim'; }); base.client = t ? t.id : (state.data.clients[0] || {}).id; }
  return base;
}
function openExportOptions(){
  var d = xpDefaults();
  var o = state.exp || (state.exp = { type: 'notes', names: true, client: d.client, worker: '', from: d.from, to: d.to });
  if (!o.client) o.client = d.client; if (!o.from) o.from = d.from; if (!o.to) o.to = d.to; if (o.worker == null) o.worker = '';
  var uid = 'xp-' + randId();
  var m = el('div', { 'class': 'modal', style: 'max-width:520px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [ el('div', { 'class': 't-title' }, 'Export records'), el('div', { 'class': 't-cap' }, 'One record type per document, one record per page, exactly as stored.') ]),
      el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 'grid2' }, [
        el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'c' }, 'Participant'), el('select', { 'class': 'sel', id: uid + 'c', onchange: function(e){ o.client = e.target.value; } }, state.data.clients.map(function(c){ return el('option', { value: c.id, selected: c.id === o.client }, c.name); })) ]),
        el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'w' }, 'Worker'), el('select', { 'class': 'sel', id: uid + 'w', onchange: function(e){ o.worker = e.target.value; } }, [el('option', { value: '', selected: !o.worker }, 'All workers')].concat(state.data.workers.filter(function(w){ return !w.is_admin; }).map(function(w){ return el('option', { value: w.id, selected: w.id === o.worker }, w.name + (w.active ? '' : ' (inactive)')); }))) ])
      ]),
      el('div', { 'class': 'grid2' }, [
        el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 'f' }, 'From'), el('input', { 'class': 'inp', id: uid + 'f', type: 'date', value: o.from, onchange: function(e){ o.from = e.target.value; } }) ]),
        el('div', { 'class': 'field' }, [ el('label', { 'for': uid + 't' }, 'To'), el('input', { 'class': 'inp', id: uid + 't', type: 'date', value: o.to, onchange: function(e){ o.to = e.target.value; } }) ])
      ]),
      el('div', { 'class': 't-label', style: 'margin:4px 0 8px' }, 'What to export'),
      el('div', null, XP_TYPES.map(function(t){
        return el('label', { 'class': 'radiorow', style: 'align-items:flex-start' }, [
          el('input', { type: 'radio', name: 'xp_type', checked: o.type === t.id, onchange: function(){ o.type = t.id; } }),
          el('div', null, [ el('div', { style: 'font-size:14px;font-weight:600' }, t.label), el('div', { 'class': 't-cap' }, t.help) ])
        ]);
      })),
      el('div', { 'class': 't-label', style: 'margin:14px 0 8px' }, 'Privacy'),
      el('label', { 'class': 'checkrow' }, [
        el('input', { type: 'checkbox', checked: !!o.names, onchange: function(e){ o.names = e.target.checked; } }),
        el('span', { style: 'font-size:14px' }, 'Show worker names (untick for external recipients)')
      ]),
      el('div', { 'class': 'q-help', style: 'margin-top:12px' }, 'The worker filter keeps only records that worker wrote or shifts they were rostered on. Use Save as PDF on the page that opens: on a phone it goes to the share sheet (Save to Files, AirDrop, Mail); on a computer it downloads.')
    ]),
    el('div', { 'class': 'modal-foot' }, [
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { 'class': 'btn btn-pri', onclick: function(e){
        if (!o.from || !o.to) { toast('Set both dates.', true); return; }
        if (o.from > o.to) { var x = o.from; o.from = o.to; o.to = x; }
        if (o.type === 'summary') { closeModal(); if (state.sum) { state.sum.client = o.client; state.sum.from = o.from; state.sum.to = o.to; state.sum.data = null; } state.adminTab = 'reports'; render(); return; }
        busyBtn(e.currentTarget, true);
        xpLoad(o).then(function(){ closeModal(); state.adminTab = 'export'; render(); window.scrollTo(0, 0); })["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
      } }, 'Open')
    ])
  ]);
  openModal(m);
}
/* every record for the participant and period comes from the server (paged), not the rolling cache */
function xpLoad(o){
  var q = 'select=*&participant_id=eq.' + o.client;
  return Promise.all([
    sbSelAll('ac_shifts', 'select=*&client_id=eq.' + o.client + '&date=gte.' + o.from + '&date=lte.' + o.to),
    sbSelAll('ac_note_entries', q), sbSelAll('ac_incident_forms', q), sbSelAll('ac_near_misses', q), sbSelAll('ac_care_logs', q), sbSelAll('ac_overnight_logs', q)
  ]).then(function(r){ state.xp = { key: o.client + '|' + o.from + '|' + o.to, shifts: r[0], notes: r[1], incidents: r[2], nearMisses: r[3], careLogs: r[4], overnightLogs: r[5] }; });
}

/* the export document as plain data — cover, then one entry per record. The on-screen view and
   the PDF are both rendered from this, so they always carry the same records and the same labels. */
function xpCompose(){
  var o = state.exp || { type: 'notes', names: true };
  var R = { client: o.client, from: o.from, to: o.to };
  var X = state.xp, wf = o.worker || null, wsel = wf ? workerById(wf) : null;
  var client = clientById(R.client), cname = client ? client.name : '';
  var org = (state.data.settings && state.data.settings.org_name) || 'Astar Health Service';
  var type = XP_TYPES.find(function(t){ return t.id === o.type; }) || XP_TYPES[0];
  function wName(id){ if (!o.names) return 'Support worker'; var w = workerById(id); return w ? w.name : '—'; }
  function inRange(d){ return d && d >= R.from && d <= R.to; }
  function shiftLine(s){ if (s.noShift) return 'Not attached to a rostered shift' + (s.worker_id ? ' · ' + wName(s.worker_id) : ''); return (s.type === 'sleepover' ? 'Sleepover shift ' : 'Day shift ') + fmtRange(s.start_t, s.end_t) + (s.worker_id ? ' · ' + wName(s.worker_id) : ''); }

  var shifts = X.shifts.filter(function(s){ return s.client_id === R.client && inRange(s.date); })
    .sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : tMin(a.start_t) - tMin(b.start_t); });
  /* worker filter: a record counts if the worker wrote it, or (for shift-level logs) was rostered on the shift */
  function byWorker(rec, s){ if (!wf) return true; if (rec && rec.worker_id) return rec.worker_id === wf; return !!(s && s.worker_id === wf); }
  function forShift(list, s){ return list.filter(function(r){ return r.shift_id === s.id && byWorker(r, s); }); }

  /* collect the pages for the chosen type: [{s, rec}] */
  var pages = [];
  shifts.forEach(function(s){
    if (o.type === 'notes') forShift(X.notes, s).sort(function(a, b){ return a.created_at < b.created_at ? -1 : 1; }).forEach(function(n){ pages.push({ s: s, rec: xpNoteModel(n) }); });
    if (o.type === 'incidents') forShift(X.incidents, s).forEach(function(ir){ pages.push({ s: s, rec: xpIncidentModel(ir) }); });
    if (o.type === 'near') forShift(X.nearMisses, s).forEach(function(nm){ pages.push({ s: s, rec: xpNearMissModel(nm) }); });
    if (o.type === 'care') forShift(X.careLogs, s).forEach(function(cl){ pages.push({ s: s, rec: xpCareLogModel(cl) }); });
    if (o.type === 'overnight' && s.type === 'sleepover') forShift(X.overnightLogs, s).forEach(function(ol){ pages.push({ s: s, rec: xpOvernightModel(ol) }); });
  });
  /* incidents and near misses with no shift attached still belong to the participant */
  if (o.type === 'incidents') X.incidents.filter(function(ir){ return !ir.shift_id && inRange(ir.incident_date) && byWorker(ir, null); }).forEach(function(ir){ pages.push({ s: { date: ir.incident_date, type: 'day', start_t: ir.incident_time || '00:00', end_t: ir.incident_time || '00:00', worker_id: ir.worker_id, noShift: true }, rec: xpIncidentModel(ir) }); });
  if (o.type === 'near') X.nearMisses.filter(function(nm){ return !nm.shift_id && inRange(nm.nm_date) && byWorker(nm, null); }).forEach(function(nm){ pages.push({ s: { date: nm.nm_date, type: 'day', start_t: nm.nm_time || '00:00', end_t: nm.nm_time || '00:00', worker_id: nm.worker_id, noShift: true }, rec: xpNearMissModel(nm) }); });
  pages.sort(function(a, b){ return a.s.date < b.s.date ? -1 : a.s.date > b.s.date ? 1 : tMin(a.s.start_t) - tMin(b.s.start_t); });

  var period = fmtDateFull(R.from) + ' to ' + fmtDateFull(R.to);
  return {
    org: org, title: type.label, participant: cname, period: period,
    meta: [
      ['Participant', cname],
      ['Address', client ? client.address : ''],
      ['Period', period],
      ['Worker', wsel ? wName(wsel.id) : 'All workers'],
      ['Records', pages.length + ' ' + type.label.toLowerCase()],
      ['Prepared by', org]
    ],
    dates: pages.length ? pages.map(function(p){ return fmtDate(p.s.date) + (p.s.type === 'sleepover' ? ' (night)' : ''); }).join(' · ') : null,
    none: 'No ' + type.label.toLowerCase() + ' were recorded for this participant' + (wsel ? ' by ' + wName(wsel.id) : '') + ' in this period.',
    caption: cname + ' · ' + (wsel ? wsel.name + ' · ' : 'all workers · ') + fmtDate(R.from) + ' – ' + fmtDate(R.to) + ' · one record per page, exactly as stored.',
    fileName: (type.label + ' - ' + (cname || 'participant') + (wsel ? ' - ' + wName(wsel.id) : '') + ' - ' + R.from + ' to ' + R.to).replace(/[\\\/:*?"<>|]+/g, '') + '.pdf',
    records: pages.map(function(p){ return { date: fmtDateFull(p.s.date), meta: shiftLine(p.s) + ' · ' + cname, rec: p.rec }; })
  };
}

function viewExport(main){
  var o = state.exp || { type: 'notes', names: true };
  var key = o.client + '|' + o.from + '|' + o.to;
  if (!state.xp || state.xp.key !== key) { xpLoad(o).then(render)["catch"](function(e){ toast(e.message, true); }); main.appendChild(el('div', { 'class': 'notice', role: 'status' }, 'Loading records…')); return; }
  var C = xpCompose();

  main.appendChild(el('div', { 'class': 'rp-controls', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0 16px' }, [
    el('button', { 'class': 'btn btn-sec btn-sm', onclick: function(){ state.adminTab = 'reports'; render(); } }, [svgIcon(IC.left), 'Back to summary']),
    el('button', { 'class': 'btn btn-sec btn-sm', onclick: openExportOptions }, 'Change export'),
    el('button', { 'class': 'btn btn-pri btn-sm', onclick: xpSavePdf }, [svgIcon(IC.file), 'Save as PDF']),
    // the installed (home-screen) app has no print dialog, so the button only appears in a browser
    xpStandalone() ? null : el('button', { 'class': 'btn btn-sec btn-sm', onclick: function(){ window.print(); } }, 'Print'),
    el('span', { 'class': 't-cap' }, C.caption)
  ]));

  var doc = el('div', { 'class': 'xp-doc' });
  main.appendChild(doc);

  /* cover */
  doc.appendChild(el('div', { 'class': 'xp-cover' }, [
    el('div', { 'class': 'xp-org' }, C.org),
    el('h1', null, C.title),
    el('div', { 'class': 'xp-big' }, C.participant),
    el('div', { 'class': 'xp-period' }, C.period),
    el('table', { 'class': 'xp-meta' }, C.meta.map(function(r){ return el('tr', null, [ el('td', null, r[0]), el('td', null, r[1]) ]); })),
    C.dates ? el('div', null, [
      el('div', { 'class': 't-label', style: 'margin:18px 0 6px' }, 'Dates covered'),
      el('div', { 'class': 'xp-dates' }, C.dates)
    ]) : el('p', { 'class': 'xp-none', style: 'margin-top:18px' }, C.none)
  ]));

  /* one page per record */
  C.records.forEach(function(r){
    doc.appendChild(el('div', { 'class': 'xp-page' }, [
      el('div', { 'class': 'xp-shift-h' }, [
        el('div', { 'class': 'xp-shift-d' }, r.date),
        el('div', { 'class': 'xp-shift-m' }, r.meta)
      ]),
      xpRecNode(r.rec)
    ]));
  });
}

/* ---------- record models: { kind: 'note' | 'rows' | 'table', cls, head, body | rows } ---------- */
function xpVal(v){ return v == null || v === '' ? '—' : String(v); }
function xpRow(label, value){
  return el('div', { 'class': 'xp-q' }, [ el('div', { 'class': 'xp-ql' }, label), el('div', { 'class': 'xp-qa' }, xpVal(value)) ]);
}
function xpRecNode(m){
  var box = el('div', { 'class': 'xp-rec ' + m.cls }, [ el('div', { 'class': 'xp-rec-h' }, m.head) ]);
  if (m.kind === 'note') box.appendChild(renderNoteBody(m.body));
  else if (m.kind === 'rows') m.rows.forEach(function(r){ box.appendChild(xpRow(r[0], r[1])); });
  else {
    var t = el('table', { 'class': 'xp-tbl xp-tbl-sm' });
    m.rows.forEach(function(r){ t.appendChild(el('tr', null, [ el('td', null, r[0]), el('td', { 'class': 'n' }, String(r[1])) ])); });
    box.appendChild(t);
  }
  return box;
}
function xpNoteModel(n){ return { kind: 'note', cls: 'xp-note', head: n.note_type, body: n.body }; }
function xpIncidentModel(ir){
  var yn = function(v){ return v ? 'Yes' : 'No'; };
  var rows = [
    ['1. Name of the staff member filling in this form', ir.staff_name],
    ["3. Ticket Name (the Participant's name)", ir.ticket_name],
    ['4. Ticket Description', ir.ticket_desc],
    ['5. Date this incident happened', ir.incident_date ? fmtDateFull(ir.incident_date) : ''],
    ['6. Time that this incident started', ir.incident_time ? fmtTime(ir.incident_time) : ''],
    ['7. What type of incident is this', (ir.incident_types || []).join(', ')],
    ['Fall details: did this incident involve a fall?', yn(ir.is_fall)]
  ];
  if (ir.other_staff) rows.splice(1, 0, ['Recorded on this report (question retired 17 Sep 2026)', 'Other staff member on shift: ' + ir.other_staff]);
  if (ir.is_fall) rows.push(
    ['Where did the fall happen', ir.fall_location === 'Other' && ir.fall_location_other ? 'Other — ' + ir.fall_location_other : ir.fall_location],
    ['Happened during a transfer', ir.during_transfer == null ? 'Not recorded' : yn(ir.during_transfer)],
    ['Was equipment involved?', yn(ir.equipment_involved) + (ir.equipment_involved && ir.equipment_desc ? '. ' + ir.equipment_desc : '')]
  );
  if (ir.is_fall && ir.minutes_on_floor != null) rows.push(['Minutes on the floor before being helped up', ir.minutes_on_floor]);
  if (ir.is_fall && ir.second_person_needed) rows.push(['Recorded on this report (question retired 9 Sep 2026)', 'Another person helped the participant up']);
  rows.push(
    ['8. Was there any unauthorised use of restricted practice', ir.restrictive === 'No' ? 'No' : 'Yes'],
    ['9. Type of unauthorised restrictive practice', ir.restrictive === 'No' ? 'Not applicable' : (ir.restrictive_types || []).join(', ')],
    ['10. List any triggers that may have led to this incident', ir.triggers],
    ['11. What response did you provide to the incident (what did you do)', ir.response],
    ['12. What was the outcome', ir.outcome],
    ['13. In this incident, was there any property damage?', ir.property_damage === 'No' ? 'No' : 'Yes'],
    ['14. Property damage information', ir.property_damage === 'No' ? 'Not applicable' : ir.property_info],
    ['15. Photos of property damage', ir.property_damage === 'No' ? 'Not applicable' : ((ir.property_photos || []).length ? (ir.property_photos.length + ' photo(s) on file') : 'None attached')],
    ['16. Were emergency services called at all during this incident?', (ir.emergency || []).length ? ir.emergency.join(', ') : 'No'],
    ['17. Were there any injuries?', ir.injuries == null || ir.injuries === '' ? 'Not answered' : (ir.injuries === 'No' ? 'No' : 'Yes')],
    ['18. Who was injured and how did this injury happen?', ir.injuries === 'No' ? 'Not applicable' : ir.injury_who],
    ['19. What kind of injury', ir.injuries === 'No' ? 'Not applicable' : ir.injury_kind]
  );
  return { kind: 'rows', cls: 'xp-ir', head: 'Incident report · ' + ((ir.incident_types || []).join(', ') || 'Incident') + (ir.incident_time ? ' · ' + fmtTime(ir.incident_time) : ''), rows: rows };
}
function xpNearMissModel(nm){
  var yn = function(v){ return v ? 'Yes' : 'No'; };
  return { kind: 'rows', cls: 'xp-nm', head: 'Near miss · ' + (nm.location || '') + (nm.nm_time ? ' · ' + fmtTime(nm.nm_time) : ''), rows: [
    ['Recorded by', nm.staff_name], ['Date', nm.nm_date ? fmtDateFull(nm.nm_date) : ''], ['Approximate time', nm.nm_time ? fmtTime(nm.nm_time) : ''],
    ['Where it happened', nm.location === 'Other' && nm.location_other ? 'Other — ' + nm.location_other : nm.location],
    ['Happened during a transfer', nm.during_transfer == null ? 'Not recorded' : yn(nm.during_transfer)],
    ['What nearly happened', nm.description], ['What stopped it becoming a fall', nm.prevented_by],
    ['Equipment contributed', yn(nm.equipment_factor) + (nm.equipment_factor && nm.equipment_desc ? '. ' + nm.equipment_desc : '')]
  ] };
}
function xpCareLogModel(l){
  return { kind: 'table', cls: 'xp-care', head: 'Personal care log', rows: [
    ['Pad changes (wet)', l.pad_wet], ['Pad changes (bowel movement)', l.pad_bowel], ['Times found wet in bed', l.bed_wet], ['Bedding changes', l.bedding_changes],
    ['Other care refusals needing prompting', l.care_refusals], ['Assisted transfers', l.transfers], ['Transfers one worker could not do safely alone', l.transfer_unsafe_alone]
  ] };
}
function xpOvernightModel(l){
  var a = evNumVal(l.asleep_hours), x = evNumVal(l.active_hours);
  return { kind: 'table', cls: 'xp-on', head: 'Overnight summary · 11:00pm to 7:00am block', rows: [
    ['Went to bed at', l.bed_time ? fmtTime(l.bed_time) : '—'], ['Up for the day at', l.wake_time ? fmtTime(l.wake_time) : '—'],
    ['Times woke needing support before being up for the day (final wake not counted)', l.wakes == null ? 'Not recorded' : l.wakes],
    ['Hours asleep in the block', l.asleep_hours == null ? 'Not recorded' : hrsFmt(a) + ' h'], ['Hours of worker assistance in the block', l.active_hours == null ? 'Not recorded' : hrsFmt(x) + ' h']
  ] };
}
