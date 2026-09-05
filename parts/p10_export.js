/* ================= admin: export records — ONE record type per document, one record per page ================= */
var XP_TYPES = [
  { id: 'notes',     label: 'Shift notes',            help: 'Every progress note in the period. Each note starts on a new page under its date.' },
  { id: 'incidents', label: 'Incident reports',       help: 'Full form, all questions, with fall details. One report per page.' },
  { id: 'near',      label: 'Near misses',            help: 'One near miss record per page.' },
  { id: 'care',      label: 'Personal care logs',     help: 'One shift\'s care log per page.' },
  { id: 'overnight', label: 'Overnight summaries',    help: 'One night per page (11pm–7am block figures).' },
  { id: 'summary',   label: 'Summary report',         help: 'The charts and tables from the Reports tab — falls, near misses, overnight hours, 2:1 evidence.' }
];

function openExportOptions(){
  var R = state.rep || { client: null, from: addDays(todayYmd(), -27), to: todayYmd() };
  var o = state.exp || { type: 'notes', names: true };
  var c = clientById(R.client);
  var m = el('div', { 'class': 'modal', style: 'max-width:480px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, 'Export'),
        el('div', { 'class': 't-cap' }, (c ? c.name : '') + ' · ' + fmtDate(R.from) + ' to ' + fmtDate(R.to) + ' (change these on the Reports tab)')
      ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 't-label', style: 'margin-bottom:8px' }, 'What do you want to export?'),
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
      el('div', { 'class': 'q-help', style: 'margin-top:12px' }, 'Each export is its own document. Use Print / save as PDF at the top of the page that opens (on iPhone: Share → Print → pinch the preview open → Share → Save to Files).')
    ]),
    el('div', { 'class': 'modal-foot' }, [
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { 'class': 'btn btn-pri', onclick: function(){
        state.exp = o; closeModal();
        if (o.type === 'summary') { state.adminTab = 'reports'; render(); setTimeout(function(){ window.print(); }, 150); return; }
        state.adminTab = 'export'; render(); window.scrollTo(0, 0);
      } }, 'Open')
    ])
  ]);
  openModal(m);
}

function viewExport(main){
  var R = state.rep || (state.rep = { client: null, from: addDays(todayYmd(), -27), to: todayYmd() });
  var o = state.exp || { type: 'notes', names: true };
  var client = clientById(R.client);
  var org = (state.data.settings && state.data.settings.org_name) || 'Astar Health Service';
  var type = XP_TYPES.find(function(t){ return t.id === o.type; }) || XP_TYPES[0];
  function wName(id){ if (!o.names) return 'Support worker'; var w = workerById(id); return w ? w.name : '—'; }
  function inRange(d){ return d && d >= R.from && d <= R.to; }
  function shiftLine(s){ return (s.type === 'sleepover' ? 'Sleepover shift ' : 'Day shift ') + fmtRange(s.start_t, s.end_t) + (s.worker_id ? ' · ' + wName(s.worker_id) : ''); }

  main.appendChild(el('div', { 'class': 'rp-controls', style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:6px 0 16px' }, [
    el('button', { 'class': 'btn btn-sec btn-sm', onclick: function(){ state.adminTab = 'reports'; render(); } }, [svgIcon(IC.left), 'Back to reports']),
    el('button', { 'class': 'btn btn-sec btn-sm', onclick: openExportOptions }, 'Change export'),
    el('button', { 'class': 'btn btn-pri btn-sm', onclick: function(){ window.print(); } }, [svgIcon(IC.file), 'Print / save as PDF']),
    el('span', { 'class': 't-cap' }, 'One record per page. Everything shown is exactly what is stored in the app.')
  ]));

  var doc = el('div', { 'class': 'xp-doc' });
  main.appendChild(doc);

  var shifts = state.data.shifts.filter(function(s){ return s.client_id === R.client && inRange(s.date); })
    .sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : tMin(a.start_t) - tMin(b.start_t); });

  /* collect the pages for the chosen type: [{shift, node}] */
  var pages = [];
  shifts.forEach(function(s){
    if (o.type === 'notes') notesForShift(s.id).forEach(function(n){ pages.push({ s: s, node: exportNote(n) }); });
    if (o.type === 'incidents') incidentsForShift(s.id).forEach(function(ir){ pages.push({ s: s, node: exportIncident(ir) }); });
    if (o.type === 'near') nearMissesForShift(s.id).forEach(function(nm){ pages.push({ s: s, node: exportNearMiss(nm) }); });
    if (o.type === 'care') { var cl = careLogForShift(s.id); if (cl) pages.push({ s: s, node: exportCareLog(cl) }); }
    if (o.type === 'overnight' && s.type === 'sleepover') { var ol = overnightLogForShift(s.id); if (ol) pages.push({ s: s, node: exportOvernight(ol) }); }
  });

  /* cover */
  doc.appendChild(el('div', { 'class': 'xp-cover' }, [
    el('div', { 'class': 'xp-org' }, org),
    el('h1', null, type.label),
    el('div', { 'class': 'xp-big' }, client ? client.name : ''),
    el('div', { 'class': 'xp-period' }, fmtDateFull(R.from) + ' to ' + fmtDateFull(R.to)),
    el('table', { 'class': 'xp-meta' }, [
      el('tr', null, [ el('td', null, 'Participant'), el('td', null, client ? client.name : '') ]),
      el('tr', null, [ el('td', null, 'Address'), el('td', null, client ? client.address : '') ]),
      el('tr', null, [ el('td', null, 'Period'), el('td', null, fmtDateFull(R.from) + ' to ' + fmtDateFull(R.to)) ]),
      el('tr', null, [ el('td', null, 'Records'), el('td', null, pages.length + ' ' + type.label.toLowerCase() + (pages.length === 1 ? '' : '')) ]),
      el('tr', null, [ el('td', null, 'Prepared by'), el('td', null, org) ])
    ]),
    pages.length ? el('div', null, [
      el('div', { 'class': 't-label', style: 'margin:18px 0 6px' }, 'Dates covered'),
      el('div', { 'class': 'xp-dates' }, pages.map(function(p){ return fmtDate(p.s.date) + (p.s.type === 'sleepover' ? ' (night)' : ''); }).join(' · '))
    ]) : el('p', { 'class': 'xp-none', style: 'margin-top:18px' }, 'No ' + type.label.toLowerCase() + ' were recorded for this participant in this period.')
  ]));

  /* one page per record */
  pages.forEach(function(p){
    doc.appendChild(el('div', { 'class': 'xp-page' }, [
      el('div', { 'class': 'xp-shift-h' }, [
        el('div', { 'class': 'xp-shift-d' }, fmtDateFull(p.s.date)),
        el('div', { 'class': 'xp-shift-m' }, shiftLine(p.s) + ' · ' + (client ? client.name : ''))
      ]),
      p.node
    ]));
  });
}

