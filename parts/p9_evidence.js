/* ================= evidence logs: near miss, personal care log, overnight summary ================= */
/* These quick structured forms feed the admin Reports tab. Nothing is parsed out of
   the free-text notes — every number on a report comes from a field a worker filled. */
var NM_LOCATIONS = ['Bed', 'Shower', 'Toilet', 'Couch to wheelchair', 'Wheelchair to bed', 'Vehicle', 'Community', 'Other'];
var TRANSFER_LOCS = ['Bed', 'Shower', 'Toilet', 'Couch to wheelchair', 'Wheelchair to bed', 'Vehicle'];

/* small form helpers shared by the three modals */
function evLabel(text){ return el('label', { style: 'display:block;font-size:14px;font-weight:600;color:var(--ink);margin:0 0 6px' }, text); }
function evNum(f, key, label, help, opts){
  opts = opts || {};
  return el('div', { 'class': 'field' }, [
    evLabel(label),
    help ? el('div', { 'class': 'q-help', style: 'margin-bottom:6px' }, help) : null,
    el('input', { 'class': 'inp', type: 'number', min: '0', step: opts.step || '1', inputmode: 'decimal', value: f[key] == null ? '' : String(f[key]),
      oninput: function(e){ f[key] = e.target.value; } })
  ]);
}
function evYesNo(f, key, label, onchg){
  return el('div', { 'class': 'field' }, [
    evLabel(label),
    el('div', { style: 'display:flex;gap:18px' }, ['No', 'Yes'].map(function(o){
      return el('label', { 'class': 'radiorow', style: 'margin:0' }, [
        el('input', { type: 'radio', name: 'ev_' + key, checked: f[key] === o, onchange: function(){ f[key] = o; if (onchg) onchg(); } }),
        el('span', { style: 'font-size:14px' }, o)
      ]);
    }))
  ]);
}
function evText(f, key, label, help, long){
  return el('div', { 'class': 'field' }, [
    evLabel(label),
    help ? el('div', { 'class': 'q-help', style: 'margin-bottom:6px' }, help) : null,
    long ? el('textarea', { 'class': 'ta', rows: '3', oninput: function(e){ f[key] = e.target.value; } }, f[key] || '')
         : el('input', { 'class': 'inp', value: f[key] || '', oninput: function(e){ f[key] = e.target.value; } })
  ]);
}
function evNumVal(v){ var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function evIntVal(v){ var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }

/* ---------- near miss ---------- */
function openNearMissModal(opts){
  var shift = opts.shift || (opts.nearMiss && opts.nearMiss.shift_id ? shiftById(opts.nearMiss.shift_id) : null);
  var nm = opts.nearMiss || null;
  var worker = opts.worker || me();
  var client = clientById(nm ? nm.participant_id : (shift ? shift.client_id : null));
  var editing = !!nm;
  var f = {
    staff_name: nm ? nm.staff_name : (worker ? worker.name : ''),
    nm_date: nm ? (nm.nm_date || '') : (shift ? shift.date : todayYmd()),
    nm_time: nm ? (nm.nm_time || '') : '',
    location: nm ? nm.location : '',
    description: nm ? nm.description : '',
    prevented_by: nm ? nm.prevented_by : '',
    single_worker_capacity: nm ? (nm.single_worker_capacity ? 'Yes' : 'No') : 'No',
    equipment_factor: nm ? (nm.equipment_factor ? 'Yes' : 'No') : 'No',
    equipment_desc: nm ? (nm.equipment_desc || '') : ''
  };
  var eqDet = el('div', { style: f.equipment_factor === 'No' ? 'display:none' : '' }, evText(f, 'equipment_desc', 'Which equipment, and how it contributed'));
  var locSel = el('select', { 'class': 'sel', onchange: function(e){ f.location = e.target.value; } },
    [el('option', { value: '' }, 'Choose…')].concat(NM_LOCATIONS.map(function(l){ return el('option', { value: l, selected: f.location === l }, l); })));
  var errBox = el('div', { 'class': 'err-line', style: 'display:none;margin-bottom:8px' });
  var saveBtn = el('button', { 'class': 'btn btn-pri', onclick: save }, editing ? 'Save changes' : 'Submit near miss');
  function fail(msg){ errBox.style.display = 'block'; errBox.textContent = msg; busyBtn(saveBtn, false); }
  function save(){
    if (!f.location) return fail('Choose where it happened.');
    if (!f.description.trim()) return fail('Describe what nearly happened.');
    errBox.style.display = 'none';
    busyBtn(saveBtn, true);
    var rec = {
      staff_name: f.staff_name, nm_date: f.nm_date || null, nm_time: f.nm_time || '', location: f.location,
      description: f.description, prevented_by: f.prevented_by,
      single_worker_capacity: f.single_worker_capacity === 'Yes',
      equipment_factor: f.equipment_factor === 'Yes',
      equipment_desc: f.equipment_factor === 'Yes' ? f.equipment_desc : ''
    };
    var p;
    if (editing) {
      rec.updated_at = new Date().toISOString();
      if (PORTAL !== 'admin') rec.seen = false;
      p = sbUpd('ac_near_misses', 'id=eq.' + nm.id, rec);
    } else {
      rec.shift_id = shift ? shift.id : null;
      rec.participant_id = client ? client.id : null;
      rec.worker_id = worker ? worker.id : null;
      p = sbIns('ac_near_misses', [rec]);
    }
    p.then(function(){
      if (!editing) notifyAdmins('Near miss — ' + (client ? client.name : ''), (worker ? worker.name : 'A worker') + ': ' + f.location + '. ' + f.description.slice(0, 120));
      closeModal(); toast(editing ? 'Near miss updated' : 'Near miss recorded'); refresh();
    })["catch"](function(e){ fail(e.message); });
  }
  var body = el('div', { 'class': 'modal-body' }, [
    el('div', { 'class': 'q-help', style: 'margin-bottom:12px' }, 'A near miss is a moment where a fall or injury nearly happened but was prevented. No injury by definition. If the participant actually fell or was hurt, use an incident report instead.'),
    evText(f, 'staff_name', 'Your name'),
    el('div', { 'class': 'grid2' }, [
      el('div', { 'class': 'field' }, [ evLabel('Date'), el('input', { 'class': 'inp', type: 'date', value: f.nm_date, onchange: function(e){ f.nm_date = e.target.value; } }) ]),
      el('div', { 'class': 'field' }, [ evLabel('Approximate time'), el('input', { 'class': 'inp', type: 'time', value: f.nm_time, onchange: function(e){ f.nm_time = e.target.value; } }) ])
    ]),
    el('div', { 'class': 'field' }, [ evLabel('Where did it happen'), locSel ]),
    evText(f, 'description', 'What nearly happened', 'e.g. Tim slipped forward during the couch to wheelchair transfer and started to go down.', true),
    evText(f, 'prevented_by', 'What stopped it becoming a fall', 'e.g. The worker braced him against the wheelchair and lowered him back onto the couch.', true),
    evYesNo(f, 'single_worker_capacity', 'Was this at or beyond what one worker can safely manage alone?'),
    evYesNo(f, 'equipment_factor', 'Did equipment contribute (wheelchair, shower chair, bed, ramp)?', function(){ eqDet.style.display = f.equipment_factor === 'No' ? 'none' : ''; }),
    eqDet,
    errBox
  ]);
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, editing ? 'Edit near miss' : 'Near miss'),
        client ? el('div', { 'class': 't-cap' }, client.name + (shift ? ' · ' + fmtDate(shift.date) : '')) : null
      ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    body,
    el('div', { 'class': 'modal-foot' }, [
      editing ? el('button', { 'class': 'btn btn-danger', onclick: function(){
        confirmDlg('Delete this near miss?', 'This cannot be undone.', 'Delete', function(){
          sbDel('ac_near_misses', 'id=eq.' + nm.id).then(function(){ closeModal(); toast('Near miss deleted'); refresh(); })["catch"](function(e){ toast(e.message, true); });
        }, true);
      } }, 'Delete') : null,
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      saveBtn
    ])
  ]);
  openModal(m);
}

