/* ================= evidence logs: near miss, personal care log, overnight summary ================= */
/* These quick structured forms feed the admin Reports tab. Nothing is parsed out of
   the free-text notes — every number on a report comes from a field a worker filled. */
/* Where it happened. Places, not transfer types — whether a transfer was happening is asked
   separately (during_transfer), because a transfer can happen anywhere. The two old
   "X to Y" values are kept so records saved before 2026-09-09 still round-trip in the picker. */
var NM_LOCATIONS = ['Bed', 'Bedroom', 'Bathroom', 'Shower', 'Toilet', 'Lounge or living room',
  'Kitchen', 'Dining area', 'Hallway or doorway', 'Backyard or outside', 'Ramp or steps',
  'Vehicle', 'Community', 'Couch to wheelchair', 'Wheelchair to bed', 'Other'];
/* legacy only: used to guess "transfer-related" for rows saved before during_transfer existed */
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
/* blank stays blank: a field the worker did not answer is stored as null ("not recorded"), never as 0 */
function evIntOrNull(v){ if (v === '' || v == null) return null; var n = parseInt(v, 10); return isNaN(n) ? null : n; }
function evNumOrNull(v){ if (v === '' || v == null) return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
/* until migration 002 is applied the database still rejects null counts; fall back to 0 and say so */
function evSaveWithNullFallback(doSave, rec, zeroKeys){
  return doSave(rec)["catch"](function(e){
    if (!/null value|not-null|23502/i.test(e.message || '')) throw e;
    var rec2 = {}; Object.keys(rec).forEach(function(k){ rec2[k] = rec[k]; });
    var blanked = [];
    zeroKeys.forEach(function(k){ if (rec2[k] === null) { rec2[k] = 0; blanked.push(k); } });
    return doSave(rec2).then(function(r){
      if (blanked.length) toast('Saved. Blank answers were stored as 0 because the database update that allows "not recorded" is still pending.', true);
      return r;
    });
  });
}

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
    location_other: nm ? (nm.location_other || '') : '',
    during_transfer: nm ? (nm.during_transfer == null ? '' : (nm.during_transfer ? 'Yes' : 'No')) : '',
    description: nm ? nm.description : '',
    prevented_by: nm ? nm.prevented_by : '',
    single_worker_capacity: nm ? !!nm.single_worker_capacity : false,   // retired question (2026-09-09): historical value kept
    equipment_factor: nm ? (nm.equipment_factor ? 'Yes' : 'No') : 'No',
    equipment_desc: nm ? (nm.equipment_desc || '') : ''
  };
  var eqDet = el('div', { style: f.equipment_factor === 'No' ? 'display:none' : '' }, evText(f, 'equipment_desc', 'Which equipment, and how it contributed'));
  var locOther = el('div', { style: f.location === 'Other' ? '' : 'display:none' },
    evText(f, 'location_other', 'Say where it was'));
  var locSel = el('select', { 'class': 'sel', onchange: function(e){ f.location = e.target.value; locOther.style.display = f.location === 'Other' ? '' : 'none'; } },
    [el('option', { value: '' }, 'Choose…')].concat(NM_LOCATIONS.map(function(l){ return el('option', { value: l, selected: f.location === l }, l); })));
  var errBox = el('div', { 'class': 'err-line', style: 'display:none;margin-bottom:8px' });
  var saveBtn = el('button', { 'class': 'btn btn-pri', onclick: save }, editing ? 'Save changes' : 'Submit near miss');
  function fail(msg){ errBox.style.display = 'block'; errBox.textContent = msg; busyBtn(saveBtn, false); }
  function save(){
    if (!f.location) return fail('Choose where it happened.');
    if (f.location === 'Other' && !f.location_other.trim()) return fail('Say where it was.');
    if (f.during_transfer === '') return fail('Say whether it happened during a transfer.');
    if (!f.description.trim()) return fail('Describe what nearly happened.');
    errBox.style.display = 'none';
    busyBtn(saveBtn, true);
    var rec = {
      staff_name: f.staff_name, nm_date: f.nm_date || null, nm_time: f.nm_time || '', location: f.location,
      location_other: f.location === 'Other' ? f.location_other : '',
      during_transfer: f.during_transfer === 'Yes',
      description: f.description, prevented_by: f.prevented_by,
      single_worker_capacity: f.single_worker_capacity,
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
    locOther,
    evYesNo(f, 'during_transfer', 'Did it happen during a transfer?'),
    el('div', { 'class': 'q-help', style: 'margin:-6px 0 12px' }, 'A transfer is any move you assisted — bed, chair, toilet, shower, car, anywhere.'),
    evText(f, 'description', 'What nearly happened', 'e.g. Tim slipped forward during the couch to wheelchair transfer and started to go down.', true),
    evText(f, 'prevented_by', 'What stopped it becoming a fall', 'e.g. The worker braced him against the wheelchair and lowered him back onto the couch.', true),
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
      el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x))
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
  var who = client ? firstName(client.name) : 'the participant';
  function keep(v){ return v == null ? '' : v; }
  var f = {
    pad_wet: ex ? keep(ex.pad_wet) : '', pad_bowel: ex ? keep(ex.pad_bowel) : '', bed_wet: ex ? keep(ex.bed_wet) : '', bedding_changes: ex ? keep(ex.bedding_changes) : '',
    shower_offered: ex ? (ex.shower_offered ? 'Yes' : 'No') : '',
    shower_done: ex ? (ex.shower_done ? 'Yes' : 'No') : '',
    shower_prompts: ex ? keep(ex.shower_prompts) : '',
    care_refusals: ex ? keep(ex.care_refusals) : '', transfers: ex ? keep(ex.transfers) : '', transfer_unsafe_alone: ex ? keep(ex.transfer_unsafe_alone) : ''
  };
  var showerDet = el('div', { style: f.shower_offered === 'No' ? 'display:none' : '' }, [
    evYesNo(f, 'shower_done', 'Was the shower done?'),
    evNum(f, 'shower_prompts', 'How many prompts before ' + who + ' agreed to the shower', 'Count each time it was offered or ' + who + ' was encouraged before accepting. If the shower was declined altogether, enter the number of prompts made.')
  ]);
  var errBox = el('div', { 'class': 'err-line', style: 'display:none;margin-bottom:8px' });
  var saveBtn = el('button', { 'class': 'btn btn-pri', onclick: save }, ex ? 'Save changes' : 'Save care log');
  function fail(msg){ errBox.style.display = 'block'; errBox.textContent = msg; busyBtn(saveBtn, false); }
  function save(){
    if (f.pad_wet === '' && f.pad_bowel === '' && f.transfers === '') return fail('Enter at least the pad changes and transfers for this shift. Type 0 if there were none; leave a box empty only if you did not observe it.');
    if (f.shower_offered === '') return fail('Say whether a shower was offered this shift.');
    if (f.shower_offered === 'Yes' && f.shower_done === '') return fail('Say whether the shower was done.');
    errBox.style.display = 'none';
    busyBtn(saveBtn, true);
    var rec = {
      pad_wet: evIntOrNull(f.pad_wet), pad_bowel: evIntOrNull(f.pad_bowel), bed_wet: evIntOrNull(f.bed_wet), bedding_changes: evIntOrNull(f.bedding_changes),
      shower_offered: f.shower_offered === 'Yes', shower_done: f.shower_offered === 'Yes' && f.shower_done === 'Yes',
      shower_prompts: f.shower_offered === 'Yes' ? evIntOrNull(f.shower_prompts) : null,
      care_refusals: evIntOrNull(f.care_refusals), transfers: evIntOrNull(f.transfers), transfer_unsafe_alone: evIntOrNull(f.transfer_unsafe_alone),
      updated_at: new Date().toISOString()
    };
    var zeroKeys = ['pad_wet','pad_bowel','bed_wet','bedding_changes','shower_prompts','care_refusals','transfers','transfer_unsafe_alone'];
    var p;
    if (ex) p = evSaveWithNullFallback(function(r){ return sbUpd('ac_care_logs', 'id=eq.' + ex.id, r); }, rec, zeroKeys);
    else { rec.shift_id = shift.id; rec.participant_id = shift.client_id; rec.worker_id = worker ? worker.id : null; delete rec.updated_at; p = evSaveWithNullFallback(function(r){ return sbIns('ac_care_logs', [r]); }, rec, zeroKeys); }
    p.then(function(){ closeModal(); toast('Care log saved'); refresh(); })["catch"](function(e){ fail(e.message); });
  }
  var body = el('div', { 'class': 'modal-body' }, [
    el('div', { 'class': 'q-help', style: 'margin-bottom:12px' }, 'Numbers only, for this shift with ' + who + '. Type 0 when something did not happen. Leave a box empty only if you did not observe it — an empty box is recorded as "not recorded", not as 0.'),
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
    evNum(f, 'care_refusals', 'Other care refusals needing prompting', 'Times ' + who + ' declined personal care (pad change, clothing change, toileting) and had to be prompted before accepting.'),
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
      el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x))
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
  var who = client ? firstName(client.name) : 'the participant';
  var f = {
    bed_time: ex ? ex.bed_time : '', wake_time: ex ? ex.wake_time : '', wakes: ex ? (ex.wakes == null ? '' : ex.wakes) : '',
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
    var rec = { bed_time: f.bed_time, wake_time: f.wake_time, wakes: evIntOrNull(f.wakes), asleep_hours: a, active_hours: x, updated_at: new Date().toISOString() };
    var p;
    if (ex) p = evSaveWithNullFallback(function(r){ return sbUpd('ac_overnight_logs', 'id=eq.' + ex.id, r); }, rec, ['wakes']);
    else { rec.shift_id = shift.id; rec.participant_id = shift.client_id; rec.worker_id = worker ? worker.id : null; delete rec.updated_at; p = evSaveWithNullFallback(function(r){ return sbIns('ac_overnight_logs', [r]); }, rec, ['wakes']); }
    p.then(function(){ closeModal(); toast('Overnight summary saved'); refresh(); })["catch"](function(e){ fail(e.message); });
  }
  var asleepIn = evNum(f, 'asleep_hours', 'Hours asleep (✓ blocks × 15 min)', null, { step: '0.25' });
  var activeIn = evNum(f, 'active_hours', 'Hours of active support (X blocks × 15 min)', null, { step: '0.25' });
  asleepIn.querySelector('input').addEventListener('input', updRemain);
  activeIn.querySelector('input').addEventListener('input', updRemain);
  updRemain();
  var body = el('div', { 'class': 'modal-body' }, [
    el('div', { 'class': 'q-help', style: 'margin-bottom:12px' }, 'Copy these from the paper sleep log for the 11:00pm to 7:00am block. "Active support" means the intervals you were assisting ' + who + ' (X blocks) — not time ' + who + ' was awake without needing you.'),
    el('div', { 'class': 'grid2' }, [
      el('div', { 'class': 'field' }, [ evLabel('Went to bed at'), el('input', { 'class': 'inp', type: 'time', value: f.bed_time, onchange: function(e){ f.bed_time = e.target.value; } }) ]),
      el('div', { 'class': 'field' }, [ evLabel('Up for the day at'), el('input', { 'class': 'inp', type: 'time', value: f.wake_time, onchange: function(e){ f.wake_time = e.target.value; } }) ])
    ]),
    evNum(f, 'wakes', 'Number of times ' + who + ' woke needing support before being up for the day', 'Type 0 if there were none. Leave empty if you do not know.'),
    el('div', { 'class': 'grid2' }, [ asleepIn, activeIn ]),
    remain,
    errBox
  ]);
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, 'Overnight summary'),
        el('div', { 'class': 't-cap' }, (client ? client.name : '') + ' · night of ' + fmtDate(shift.date) + ' to ' + fmtDate(addDays(shift.date, 1)))
      ]),
      el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x))
    ]),
    body,
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }), el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'), saveBtn ])
  ]);
  openModal(m);
}

