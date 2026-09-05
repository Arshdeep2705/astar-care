/* ================= admin: export records (participant + date range → printable document) ================= */
function openExportOptions(){
  var R = state.rep || { client: null, from: addDays(todayYmd(), -27), to: todayYmd() };
  var o = state.exp || { summary: true, notes: true, incidents: true, near: true, care: true, overnight: true, names: true };
  function chk(key, label, help){
    return el('label', { 'class': 'checkrow', style: 'align-items:flex-start' }, [
      el('input', { type: 'checkbox', checked: !!o[key], onchange: function(e){ o[key] = e.target.checked; } }),
      el('div', null, [ el('div', { style: 'font-size:14px' }, label), help ? el('div', { 'class': 't-cap' }, help) : null ])
    ]);
  }
  var c = clientById(R.client);
  var m = el('div', { 'class': 'modal', style: 'max-width:480px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, 'Export records'),
        el('div', { 'class': 't-cap' }, (c ? c.name : '') + ' · ' + fmtDate(R.from) + ' to ' + fmtDate(R.to) + ' (change these on the Reports tab)')
      ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 't-label', style: 'margin-bottom:8px' }, 'Include'),
      chk('summary', 'Summary report', 'The charts and tables from the Reports tab, up front.'),
      chk('notes', 'Shift notes', 'Every progress note in the period, in full, under its shift.'),
      chk('incidents', 'Incident reports', 'Full form, all questions, with fall details.'),
      chk('near', 'Near misses'),
      chk('care', 'Personal care logs'),
      chk('overnight', 'Overnight summaries'),
      el('div', { 'class': 't-label', style: 'margin:14px 0 8px' }, 'Privacy'),
      chk('names', 'Show worker names', 'Untick for external recipients: workers appear as "Support worker".'),
      el('div', { 'class': 'q-help', style: 'margin-top:12px' }, 'The document opens in the app. Use Print / save as PDF at the top (on iPhone: Share → Print, then pinch the preview open → Share → Save to Files).')
    ]),
    el('div', { 'class': 'modal-foot' }, [
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { 'class': 'btn btn-pri', onclick: function(){ state.exp = o; closeModal(); state.adminTab = 'export'; render(); window.scrollTo(0, 0); } }, 'Open export')
    ])
  ]);
  openModal(m);
}