/* ---------- personal care log (one per shift) ---------- */
function openCareLogModal(opts){
  var shift = opts.shift;
  var worker = opts.worker || me();
  var client = clientById(shift.client_id);
  var ex = careLogForShift(shift.id);
  var f = {
    pad_wet: ex ? ex.pad_wet : '', pad_bowel: ex ? ex.pad_bowel : '', bed_wet: ex ? ex.bed_wet : '', bedding_changes: ex ? ex.bedding_changes : '',
    shower_offered: ex ? (ex.shower_offered ? 'Yes' : 'No') : (shift.type === 'sleepover' ? 'No' : 'Yes'),
    shower_done: ex ? (ex.shower_done ? 'Yes' : 'No') : 'No',
    shower_prompts: ex ? ex.shower_prompts : '',
    care_refusals: ex ? ex.care_refusals : '', transfers: ex ? ex.transfers : '', transfer_unsafe_alone: ex ? ex.transfer_unsafe_alone : ''
  };
  var showerDet = el('div', { style: f.shower_offered === 'No' ? 'display:none' : '' }, [
    evYesNo(f, 'shower_done', 'Was the shower done?'),
    evNum(f, 'shower_prompts', 'How many prompts before Tim agreed to the shower', 'Count each time it was offered or he was encouraged before he accepted. If he declined altogether, enter the number of prompts made.')
  ]);
  var errBox = el('div', { 'class': 'err-line', style: 'display:none;margin-bottom:8px' });
  var saveBtn = el('button', { 'class': 'btn btn-pri', onclick: save }, ex ? 'Save changes' : 'Save care log');
  function fail(msg){ errBox.style.display = 'block'; errBox.textContent = msg; busyBtn(saveBtn, false); }
  function save(){
    if (f.pad_wet === '' && f.pad_bowel === '' && f.transfers === '') return fail('Enter at least the pad changes and transfers for this shift (0 is fine).');
    errBox.style.display = 'none';
    busyBtn(saveBtn, true);
    var rec = {
      pad_wet: evIntVal(f.pad_wet), pad_bowel: evIntVal(f.pad_bowel), bed_wet: evIntVal(f.bed_wet), bedding_changes: evIntVal(f.bedding_changes),
      shower_offered: f.shower_offered === 'Yes', shower_done: f.shower_offered === 'Yes' && f.shower_done === 'Yes',
      shower_prompts: f.shower_offered === 'Yes' ? evIntVal(f.shower_prompts) : 0,
      care_refusals: evIntVal(f.care_refusals), transfers: evIntVal(f.transfers), transfer_unsafe_alone: evIntVal(f.transfer_unsafe_alone),
      updated_at: new Date().toISOString()
    };
    var p;
    if (ex) p = sbUpd('ac_care_logs', 'id=eq.' + ex.id, rec);
    else { rec.shift_id = shift.id; rec.participant_id = shift.client_id; rec.worker_id = worker ? worker.id : null; delete rec.updated_at; p = sbIns('ac_care_logs', [rec]); }
    p.then(function(){ closeModal(); toast('Care log saved'); refresh(); })["catch"](function(e){ fail(e.message); });
  }
  var body = el('div', { 'class': 'modal-body' }, [
    el('div', { 'class': 'q-help', style: 'margin-bottom:12px' }, 'Numbers only, for this shift. These build the personal care and manual handling picture in the reports.'),
    el('div', { 'class': 't-label', style: 'margin-bottom:8px' }, 'Continence'),
    el('div', { 'class': 'grid2' }, [
      evNum(f, 'pad_wet', 'Pad changes (wet)'),
      evNum(f, 'pad_bowel', 'Pad changes (bowel movement)')
    ]),
    el('div', { 'class': 'grid2' }, [
      evNum(f, 'bed_wet', 'Times found wet in bed'),
      evNum(f, 'bedding_changes', 'Bedding changes')
    ]),
    el('div', { 'class': 't-label', style: 'margin:6px 0 8px' }, 'Shower'),
    evYesNo(f, 'shower_offered', 'Was a shower offered this shift?', function(){ showerDet.style.display = f.shower_offered === 'No' ? 'none' : ''; }),
    showerDet,
    el('div', { 'class': 't-label', style: 'margin:6px 0 8px' }, 'Refusals and manual handling'),
    evNum(f, 'care_refusals', 'Other care refusals needing prompting', 'Times Tim declined personal care (pad change, clothing change, toileting) and had to be prompted before accepting.'),
    el('div', { 'class': 'grid2' }, [
      evNum(f, 'transfers', 'Assisted transfers this shift', 'Every couch, wheelchair, bed, toilet, shower chair and vehicle transfer.'),
      evNum(f, 'transfer_unsafe_alone', 'Transfers one worker could not do safely alone', 'Times you needed a second person, or could only manage with real difficulty or risk.')
    ]),
    errBox
  ]);
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, 'Personal care log'),
        el('div', { 'class': 't-cap' }, (client ? client.name : '') + ' · ' + fmtDate(shift.date) + ' · ' + fmtRange(shift.start_t, shift.end_t))
      ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    body,
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'), saveBtn ])
  ]);
  openModal(m);
}