/* ================= admin: reports — Support Needs Summary ================= */
/* Chart colours are validated (colour-vision safe, chroma floor, contrast):
   teal = accent series, red = falls / over allowance, amber = near misses, grey = asleep. */
var RP_C = { acc: '#0f9b8a', bad: '#c92f2f', warn: '#b8860b', dim: '#cfcac0', grid: '#e7e4de', axis: '#8a919b', ink: '#14181d' };

function rpSec(n, title, lead, kids, cls){
  return el('section', { 'class': 'rp-sec' + (cls ? ' ' + cls : '') }, [
    el('div', { 'class': 'rp-sec-h' }, [
      el('span', { 'class': 'rp-num' }, String(n)),
      el('div', { style: 'min-width:0' }, [ el('h3', { 'class': 'rp-h3' }, title), lead ? el('p', { 'class': 'rp-lead' }, lead) : null ])
    ])
  ].concat(kids || []));
}
function rpEmpty(text, hint){ return el('div', { 'class': 'rp-empty' }, [ el('b', null, text), hint ? el('div', null, hint) : null ]); }
function rpTile(label, value, ctx){ return el('div', { 'class': 'rp-kpi' }, [ el('div', { 'class': 'l' }, label), el('div', { 'class': 'v' }, value), el('div', { 'class': 'c' }, ctx || '') ]); }
function rpLegend(items){
  return el('div', { 'class': 'rp-legend' }, items.map(function(it){ return el('span', null, [ el('i', { style: 'background:' + it.c }), it.l ]); }));
}
function rpSub(text){ return el('div', { 'class': 'rp-sub' }, text); }
function rpTable(head, rows){
  return el('div', { 'class': 'rp-tbl-wrap' }, el('table', { 'class': 'rp-tbl' }, [
    el('thead', null, el('tr', null, head.map(function(h){ return el('th', { 'class': h.n ? 'n' : '', scope: 'col' }, h.t || h); }))),
    el('tbody', null, rows.map(function(r){
      return el('tr', null, r.map(function(c){
        if (c && typeof c === 'object' && !c.nodeType) return el('td', { 'class': (c.n ? 'n' : '') + (c.m ? ' m' : '') }, c.t);
        return el('td', null, c == null ? '' : c);
      }));
    }))
  ]));
}
function svgNode(tag, attrs, kids){
  var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.keys(attrs || {}).forEach(function(k){ n.setAttribute(k, attrs[k]); });
  (kids || []).forEach(function(k){ if (k) n.appendChild(k); });
  return n;
}
function svgText(x, y, txt, attrs){
  var a = { x: x, y: y, 'font-size': 11, fill: RP_C.axis };
  Object.keys(attrs || {}).forEach(function(k){ a[k] = attrs[k]; });
  var t = svgNode('text', a); t.textContent = txt; return t;
}
function svgTitle(node, txt){ var t = svgNode('title'); t.textContent = txt; node.appendChild(t); return node; }
function roundTopPath(x, y, w, h, r){
  r = Math.min(r, w / 2, h);
  return 'M' + x + ',' + (y + h) + ' L' + x + ',' + (y + r) + ' Q' + x + ',' + y + ' ' + (x + r) + ',' + y +
    ' L' + (x + w - r) + ',' + y + ' Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + ' L' + (x + w) + ',' + (y + h) + ' Z';
}
function rpNiceMax(v){
  if (v <= 4) return 4;
  if (v <= 8) return 8;
  var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / p;
  return (f <= 2 ? 2 : (f <= 5 ? 5 : 10)) * p;
}
function pct(n, d){ return d ? Math.round(n / d * 100) + '%' : '—'; }
function avg(arr){ return arr.length ? arr.reduce(function(a, b){ return a + b; }, 0) / arr.length : 0; }
function sum(arr){ return arr.reduce(function(a, b){ return a + b; }, 0); }