function viewExport(main){
  var R = state.rep || (state.rep = { client: null, from: addDays(todayYmd(), -27), to: todayYmd() });
  var o = state.exp || { summary: true, notes: true, incidents: true, near: true, care: true, overnight: true, names: true };
  var client = clientById(R.client);
  var org = (state.data.settings && state.data.settings.org_name) || 'Astar Health Service';
  function wName(id){ if (!o.names) return 'Support worker'; var w = workerById(id); return w ? w.name : '—'; }
  function inRange(d){ return d && d >= R.from && d <= R.to; }

  /* controls (hidden when printing) */
  main.appendChild(el('div', { 'class': 'rp-controls', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0 16px' }, [
    el('button', { 'class': 'btn btn-sec btn-sm', onclick: function(){ state.adminTab = 'reports'; render(); } }, [svgIcon(IC.left), 'Back to reports']),
    el('button', { 'class': 'btn btn-pri btn-sm', onclick: function(){ window.print(); } }, [svgIcon(IC.file), 'Print / save as PDF']),
    el('span', { 'class': 't-cap' }, 'Check the pages below, then print or save. Everything shown is exactly what is stored in the app.')
  ]));

  var doc = el('div', { 'class': 'xp-doc' });
  main.appendChild(doc);

  /* ---- gather ---- */
  var shifts = state.data.shifts.filter(function(s){ return s.client_id === R.client && inRange(s.date); })
    .sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : tMin(a.start_t) - tMin(b.start_t); });
  var byId = {}; shifts.forEach(function(s){ byId[s.id] = s; });
  var notesN = 0, incN = 0, nmN = 0, careN = 0, onN = 0;
  shifts.forEach(function(s){
    notesN += notesForShift(s.id).length; incN += incidentsForShift(s.id).length; nmN += nearMissesForShift(s.id).length;
    if (careLogForShift(s.id)) careN++; if (overnightLogForShift(s.id)) onN++;
  });

  /* ---- cover ---- */
  var contents = [];
  if (o.summary) contents.push('Summary report');
  contents.push('Index of shifts in the period (' + shifts.length + ' shifts)');
  if (o.notes) contents.push('Shift notes (' + notesN + ')');
  if (o.incidents) contents.push('Incident reports (' + incN + ')');
  if (o.near) contents.push('Near miss records (' + nmN + ')');
  if (o.care) contents.push('Personal care logs (' + careN + ')');
  if (o.overnight) contents.push('Overnight summaries (' + onN + ')');
  doc.appendChild(el('div', { 'class': 'xp-cover' }, [
    el('div', { 'class': 'xp-org' }, org),
    el('h1', null, 'Support records'),
    el('div', { 'class': 'xp-big' }, client ? client.name : ''),
    el('div', { 'class': 'xp-period' }, fmtDateFull(R.from) + ' to ' + fmtDateFull(R.to)),
    el('table', { 'class': 'xp-meta' }, [
      el('tr', null, [ el('td', null, 'Participant'), el('td', null, client ? client.name : '') ]),
      el('tr', null, [ el('td', null, 'Address'), el('td', null, client ? client.address : '') ]),
      el('tr', null, [ el('td', null, 'Period'), el('td', null, fmtDateFull(R.from) + ' to ' + fmtDateFull(R.to)) ]),
      el('tr', null, [ el('td', null, 'Prepared by'), el('td', null, org) ]),
      el('tr', null, [ el('td', null, 'Generated'), el('td', null, fmtDT(new Date().toISOString())) ])
    ]),
    el('div', { 'class': 't-label', style: 'margin:18px 0 6px' }, 'Contents'),
    el('ol', { 'class': 'xp-contents' }, contents.map(function(c){ return el('li', null, c); })),
    el('p', { 'class': 'xp-method' }, 'All records in this document were entered by the support worker on shift in the ' + org + ' care app at or shortly after the time of the events described, and are reproduced here unedited. Each record is dated and linked to a rostered shift. Times are approximate unless stated. Overnight hours are measured within the 11:00pm to 7:00am sleepover block.')
  ]));

  /* ---- summary ---- */
  if (o.summary) {
    var sum = el('div', { 'class': 'xp-section' });
    sum.appendChild(el('h2', { 'class': 'xp-h2' }, 'Summary report'));
    var tmp = el('div');
    viewReports(tmp);
    Array.prototype.slice.call(tmp.querySelectorAll('.rp-controls, .section-head')).forEach(function(n){ n.remove(); });
    while (tmp.firstChild) sum.appendChild(tmp.firstChild);
    doc.appendChild(sum);
  }

  /* ---- index ---- */
  var idx = el('div', { 'class': 'xp-section' });
  idx.appendChild(el('h2', { 'class': 'xp-h2' }, 'Index of shifts'));
  if (!shifts.length) idx.appendChild(el('p', null, 'No shifts rostered for this participant in the period.'));
  else {
    var tbl = el('table', { 'class': 'xp-tbl' }, el('tr', null, [
      el('th', null, 'Date'), el('th', null, 'Shift'), el('th', null, 'Worker'), el('th', null, 'Clock in / out'),
      el('th', { 'class': 'c' }, 'Note'), el('th', { 'class': 'c' }, 'Incident'), el('th', { 'class': 'c' }, 'Near miss'), el('th', { 'class': 'c' }, 'Care log'), el('th', { 'class': 'c' }, 'Overnight')
    ]));
    shifts.forEach(function(s){
      var cl = clocksForShift(s.id), cin = cl.filter(function(x){ return x.kind === 'in'; })[0], cout = cl.filter(function(x){ return x.kind === 'out'; }).slice(-1)[0];
      function tick(n){ return el('td', { 'class': 'c' }, n ? (n > 1 ? '✓ ×' + n : '✓') : '—'); }
      tbl.appendChild(el('tr', null, [
        el('td', null, fmtDate(s.date)),
        el('td', null, (s.type === 'sleepover' ? 'Sleepover ' : 'Day ') + fmtRange(s.start_t, s.end_t)),
        el('td', null, s.worker_id ? wName(s.worker_id) : 'Unfilled'),
        el('td', null, (cin ? fmtDT(cin.at).split(', ').pop() : '—') + ' / ' + (cout ? fmtDT(cout.at).split(', ').pop() : '—')),
        tick(notesForShift(s.id).length), tick(incidentsForShift(s.id).length), tick(nearMissesForShift(s.id).length),
        tick(careLogForShift(s.id) ? 1 : 0), s.type === 'sleepover' ? tick(overnightLogForShift(s.id) ? 1 : 0) : el('td', { 'class': 'c' }, 'n/a')
      ]));
    });
    idx.appendChild(el('div', { style: 'overflow-x:auto' }, tbl));
  }
  doc.appendChild(idx);

  /* ---- records, shift by shift ---- */
  if (o.notes || o.incidents || o.near || o.care || o.overnight) {
    var rec = el('div', { 'class': 'xp-section' });
    rec.appendChild(el('h2', { 'class': 'xp-h2' }, 'Records by shift'));
    shifts.forEach(function(s){
      var blk = el('div', { 'class': 'xp-shift' });
      var cl = clocksForShift(s.id), cin = cl.filter(function(x){ return x.kind === 'in'; })[0], cout = cl.filter(function(x){ return x.kind === 'out'; }).slice(-1)[0];
      blk.appendChild(el('div', { 'class': 'xp-shift-h' }, [
        el('div', { 'class': 'xp-shift-d' }, fmtDateFull(s.date)),
        el('div', { 'class': 'xp-shift-m' }, (s.type === 'sleepover' ? 'Sleepover shift ' : 'Day shift ') + fmtRange(s.start_t, s.end_t) + ' · ' + (s.worker_id ? wName(s.worker_id) : 'Unfilled') +
          (cin || cout ? ' · clock ' + (cin ? fmtDT(cin.at).split(', ').pop() : '—') + ' to ' + (cout ? fmtDT(cout.at).split(', ').pop() : '—') : ''))
      ]));
      var any = false;
      if (o.notes) notesForShift(s.id).forEach(function(n){
        any = true;
        var box = el('div', { 'class': 'xp-rec' }, [
          el('div', { 'class': 'xp-rec-h' }, n.note_type + ' · ' + wName(n.worker_id) + ' · written ' + fmtDT(n.created_at) + (n.updated_at && n.updated_at !== n.created_at ? ' · edited ' + fmtDT(n.updated_at) : ''))
        ]);
        box.appendChild(renderNoteBody(n.body));
        blk.appendChild(box);
      });
      if (o.incidents) incidentsForShift(s.id).forEach(function(ir){ any = true; blk.appendChild(exportIncident(ir, wName)); });
      if (o.near) nearMissesForShift(s.id).forEach(function(nm){ any = true; blk.appendChild(exportNearMiss(nm, wName)); });
      if (o.care) { var cl2 = careLogForShift(s.id); if (cl2) { any = true; blk.appendChild(exportCareLog(cl2)); } }
      if (o.overnight && s.type === 'sleepover') { var ol = overnightLogForShift(s.id); if (ol) { any = true; blk.appendChild(exportOvernight(ol)); } }
      if (!any) blk.appendChild(el('div', { 'class': 'xp-none' }, 'No records entered for this shift.'));
      rec.appendChild(blk);
    });
    doc.appendChild(rec);
  }
  doc.appendChild(el('div', { 'class': 'xp-end' }, 'End of document · ' + (client ? client.name : '') + ' · ' + fmtDateFull(R.from) + ' to ' + fmtDateFull(R.to)));
}