/* ---------- overnight summary (sleepover shifts; hours inside the 11pm–7am block) ---------- */
function openOvernightModal(opts){
  var shift = opts.shift;
  var worker = opts.worker || me();
  var client = clientById(shift.client_id);
  var ex = overnightLogForShift(shift.id);
  var f = {
    bed_time: ex ? ex.bed_time : '', wake_time: ex ? ex.wake_time : '', wakes: ex ? ex.wakes : '',
    asleep_hours: ex ? ex.asleep_hours : '', active_hours: ex ? ex.active_hours : ''
  };
  var remain = el('div', { 'class': 'q-help', style: 'margin:-4px 0 12px' });
  function updRemain(){
    var a = evNumVal(f.asleep_hours), x = evNumVal(f.active_hours), r = Math.round((8 - a - x) * 100) / 100;
    remain.textContent = (a || x) ? ('Sleepover block is 8 hours: ' + hrsFmt(a) + ' h asleep + ' + hrsFmt(x) + ' h active support' + (r > 0.001 ? ' + ' + hrsFmt(r) + ' h awake without assistance' : '') + (r < -0.001 ? ' — that is more than 8 hours, please check.' : '')) : '';
  }
  var errBox = el('div', { 'class': 'err-line', style: 'display:none;margin-bottom:8px' });
  var saveBtn = el('button', { 'class': 'btn btn-pri', onclick: save }, ex ? 'Save changes' : 'Save overnight summary');
  function fail(msg){ errBox.style.display = 'block'; errBox.textContent = msg; busyBtn(saveBtn, false); }
  function save(){
    if (!f.bed_time || !f.wake_time) return fail('Enter the bed time and the time he was up for the day.');
    if (f.asleep_hours === '' || f.active_hours === '') return fail('Enter the asleep and active hours from the sleep log.');
    var a = evNumVal(f.asleep_hours), x = evNumVal(f.active_hours);
    if (a + x > 8.01) return fail('Asleep plus active hours cannot be more than the 8-hour block (11pm to 7am).');
    errBox.style.display = 'none';
    busyBtn(saveBtn, true);
    var rec = { bed_time: f.bed_time, wake_time: f.wake_time, wakes: evIntVal(f.wakes), asleep_hours: a, active_hours: x, updated_at: new Date().toISOString() };
    var p;
    if (ex) p = sbUpd('ac_overnight_logs', 'id=eq.' + ex.id, rec);
    else { rec.shift_id = shift.id; rec.participant_id = shift.client_id; rec.worker_id = worker ? worker.id : null; delete rec.updated_at; p = sbIns('ac_overnight_logs', [rec]); }
    p.then(function(){ closeModal(); toast('Overnight summary saved'); refresh(); })["catch"](function(e){ fail(e.message); });
  }
  var asleepIn = evNum(f, 'asleep_hours', 'Hours asleep (✓ blocks × 15 min)', null, { step: '0.25' });
  var activeIn = evNum(f, 'active_hours', 'Hours of active support (X blocks × 15 min)', null, { step: '0.25' });
  asleepIn.querySelector('input').addEventListener('input', updRemain);
  activeIn.querySelector('input').addEventListener('input', updRemain);
  updRemain();
  var body = el('div', { 'class': 'modal-body' }, [
    el('div', { 'class': 'q-help', style: 'margin-bottom:12px' }, 'Copy these from your paper sleep log for the 11:00pm to 7:00am block. The sleepover rate includes 2 hours of active support; anything above that is what the reports show.'),
    el('div', { 'class': 'grid2' }, [
      el('div', { 'class': 'field' }, [ evLabel('Went to bed at'), el('input', { 'class': 'inp', type: 'time', value: f.bed_time, onchange: function(e){ f.bed_time = e.target.value; } }) ]),
      el('div', { 'class': 'field' }, [ evLabel('Up for the day at'), el('input', { 'class': 'inp', type: 'time', value: f.wake_time, onchange: function(e){ f.wake_time = e.target.value; } }) ])
    ]),
    evNum(f, 'wakes', 'Number of times he woke needing support before he was up for the day'),
    el('div', { 'class': 'grid2' }, [ asleepIn, activeIn ]),
    remain,
    errBox
  ]);
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, 'Overnight summary'),
        el('div', { 'class': 't-cap' }, (client ? client.name : '') + ' · night of ' + fmtDate(shift.date))
      ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    body,
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'), saveBtn ])
  ]);
  openModal(m);
}