/* Column chart (grouped or stacked). groups: [{label, vals:[...]}]; series: [{name, color}].
   opts: stacked, yMax, unit ('h' or ''), ref {v, label}, capLabel(group) -> text|null, height */
function rpColumns(groups, series, opts){
  opts = opts || {};
  var n = groups.length, W = 720, H = opts.height || 210, padL = 38, padR = 14, top = 22, bottom = 28;
  var plotW = W - padL - padR, plotH = H - top - bottom;
  var maxV = 0;
  groups.forEach(function(g){ var t = opts.stacked ? sum(g.vals) : Math.max.apply(null, g.vals); if (t > maxV) maxV = t; });
  var yMax = opts.yMax || rpNiceMax(maxV || 1), step = yMax / 4;
  var svg = svgNode('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', 'class': 'rp-svg', role: 'img' });
  function yOf(v){ return top + plotH - v / yMax * plotH; }
  for (var i = 0; i <= 4; i++) {
    var v = step * i, y = yOf(v);
    svg.appendChild(svgNode('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: i === 0 ? RP_C.axis : RP_C.grid, 'stroke-width': 1 }));
    var tick = (Math.round(v * 100) / 100) + (opts.unit === 'h' ? ' h' : '');
    if (opts.unit === 'h' || v === Math.round(v)) svg.appendChild(svgText(padL - 8, y + 4, tick, { 'text-anchor': 'end' }));
  }
  var slot = plotW / n, k = opts.stacked ? 1 : series.length;
  var bw = Math.min(24, Math.max(5, (slot - 10) / k - 2));
  var groupW = k * bw + (k - 1) * 2;
  var every = n <= 14 ? 1 : Math.ceil(n / 14);
  groups.forEach(function(g, gi){
    var x0 = padL + gi * slot + (slot - groupW) / 2, base = top + plotH, topY = base;
    if (opts.stacked) {
      var acc = 0, topIdx = -1;
      g.vals.forEach(function(v, si){ if (v > 0) topIdx = si; });
      g.vals.forEach(function(v, si){
        if (!(v > 0)) return;
        var y1 = yOf(acc + v), y0 = yOf(acc), h = y0 - y1;
        var gap = si === topIdx ? 0 : 2; /* 2px surface gap between stacked segments */
        var node = si === topIdx
          ? svgNode('path', { d: roundTopPath(x0, y1, bw, h, 4), fill: series[si].color })
          : svgNode('rect', { x: x0, y: y1 + gap, width: bw, height: Math.max(0, h - gap), fill: series[si].color });
        svgTitle(node, g.label + ' · ' + series[si].name + ': ' + (Math.round(v * 100) / 100) + (opts.unit === 'h' ? ' h' : ''));
        svg.appendChild(node);
        acc += v; topY = y1;
      });
    } else {
      g.vals.forEach(function(v, si){
        var x = x0 + si * (bw + 2);
        if (!(v > 0)) return;
        var y1 = yOf(v), h = base - y1;
        var node = svgNode('path', { d: roundTopPath(x, y1, bw, h, 4), fill: series[si].color });
        svgTitle(node, g.label + ' · ' + series[si].name + ': ' + v);
        svg.appendChild(node);
        if (y1 < topY) topY = y1;
      });
    }
    var cap = opts.capLabel ? opts.capLabel(g, gi) : null;
    if (cap) svg.appendChild(svgText(x0 + groupW / 2, topY - 7, cap, { 'text-anchor': 'middle', fill: RP_C.ink, 'font-weight': 600 }));
    if (gi % every === 0) svg.appendChild(svgText(x0 + groupW / 2, H - 9, g.label, { 'text-anchor': 'middle' }));
  });
  if (opts.ref) {
    var ry = yOf(opts.ref.v);
    svg.appendChild(svgNode('line', { x1: padL, x2: W - padR, y1: ry, y2: ry, stroke: RP_C.bad, 'stroke-width': 1.5 }));
    svg.appendChild(svgText(W - padR, ry - 6, opts.ref.label, { 'text-anchor': 'end', fill: RP_C.bad, 'font-weight': 600 }));
  }
  return el('div', { 'class': 'rp-fig' }, svg);
}

/* Horizontal stacked bars: rows [{l, segs:[{v, c, name}]}] */
function rpHBars(rows){
  var max = Math.max.apply(null, rows.map(function(r){ return sum(r.segs.map(function(s){ return s.v; })); })) || 1;
  return el('div', { 'class': 'rp-fig' }, rows.map(function(r){
    var total = sum(r.segs.map(function(s){ return s.v; }));
    return el('div', { 'class': 'rp-hb' }, [
      el('div', { 'class': 'l' }, r.l),
      el('div', { 'class': 't' }, r.segs.filter(function(s){ return s.v > 0; }).map(function(s){
        return el('i', { style: 'width:' + (s.v / max * 100) + '%;background:' + s.c, title: r.l + ' · ' + s.name + ': ' + s.v });
      })),
      el('div', { 'class': 'n' }, String(total))
    ]);
  }));
}

/* viewReports now lives in p9b_summary.js (Summary tab) */
function avgTimeLabel(times){
  var mins = times.filter(Boolean).map(function(t){ return tMin(t); });
  if (!mins.length) return '—';
  var m = Math.round(avg(mins));
  return fmtTime(pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60));
}