function xpRow(label, value){
  return el('div', { 'class': 'xp-q' }, [ el('div', { 'class': 'xp-ql' }, label), el('div', { 'class': 'xp-qa' }, value == null || value === '' ? '—' : String(value)) ]);
}
function exportIncident(ir, wName){
  var yn = function(v){ return v ? 'Yes' : 'No'; };
  var box = el('div', { 'class': 'xp-rec xp-ir' }, [
    el('div', { 'class': 'xp-rec-h' }, 'Incident report · ' + ((ir.incident_types || []).join(', ') || 'Incident') + ' · ' + (ir.incident_date ? fmtDate(ir.incident_date) : '') + (ir.incident_time ? ' ' + fmtTime(ir.incident_time) : '') + ' · submitted ' + fmtDT(ir.created_at))
  ]);
  var rows = [
    ['1. Name of the staff member filling in this form', ir.staff_name],
    ['2. Which other staff member was on shift during this incident', ir.other_staff],
    ["3. Ticket Name (the Participant's name)", ir.ticket_name],
    ['4. Ticket Description', ir.ticket_desc],
    ['5. Date this incident happened', ir.incident_date ? fmtDateFull(ir.incident_date) : ''],
    ['6. Time that this incident started', ir.incident_time ? fmtTime(ir.incident_time) : ''],
    ['7. What type of incident is this', (ir.incident_types || []).join(', ')],
    ['Fall details: did this incident involve a fall?', yn(ir.is_fall)]
  ];
  if (ir.is_fall) rows.push(
    ['Where did the fall happen', ir.fall_location],
    ['Was a second person needed to get the participant up?', yn(ir.second_person_needed)],
    ['Minutes on the floor before being helped up', ir.minutes_on_floor != null ? ir.minutes_on_floor : 'Not recorded'],
    ['Was equipment involved?', yn(ir.equipment_involved) + (ir.equipment_involved && ir.equipment_desc ? '. ' + ir.equipment_desc : '')]
  );
  rows.push(
    ['8. Was there any unauthorised use of restricted practice', ir.restrictive === 'No' ? 'No' : 'Yes'],
    ['9. Type of unauthorised restrictive practice', ir.restrictive === 'No' ? 'Not applicable' : (ir.restrictive_types || []).join(', ')],
    ['10. List any triggers that may have led to this incident', ir.triggers],
    ['11. What response did you provide to the incident (what did you do)', ir.response],
    ['12. What was the outcome', ir.outcome],
    ['13. In this incident, was there any property damage?', ir.property_damage === 'No' ? 'No' : 'Yes'],
    ['14. Property damage information', ir.property_damage === 'No' ? 'Not applicable' : ir.property_info],
    ['15. Photos of property damage', ir.property_damage === 'No' ? 'Not applicable' : ((ir.property_photos || []).length ? (ir.property_photos.length + ' photo(s) on file in the app') : 'None attached')],
    ['16. Were emergency services called at all during this incident?', (ir.emergency || []).length ? ir.emergency.join(', ') : 'No'],
    ['17. Were there any injuries?', ir.injuries === 'No' ? 'No' : 'Yes'],
    ['18. Who was injured and how did this injury happen?', ir.injuries === 'No' ? 'Not applicable' : ir.injury_who],
    ['19. What kind of injury', ir.injuries === 'No' ? 'Not applicable' : ir.injury_kind]
  );
  rows.forEach(function(r){ box.appendChild(xpRow(r[0], r[1])); });
  return box;
}
function exportNearMiss(nm, wName){
  var yn = function(v){ return v ? 'Yes' : 'No'; };
  var box = el('div', { 'class': 'xp-rec xp-nm' }, [
    el('div', { 'class': 'xp-rec-h' }, 'Near miss · ' + (nm.location || '') + ' · ' + (nm.nm_date ? fmtDate(nm.nm_date) : '') + (nm.nm_time ? ' ' + fmtTime(nm.nm_time) : '') + ' · recorded ' + fmtDT(nm.created_at))
  ]);
  [['Recorded by', nm.staff_name], ['Where it happened', nm.location], ['What nearly happened', nm.description], ['What stopped it becoming a fall', nm.prevented_by],
   ['At or beyond what one worker can safely manage alone', yn(nm.single_worker_capacity)],
   ['Equipment contributed', yn(nm.equipment_factor) + (nm.equipment_factor && nm.equipment_desc ? '. ' + nm.equipment_desc : '')]
  ].forEach(function(r){ box.appendChild(xpRow(r[0], r[1])); });
  return box;
}
function exportCareLog(l){
  var box = el('div', { 'class': 'xp-rec xp-care' }, [ el('div', { 'class': 'xp-rec-h' }, 'Personal care log · saved ' + fmtDT(l.updated_at || l.created_at)) ]);
  var t = el('table', { 'class': 'xp-tbl xp-tbl-sm' });
  [['Pad changes (wet)', l.pad_wet], ['Pad changes (bowel movement)', l.pad_bowel], ['Times found wet in bed', l.bed_wet], ['Bedding changes', l.bedding_changes],
   ['Shower', l.shower_offered ? (l.shower_done ? 'Offered and done' : 'Offered and declined') : 'Not offered this shift'],
   ['Prompts before the shower was accepted', l.shower_offered ? l.shower_prompts : 'n/a'],
   ['Other care refusals needing prompting', l.care_refusals], ['Assisted transfers', l.transfers], ['Transfers one worker could not do safely alone', l.transfer_unsafe_alone]
  ].forEach(function(r){ t.appendChild(el('tr', null, [ el('td', null, r[0]), el('td', { 'class': 'n' }, String(r[1])) ])); });
  box.appendChild(t);
  return box;
}
function exportOvernight(l){
  var a = evNumVal(l.asleep_hours), x = evNumVal(l.active_hours);
  var box = el('div', { 'class': 'xp-rec xp-on' }, [ el('div', { 'class': 'xp-rec-h' }, 'Overnight summary · 11:00pm to 7:00am block · saved ' + fmtDT(l.updated_at || l.created_at)) ]);
  var t = el('table', { 'class': 'xp-tbl xp-tbl-sm' });
  [['Went to bed at', l.bed_time ? fmtTime(l.bed_time) : '—'], ['Up for the day at', l.wake_time ? fmtTime(l.wake_time) : '—'],
   ['Times woke needing support before being up for the day', l.wakes],
   ['Hours asleep in the block', hrsFmt(a) + ' h'], ['Hours of active support in the block', hrsFmt(x) + ' h'],
   ['Active support above the 2-hour sleepover allowance', hrsFmt(Math.max(0, x - 2)) + ' h']
  ].forEach(function(r){ t.appendChild(el('tr', null, [ el('td', null, r[0]), el('td', { 'class': 'n' }, String(r[1])) ])); });
  box.appendChild(t);
  return box;
}