/* ================= admin: reports ================= */
function rpKpi(v, l, cls){ return el('div', { 'class': 'rp-kpi' }, [ el('div', { 'class': 'v', style: cls ? 'color:var(--' + cls + ')' : '' }, v), el('div', { 'class': 'l' }, l) ]); }
function rpCard(title, sub, children){ return el('div', { 'class': 'rp-card' }, [ el('h4', null, title), sub ? el('div', { 'class': 'rp-sub' }, sub) : null ].concat(children)); }
function rpHBars(rows, max, cls){
  if (!rows.length) return el('div', { 'class': 'notice' }, 'Nothing recorded in this period.');
  var m = max || Math.max.apply(null, rows.map(function(r){ return r.v; })) || 1;
  return el('div', null, rows.map(function(r){
    return el('div', { 'class': 'hb' }, [
      el('div', { 'class': 'hb-l' }, r.l),
      el('div', { 'class': 'hb-t' }, el('div', { 'class': 'hb-f ' + (r.cls || cls || ''), style: 'width:' + Math.round(r.v / m * 100) + '%' })),
      el('div', { 'class': 'hb-n' }, r.txt != null ? r.txt : String(r.v))
    ]);
  }));
}
function rpVBars(cols, max){
  /* cols: [{l, bars:[{v, cls}]}] — grouped vertical bars */
  var m = max || Math.max.apply(null, cols.map(function(c){ return Math.max.apply(null, c.bars.map(function(b){ return b.v; })); })) || 1;
  return el('div', null, [
    el('div', { 'class': 'vb' }, cols.map(function(c){
      return el('div', { 'class': 'vb-c' }, el('div', { style: 'display:flex;gap:3px;align-items:flex-end;width:100%;justify-content:center;height:100%' }, c.bars.map(function(b){
        return el('div', { 'class': 'vb-b ' + (b.cls || ''), style: 'height:' + Math.max(b.v ? 3 : 0, Math.round(b.v / m * 100)) + '%', title: b.v });
      })));
    })),
    el('div', { 'class': 'vb-x' }, cols.map(function(c){ return el('div', null, c.l); }))
  ]);
}
function rpLegend(items){
  return el('div', { style: 'display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--mut)' }, items.map(function(it){
    return el('span', { style: 'display:inline-flex;align-items:center;gap:6px' }, [ el('span', { style: 'width:10px;height:10px;border-radius:3px;background:' + it.c + ';display:inline-block' }), it.l ]);
  }));
}
function svgNode(tag, attrs, kids){
  var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.keys(attrs || {}).forEach(function(k){ n.setAttribute(k, attrs[k]); });
  (kids || []).forEach(function(k){ if (k) n.appendChild(k); });
  return n;
}
function pct(n, d){ return d ? Math.round(n / d * 100) + '%' : '—'; }
function avg(arr){ return arr.length ? arr.reduce(function(a, b){ return a + b; }, 0) / arr.length : 0; }
function sum(arr){ return arr.reduce(function(a, b){ return a + b; }, 0); }