function exportNote(n){
  var box = el('div', { 'class': 'xp-rec xp-note' }, [ el('div', { 'class': 'xp-rec-h' }, n.note_type) ]);
  box.appendChild(renderNoteBody(n.body));
  return box;
}
function xpRow(label, value){
  return el('div', { 'class': 'xp-q' }, [ el('div', { 'class': 'xp-ql' }, label), el('div', { 'class': 'xp-qa' }, value == null || value === '' ? '—' : String(value)) ]);
}
function exportIncident(ir){
  var yn = function(v){ return v ? 'Yes' : 'No'; };
  var box = el('div', { 'class': 'xp-rec xp-ir' }, [
    el('div', { 'class': 'xp-rec-h' }, 'Incident report · ' + ((ir.incident_types || []).join(', ') || 'Incident') + (ir.incident_time ? ' · ' + fmtTime(ir.incident_time) : ''))
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
    ['15. Photos of property damage', ir.property_damage === 'No' ? 'Not applicable' : ((ir.property_photos || []).length ? (ir.property_photos.length + ' photo(s) on file') : 'None attached')],
    ['16. Were emergency services called at all during this incident?', (ir.emergency || []).length ? ir.emergency.join(', ') : 'No'],
    ['17. Were there any injuries?', ir.injuries === 'No' ? 'No' : 'Yes'],
    ['18. Who was injured and how did this injury happen?', ir.injuries === 'No' ? 'Not applicable' : ir.injury_who],
    ['19. What kind of injury', ir.injuries === 'No' ? 'Not applicable' : ir.injury_kind]
  );
  rows.forEach(function(r){ box.appendChild(xpRow(r[0], r[1])); });
  return box;
}
function exportNearMiss(nm){
  var yn = function(v){ return v ? 'Yes' : 'No'; };
  var box = el('div', { 'class': 'xp-rec xp-nm' }, [
    el('div', { 'class': 'xp-rec-h' }, 'Near miss · ' + (nm.location || '') + (nm.nm_time ? ' · ' + fmtTime(nm.nm_time) : ''))
  ]);
  [['Recorded by', nm.staff_name], ['Date', nm.nm_date ? fmtDateFull(nm.nm_date) : ''], ['Approximate time', nm.nm_time ? fmtTime(nm.nm_time) : ''],
   ['Where it happened', nm.location], ['What nearly happened', nm.description], ['What stopped it becoming a fall', nm.prevented_by],
   ['At or beyond what one worker can safely manage alone', yn(nm.single_worker_capacity)],
   ['Equipment contributed', yn(nm.equipment_factor) + (nm.equipment_factor && nm.equipment_desc ? '. ' + nm.equipment_desc : '')]
  ].forEach(function(r){ box.appendChild(xpRow(r[0], r[1])); });
  return box;
}
function exportCareLog(l){
  var box = el('div', { 'class': 'xp-rec xp-care' }, [ el('div', { 'class': 'xp-rec-h' }, 'Personal care log') ]);
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
  var box = el('div', { 'class': 'xp-rec xp-on' }, [ el('div', { 'class': 'xp-rec-h' }, 'Overnight summary · 11:00pm to 7:00am block') ]);
  var t = el('table', { 'class': 'xp-tbl xp-tbl-sm' });
  [['Went to bed at', l.bed_time ? fmtTime(l.bed_time) : '—'], ['Up for the day at', l.wake_time ? fmtTime(l.wake_time) : '—'],
   ['Times woke needing support before being up for the day', l.wakes],
   ['Hours asleep in the block', hrsFmt(a) + ' h'], ['Hours of active support in the block', hrsFmt(x) + ' h'],
   ['Active support above the 2-hour sleepover allowance', hrsFmt(Math.max(0, x - 2)) + ' h']
  ].forEach(function(r){ t.appendChild(el('tr', null, [ el('td', null, r[0]), el('td', { 'class': 'n' }, String(r[1])) ])); });
  box.appendChild(t);
  return box;
}