function viewReports(main){
  var R = state.rep || (state.rep = { client: null, from: addDays(todayYmd(), -27), to: todayYmd() });
  if (!R.client) { var tim = state.data.clients.find(function(c){ return c.name === 'Tim'; }); R.client = tim ? tim.id : (state.data.clients[0] || {}).id; }
  var client = clientById(R.client);

  main.appendChild(el('div', { 'class': 'section-head', style: 'margin:6px 0 12px;flex-wrap:wrap' }, [
    el('div', { 'class': 't-display' }, 'Reports'),
    el('button', { 'class': 'btn btn-sec btn-sm rp-controls', onclick: function(){ window.print(); } }, [svgIcon(IC.file), 'Print / save as PDF'])
  ]));
  main.appendChild(el('div', { 'class': 'rp-controls', style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:6px' }, [
    el('div', { 'class': 'field', style: 'margin:0;min-width:160px' }, [ el('label', null, 'Participant'),
      el('select', { 'class': 'sel', onchange: function(e){ R.client = e.target.value; render(); } }, state.data.clients.map(function(c){ return el('option', { value: c.id, selected: c.id === R.client }, c.name); })) ]),
    el('div', { 'class': 'field', style: 'margin:0' }, [ el('label', null, 'From'), el('input', { 'class': 'inp', type: 'date', value: R.from, onchange: function(e){ R.from = e.target.value; render(); } }) ]),
    el('div', { 'class': 'field', style: 'margin:0' }, [ el('label', null, 'To'), el('input', { 'class': 'inp', type: 'date', value: R.to, onchange: function(e){ R.to = e.target.value; render(); } }) ]),
    el('div', { 'class': 'seg' }, [[27, '4 weeks'], [55, '8 weeks'], [90, '13 weeks']].map(function(p){
      return el('button', { onclick: function(){ R.from = addDays(todayYmd(), -p[0]); R.to = todayYmd(); render(); } }, p[1]);
    }))
  ]));
  main.appendChild(el('p', { 'class': 't-mut', style: 'margin:0 0 14px;font-size:14px' }, (client ? client.name : '') + ' · ' + fmtDateFull(R.from) + ' to ' + fmtDateFull(R.to) + '. Every figure below is a count from a dated worker record in this app (incident reports, near miss logs, personal care logs, overnight summaries).'));

  /* ---- gather ---- */
  function inRange(d){ return d && d >= R.from && d <= R.to; }
  var shifts = state.data.shifts.filter(function(s){ return s.client_id === R.client && inRange(s.date); });
  var byId = {}; shifts.forEach(function(s){ byId[s.id] = s; });
  var days = {}; shifts.forEach(function(s){ days[s.date] = 1; }); var nDays = Object.keys(days).length;
  var incs = state.data.incidents.filter(function(i){ return i.participant_id === R.client && inRange(i.incident_date || (i.created_at || '').slice(0, 10)); });
  var falls = incs.filter(function(i){ return i.is_fall; });
  var nms = state.data.nearMisses.filter(function(n){ return n.participant_id === R.client && inRange(n.nm_date || (n.created_at || '').slice(0, 10)); });
  var care = state.data.careLogs.filter(function(l){ return byId[l.shift_id]; });
  var nights = state.data.overnightLogs.filter(function(l){ return byId[l.shift_id]; }).map(function(l){
    return { d: byId[l.shift_id].date, asleep: evNumVal(l.asleep_hours), active: evNumVal(l.active_hours), wakes: l.wakes || 0, bed: l.bed_time, up: l.wake_time };
  }).sort(function(a, b){ return a.d < b.d ? -1 : 1; });
  var emerg = incs.filter(function(i){ return (i.emergency || []).some(function(x){ return x && x !== 'No'; }); });
  var injuries = incs.filter(function(i){ return i.injuries && i.injuries !== 'No'; });
  var secondPerson = falls.filter(function(i){ return i.second_person_needed; });
  var floorMins = sum(falls.map(function(i){ return i.minutes_on_floor || 0; }));
  var equip = incs.filter(function(i){ return i.equipment_involved || (i.incident_types || []).indexOf('Equipment failure') >= 0; }).length + nms.filter(function(n){ return n.equipment_factor; }).length;
  var over = nights.map(function(n){ return Math.max(0, n.active - 2); });
  var nightsOver = nights.filter(function(n){ return n.active > 2; }).length;

  /* ---- KPIs ---- */
  main.appendChild(el('div', { 'class': 'rp-grid' }, [
    rpKpi(String(falls.length), 'falls', falls.length ? 'bad' : null),
    rpKpi(String(nms.length), 'near misses', nms.length ? 'warnc' : null),
    rpKpi(String(secondPerson.length), 'falls needing a 2nd person'),
    rpKpi(String(emerg.length), '000 / emergency calls'),
    rpKpi(nights.length ? hrsFmt(avg(nights.map(function(n){ return n.active; }))) + ' h' : '—', 'avg active support per night (11pm–7am)'),
    rpKpi(nights.length ? pct(nightsOver, nights.length) : '—', 'nights over the 2 h sleepover allowance')
  ]));

  /* ---- weekly falls & near misses ---- */
  var weeks = []; for (var w = mondayOf(R.from); w <= R.to; w = addDays(w, 7)) weeks.push(w);
  function wk(d){ return mondayOf(d); }
  var cols = weeks.map(function(w0){
    var w1 = addDays(w0, 6);
    return { l: fmtDM(w0), bars: [
      { v: falls.filter(function(i){ return wk(i.incident_date || i.created_at.slice(0, 10)) === w0; }).length, cls: 'bad' },
      { v: nms.filter(function(n){ return wk(n.nm_date || n.created_at.slice(0, 10)) === w0; }).length, cls: 'warn' }
    ] };
  });
  main.appendChild(rpCard('Falls and near misses per week', 'Falls from incident reports; near misses from the near miss log.', [
    rpVBars(cols), rpLegend([{ c: 'var(--bad)', l: 'Falls' }, { c: 'var(--warnc)', l: 'Near misses' }])
  ]));

  /* ---- where ---- */
  var locCount = {};
  falls.forEach(function(i){ var k = i.fall_location || 'Not recorded'; locCount[k] = locCount[k] || { f: 0, n: 0 }; locCount[k].f++; });
  nms.forEach(function(n){ var k = n.location || 'Not recorded'; locCount[k] = locCount[k] || { f: 0, n: 0 }; locCount[k].n++; });
  var locRows = Object.keys(locCount).map(function(k){ return { l: k, v: locCount[k].f + locCount[k].n, txt: locCount[k].f + ' / ' + locCount[k].n }; }).sort(function(a, b){ return b.v - a.v; });
  var transferEvents = falls.filter(function(i){ return TRANSFER_LOCS.indexOf(i.fall_location) >= 0; }).length + nms.filter(function(n){ return TRANSFER_LOCS.indexOf(n.location) >= 0; }).length;
  main.appendChild(rpCard('Where falls and near misses happen', 'Count shown as falls / near misses. ' + transferEvents + ' of ' + (falls.length + nms.length) + ' events occurred during a transfer.', [ rpHBars(locRows, null, 'warn') ]));

  /* ---- overnight ---- */
  var onCard = rpCard('Overnight support inside the sleepover block (11pm to 7am)', 'Each bar is one night: grey = asleep, teal = active support, red = active support above the 2 hours included in the sleepover rate.', []);
  if (!nights.length) onCard.appendChild(el('div', { 'class': 'notice' }, 'No overnight summaries recorded in this period.'));
  else {
    var W = Math.max(320, nights.length * 26 + 40), H = 150, top = 10, bottom = 26, plotH = H - top - bottom, bw = Math.min(20, (W - 40) / nights.length - 4);
    var svg = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', style: 'max-width:100%;height:auto;display:block' });
    for (var g = 0; g <= 8; g += 2) {
      var gy = top + plotH - (g / 8) * plotH;
      svg.appendChild(svgNode('line', { x1: 30, x2: W, y1: gy, y2: gy, stroke: '#e6e2da', 'stroke-width': 1 }));
      var lbl = svgNode('text', { x: 24, y: gy + 4, 'font-size': 9, fill: '#8a857c', 'text-anchor': 'end' }); lbl.textContent = g + 'h'; svg.appendChild(lbl);
    }
    var ly = top + plotH - (2 / 8) * plotH;
    svg.appendChild(svgNode('line', { x1: 30, x2: W, y1: ly, y2: ly, stroke: '#b3261e', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }));
    nights.forEach(function(n, i){
      var x = 34 + i * ((W - 40) / nights.length);
      var hA = (Math.min(n.asleep, 8) / 8) * plotH, hX = (Math.min(n.active, 8 - n.asleep) / 8) * plotH;
      var yBase = top + plotH;
      svg.appendChild(svgNode('rect', { x: x, y: yBase - hA, width: bw, height: hA, fill: '#d9d4ca' }));
      var inAllow = Math.min(n.active, 2), overA = Math.max(0, n.active - 2);
      var hIn = (inAllow / 8) * plotH, hOver = (overA / 8) * plotH;
      svg.appendChild(svgNode('rect', { x: x, y: yBase - hA - hIn, width: bw, height: hIn, fill: '#0e7568' }));
      if (hOver > 0) svg.appendChild(svgNode('rect', { x: x, y: yBase - hA - hIn - hOver, width: bw, height: hOver, fill: '#b3261e' }));
      if (nights.length <= 16 || i % Math.ceil(nights.length / 16) === 0) {
        var t = svgNode('text', { x: x + bw / 2, y: H - 8, 'font-size': 9, fill: '#8a857c', 'text-anchor': 'middle' }); t.textContent = fmtDM(n.d); svg.appendChild(t);
      }
    });
    onCard.appendChild(svg);
    onCard.appendChild(rpLegend([{ c: '#d9d4ca', l: 'Asleep' }, { c: '#0e7568', l: 'Active support (within 2 h allowance)' }, { c: '#b3261e', l: 'Active support above the allowance' }]));
    var tbl = el('table', { 'class': 'rp-tbl', style: 'margin-top:12px' }, [
      el('tr', null, [ el('th', null, 'Nights recorded'), el('th', null, 'Avg asleep'), el('th', null, 'Avg active support'), el('th', null, 'Nights over 2 h'), el('th', null, 'Hours over the allowance (total)'), el('th', null, 'Avg wakes'), el('th', null, 'Avg time up for the day') ]),
      el('tr', null, [
        el('td', { 'class': 'n' }, String(nights.length)),
        el('td', { 'class': 'n' }, hrsFmt(avg(nights.map(function(n){ return n.asleep; }))) + ' h'),
        el('td', { 'class': 'n' }, hrsFmt(avg(nights.map(function(n){ return n.active; }))) + ' h'),
        el('td', { 'class': 'n' }, nightsOver + ' of ' + nights.length + ' (' + pct(nightsOver, nights.length) + ')'),
        el('td', { 'class': 'n' }, hrsFmt(sum(over)) + ' h'),
        el('td', { 'class': 'n' }, hrsFmt(avg(nights.map(function(n){ return n.wakes; })))),
        el('td', { 'class': 'n' }, avgTimeLabel(nights.map(function(n){ return n.up; })))
      ])
    ]);
    onCard.appendChild(el('div', { style: 'overflow-x:auto' }, tbl));
    /* wake-for-the-day distribution */
    var buckets = {};
    nights.forEach(function(n){ if (!n.up) return; var mn = tMin(n.up); var b = Math.floor(mn / 30) * 30; var k = pad2(Math.floor(b / 60)) + ':' + pad2(b % 60); buckets[k] = (buckets[k] || 0) + 1; });
    var bk = Object.keys(buckets).sort();
    if (bk.length) {
      onCard.appendChild(el('div', { 'class': 't-label', style: 'margin:14px 0 6px' }, 'What time he is up for the day'));
      onCard.appendChild(rpVBars(bk.map(function(k){ return { l: fmtTime(k), bars: [{ v: buckets[k], cls: '' }] }; })));
    }
  }
  main.appendChild(onCard);

  /* ---- personal care ---- */
  var padW = sum(care.map(function(l){ return l.pad_wet; })), padB = sum(care.map(function(l){ return l.pad_bowel; })), bedW = sum(care.map(function(l){ return l.bed_wet; })), bedC = sum(care.map(function(l){ return l.bedding_changes; }));
  var shOff = care.filter(function(l){ return l.shower_offered; }), shDone = shOff.filter(function(l){ return l.shower_done; }), shDecl = shOff.length - shDone.length;
  var promptsAvg = shOff.length ? avg(shOff.map(function(l){ return l.shower_prompts; })) : 0;
  var refusals = sum(care.map(function(l){ return l.care_refusals; })), transfers = sum(care.map(function(l){ return l.transfers; })), unsafe = sum(care.map(function(l){ return l.transfer_unsafe_alone; }));
  var careDays = {}; care.forEach(function(l){ careDays[byId[l.shift_id].date] = 1; }); var nCareDays = Object.keys(careDays).length || 1;
  function row(l, v, note){ return el('tr', null, [ el('td', null, l), el('td', { 'class': 'n' }, v), el('td', { style: 'color:var(--mut)' }, note || '') ]); }
  main.appendChild(rpCard('Personal care and manual handling load', care.length ? care.length + ' care logs across ' + Object.keys(careDays).length + ' days.' : 'No care logs recorded in this period.', care.length ? [
    el('div', { style: 'overflow-x:auto' }, el('table', { 'class': 'rp-tbl' }, [
      el('tr', null, [ el('th', null, 'Measure'), el('th', null, 'Total'), el('th', null, 'Per day') ]),
      row('Pad changes (wet + bowel)', String(padW + padB), hrsFmt((padW + padB) / nCareDays) + ' per day'),
      row('Bowel movement changes', String(padB), hrsFmt(padB / nCareDays) + ' per day'),
      row('Found wet in bed', String(bedW), bedW ? pct(care.filter(function(l){ return l.bed_wet > 0; }).length, nCareDays) + ' of days' : ''),
      row('Bedding changes', String(bedC), ''),
      row('Showers offered / done / declined', shOff.length + ' / ' + shDone.length + ' / ' + shDecl, shOff.length ? pct(shDecl, shOff.length) + ' declined' : ''),
      row('Average prompts before a shower is accepted', hrsFmt(promptsAvg), ''),
      row('Other care refusals needing prompting', String(refusals), hrsFmt(refusals / nCareDays) + ' per day'),
      row('Assisted transfers', String(transfers), hrsFmt(transfers / nCareDays) + ' per day'),
      row('Transfers one worker could not do safely alone', String(unsafe), transfers ? pct(unsafe, transfers) + ' of transfers' : '')
    ]))
  ] : []));

  /* ---- 2:1 evidence ---- */
  main.appendChild(rpCard('Evidence for a second worker (2:1)', 'Events where one worker was not enough to keep the participant safe.', [
    el('div', { style: 'overflow-x:auto' }, el('table', { 'class': 'rp-tbl' }, [
      el('tr', null, [ el('th', null, 'Measure'), el('th', null, 'Count'), el('th', null, '') ]),
      row('Falls where a second person was needed to get up', String(secondPerson.length), falls.length ? pct(secondPerson.length, falls.length) + ' of falls' : ''),
      row('Total minutes on the floor waiting for help', String(floorMins), falls.length ? 'avg ' + hrsFmt(floorMins / falls.length) + ' min per fall' : ''),
      row('000 / emergency service calls', String(emerg.length), emerg.length ? emerg.map(function(i){ return fmtDM(i.incident_date || i.created_at.slice(0, 10)); }).join(', ') : ''),
      row('Near misses at or beyond one worker\'s capacity', String(nms.filter(function(n){ return n.single_worker_capacity; }).length), nms.length ? 'of ' + nms.length + ' near misses' : ''),
      row('Falls and near misses during transfers', String(transferEvents), ''),
      row('Transfers logged as unsafe for one worker', String(unsafe), ''),
      row('Injuries recorded', String(injuries.length), ''),
      row('Equipment involved or failed', String(equip), '')
    ]))
  ]));

  main.appendChild(el('p', { 'class': 't-cap', style: 'margin:6px 0 24px' }, 'Method: figures are counts of contemporaneous records entered by the support worker on shift in Astar Care (incident reports, near miss logs, personal care logs and overnight summaries), each traceable to a dated shift. Overnight hours are measured inside the 11:00pm to 7:00am sleepover block, which includes 2 hours of active support in the NDIS sleepover price. Full shift notes are available on request.'));
}
function avgTimeLabel(times){
  var mins = times.filter(Boolean).map(function(t){ return tMin(t); });
  if (!mins.length) return '—';
  var m = Math.round(avg(mins));
  return fmtTime(pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60));
}
