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
    el('tr', null, head.map(function(h){ return el('th', { 'class': h.n ? 'n' : '' }, h.t || h); }))
  ].concat(rows.map(function(r){
    return el('tr', null, r.map(function(c){
      if (c && typeof c === 'object' && !c.nodeType) return el('td', { 'class': (c.n ? 'n' : '') + (c.m ? ' m' : '') }, c.t);
      return el('td', null, c == null ? '' : c);
    }));
  }))));
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

function viewReports(main){
  var R = state.rep || (state.rep = { client: null, from: addDays(todayYmd(), -27), to: todayYmd() });
  if (!R.client) { var tim = state.data.clients.find(function(c){ return c.name === 'Tim'; }); R.client = tim ? tim.id : (state.data.clients[0] || {}).id; }
  var client = clientById(R.client);
  var cname = client ? client.name : '';
  var org = state.data.settings.org_name || 'Astar Health Service';

  /* ---- screen-only controls ---- */
  main.appendChild(el('div', { 'class': 'section-head rp-controls', style: 'margin:6px 0 12px;flex-wrap:wrap' }, [
    el('div', { 'class': 't-display' }, 'Reports'),
    el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
      el('button', { 'class': 'btn btn-sec btn-sm', onclick: function(){ window.print(); } }, [svgIcon(IC.file), 'Print / save as PDF']),
      el('button', { 'class': 'btn btn-pri btn-sm', onclick: openExportOptions }, [svgIcon(IC.file), 'Export'])
    ])
  ]));
  main.appendChild(el('div', { 'class': 'rp-controls', style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:18px' }, [
    el('div', { 'class': 'field', style: 'margin:0;min-width:160px' }, [ el('label', null, 'Participant'),
      el('select', { 'class': 'sel', onchange: function(e){ R.client = e.target.value; render(); } }, state.data.clients.map(function(c){ return el('option', { value: c.id, selected: c.id === R.client }, c.name); })) ]),
    el('div', { 'class': 'field', style: 'margin:0' }, [ el('label', null, 'From'), el('input', { 'class': 'inp', type: 'date', value: R.from, onchange: function(e){ R.from = e.target.value; render(); } }) ]),
    el('div', { 'class': 'field', style: 'margin:0' }, [ el('label', null, 'To'), el('input', { 'class': 'inp', type: 'date', value: R.to, onchange: function(e){ R.to = e.target.value; render(); } }) ]),
    el('div', { 'class': 'seg' }, [[27, '4 weeks'], [55, '8 weeks'], [90, '13 weeks']].map(function(p){
      return el('button', { onclick: function(){ R.from = addDays(todayYmd(), -p[0]); R.to = todayYmd(); render(); } }, p[1]);
    }))
  ]));

  /* ---- gather ---- */
  function inRange(d){ return d && d >= R.from && d <= R.to; }
  function evDate(i){ return i.incident_date || (i.created_at || '').slice(0, 10); }
  function nmDate(n){ return n.nm_date || (n.created_at || '').slice(0, 10); }
  var shifts = state.data.shifts.filter(function(s){ return s.client_id === R.client && inRange(s.date); });
  var byId = {}; shifts.forEach(function(s){ byId[s.id] = s; });
  var incs = state.data.incidents.filter(function(i){ return i.participant_id === R.client && inRange(evDate(i)); });
  var falls = incs.filter(function(i){ return i.is_fall; });
  var nms = state.data.nearMisses.filter(function(n){ return n.participant_id === R.client && inRange(nmDate(n)); });
  var care = state.data.careLogs.filter(function(l){ return byId[l.shift_id]; });
  var nights = state.data.overnightLogs.filter(function(l){ return byId[l.shift_id]; }).map(function(l){
    return { d: byId[l.shift_id].date, asleep: evNumVal(l.asleep_hours), active: evNumVal(l.active_hours), wakes: l.wakes || 0, bed: l.bed_time, up: l.wake_time };
  }).sort(function(a, b){ return a.d < b.d ? -1 : 1; });
  var emerg = incs.filter(function(i){ return (i.emergency || []).some(function(x){ return x && x !== 'No'; }); });
  var injuries = incs.filter(function(i){ return i.injuries && i.injuries !== 'No'; });
  var secondPerson = falls.filter(function(i){ return i.second_person_needed; });
  var floorMins = sum(falls.map(function(i){ return i.minutes_on_floor || 0; }));
  var equip = incs.filter(function(i){ return i.equipment_involved || (i.incident_types || []).indexOf('Equipment failure') >= 0; }).length + nms.filter(function(n){ return n.equipment_factor; }).length;
  var nmCap = nms.filter(function(n){ return n.single_worker_capacity; }).length;
  var over = nights.map(function(n){ return Math.max(0, n.active - 2); });
  var nightsOver = nights.filter(function(n){ return n.active > 2; }).length;
  var periodDays = Math.round((pd(R.to) - pd(R.from)) / 86400000) + 1;
  var transferEvents = falls.filter(function(i){ return TRANSFER_LOCS.indexOf(i.fall_location) >= 0; }).length + nms.filter(function(n){ return TRANSFER_LOCS.indexOf(n.location) >= 0; }).length;
  var totalRecords = incs.length + nms.length + care.length + nights.length;

  var doc = el('div', { 'class': 'rp-doc' });
  main.appendChild(doc);

  /* ---- masthead ---- */
  doc.appendChild(el('div', { 'class': 'rp-mast' }, [
    el('div', { 'class': 'rp-eyebrow' }, org + ' · Support needs summary'),
    el('h2', null, cname),
    el('p', { 'class': 'rp-period' }, fmtDateFull(R.from) + ' to ' + fmtDateFull(R.to) + ' · ' + periodDays + ' days'),
    el('div', { 'class': 'rp-meta' }, [
      el('div', null, [ el('div', { 'class': 'k' }, 'Shifts in period'), el('div', { 'class': 'v' }, String(shifts.length)) ]),
      el('div', null, [ el('div', { 'class': 'k' }, 'Records this report is built from'), el('div', { 'class': 'v' }, totalRecords + ' · ' + incs.length + ' incident, ' + nms.length + ' near miss, ' + care.length + ' care, ' + nights.length + ' overnight') ]),
      el('div', null, [ el('div', { 'class': 'k' }, 'Prepared'), el('div', { 'class': 'v' }, fmtDateFull(todayYmd())) ]),
      el('div', null, [ el('div', { 'class': 'k' }, 'Prepared by'), el('div', { 'class': 'v' }, org) ])
    ])
  ]));

  /* ---- 1. at a glance ---- */
  doc.appendChild(rpSec(1, 'At a glance',
    'The headline figures for the period. Every number is a count of dated records the support worker entered on shift, never an estimate.', [
    el('div', { 'class': 'rp-grid' }, [
      rpTile('Falls', String(falls.length), falls.length ? secondPerson.length + ' needed a second person to get up' : 'No falls recorded in this period'),
      rpTile('Near misses', String(nms.length), nms.length ? nmCap + ' at or beyond what one worker can manage' : 'A fall or injury prevented with no harm'),
      rpTile('000 / emergency calls', String(emerg.length), emerg.length ? emerg.map(function(i){ return fmtDate(evDate(i)); }).join(', ') : 'None in this period'),
      rpTile('Minutes on the floor', String(floorMins), falls.length ? 'across ' + falls.length + ' fall' + (falls.length === 1 ? '' : 's') + ' · average ' + hrsFmt(floorMins / falls.length) + ' min' : 'No falls recorded'),
      rpTile('Active support per night', nights.length ? hrsFmt(avg(nights.map(function(n){ return n.active; }))) + ' h' : '—', nights.length ? 'average inside the 11pm to 7am block · ' + nights.length + ' night' + (nights.length === 1 ? '' : 's') + ' recorded' : 'No overnight summaries recorded'),
      rpTile('Nights over the 2 h allowance', nights.length ? pct(nightsOver, nights.length) : '—', nights.length ? nightsOver + ' of ' + nights.length + ' nights · ' + hrsFmt(sum(over)) + ' h over in total' : 'The sleepover price includes 2 h of active support')
    ])
  ]));

  /* ---- 2. weekly ---- */
  var weeks = []; for (var w = mondayOf(R.from); w <= R.to; w = addDays(w, 7)) weeks.push(w);
  var wkRows = weeks.map(function(w0){
    return { w: w0, f: falls.filter(function(i){ return mondayOf(evDate(i)) === w0; }).length, n: nms.filter(function(n){ return mondayOf(nmDate(n)) === w0; }).length };
  });
  var wkSeries = [{ name: 'Falls', color: RP_C.bad }, { name: 'Near misses', color: RP_C.warn }];
  doc.appendChild(rpSec(2, 'Falls and near misses by week',
    'Falls come from incident reports and near misses from the near miss log. Weeks start on Monday. A week with no column had no recorded events.',
    (falls.length + nms.length) ? [
      rpColumns(wkRows.map(function(r){ return { label: fmtDM(r.w), vals: [r.f, r.n] }; }), wkSeries, { capLabel: function(g){ var m = Math.max(g.vals[0], g.vals[1]); return m ? String(m) : null; } }),
      rpLegend([{ c: RP_C.bad, l: 'Falls' }, { c: RP_C.warn, l: 'Near misses' }]),
      rpTable([ 'Week commencing', { t: 'Falls', n: true }, { t: 'Near misses', n: true }, { t: 'Total', n: true } ],
        wkRows.map(function(r){ return [ fmtDateFull(r.w), { t: String(r.f), n: true }, { t: String(r.n), n: true }, { t: String(r.f + r.n), n: true } ]; })
          .concat([[ 'Period total', { t: String(falls.length), n: true }, { t: String(nms.length), n: true }, { t: String(falls.length + nms.length), n: true } ]]))
    ] : [ rpEmpty('No falls or near misses recorded', 'Workers log near misses from the shift card and falls through the incident report.') ]));

  /* ---- 3. where ---- */
  var loc = {};
  falls.forEach(function(i){ var k = i.fall_location || 'Not recorded'; loc[k] = loc[k] || { f: 0, n: 0 }; loc[k].f++; });
  nms.forEach(function(n){ var k = n.location || 'Not recorded'; loc[k] = loc[k] || { f: 0, n: 0 }; loc[k].n++; });
  var locRows = Object.keys(loc).map(function(k){ return { l: k, f: loc[k].f, n: loc[k].n }; }).sort(function(a, b){ return (b.f + b.n) - (a.f + a.n); });
  doc.appendChild(rpSec(3, 'Where falls and near misses happen',
    'Location as recorded on each incident report or near miss entry. Transfers are the moments a single worker is most stretched.',
    locRows.length ? [
      el('div', { 'class': 'rp-call' }, [ el('b', null, transferEvents + ' of ' + (falls.length + nms.length)), 'events happened during a transfer' ]),
      rpHBars(locRows.map(function(r){ return { l: r.l, segs: [ { v: r.f, c: RP_C.bad, name: 'Falls' }, { v: r.n, c: RP_C.warn, name: 'Near misses' } ] }; })),
      rpLegend([{ c: RP_C.bad, l: 'Falls' }, { c: RP_C.warn, l: 'Near misses' }]),
      rpTable([ 'Location', { t: 'Falls', n: true }, { t: 'Near misses', n: true }, 'During a transfer' ],
        locRows.map(function(r){ return [ r.l, { t: String(r.f), n: true }, { t: String(r.n), n: true }, { t: TRANSFER_LOCS.indexOf(r.l) >= 0 ? 'Yes' : '', m: true } ]; }))
    ] : [ rpEmpty('No locations to show', 'Locations appear here once a fall or near miss has been recorded.') ]));

  /* ---- 4. overnight ---- */
  var onKids = [];
  if (!nights.length) onKids.push(rpEmpty('No overnight summaries recorded', 'The sleepover worker fills the overnight summary from the shift card after each night.'));
  else {
    var onSeries = [{ name: 'Asleep', color: RP_C.dim }, { name: 'Active support within the 2 h allowance', color: RP_C.acc }, { name: 'Active support above the allowance', color: RP_C.bad }];
    onKids.push(rpColumns(nights.map(function(n){
      var inA = Math.min(n.active, 2), ov = Math.max(0, n.active - 2);
      return { label: fmtDM(n.d), vals: [ Math.min(n.asleep, 8), Math.min(inA, Math.max(0, 8 - n.asleep)), Math.min(ov, Math.max(0, 8 - n.asleep - inA)) ], over: ov };
    }), onSeries, { stacked: true, yMax: 8, unit: 'h', ref: { v: 2, label: '2 h included in the sleepover rate' }, capLabel: function(g){ return g.over > 0 ? '+' + hrsFmt(g.over) + ' h' : null; } }));
    onKids.push(rpLegend(onSeries.map(function(s){ return { c: s.color, l: s.name }; })));
    onKids.push(el('div', { 'class': 'rp-mini' }, [
      [ 'Nights recorded', String(nights.length) ],
      [ 'Average asleep', hrsFmt(avg(nights.map(function(n){ return n.asleep; }))) + ' h' ],
      [ 'Average active support', hrsFmt(avg(nights.map(function(n){ return n.active; }))) + ' h' ],
      [ 'Nights over 2 h', nightsOver + ' of ' + nights.length + ' (' + pct(nightsOver, nights.length) + ')' ],
      [ 'Hours over the allowance', hrsFmt(sum(over)) + ' h' ],
      [ 'Average wakes before up', hrsFmt(avg(nights.map(function(n){ return n.wakes; }))) ],
      [ 'Average bed time', avgTimeLabel(nights.map(function(n){ return n.bed; })) ],
      [ 'Average up for the day', avgTimeLabel(nights.map(function(n){ return n.up; })) ]
    ].map(function(p){ return el('div', null, [ el('div', { 'class': 'k' }, p[0]), el('div', { 'class': 'v' }, p[1]) ]); })));
    var buckets = {};
    nights.forEach(function(n){ if (!n.up) return; var b = Math.floor(tMin(n.up) / 30) * 30; var k = pad2(Math.floor(b / 60)) + ':' + pad2(b % 60); buckets[k] = (buckets[k] || 0) + 1; });
    var bk = Object.keys(buckets).sort();
    if (bk.length) {
      onKids.push(rpSub('What time ' + firstName(cname) + ' is up for the day (nights per half hour)'));
      onKids.push(rpColumns(bk.map(function(k){ return { label: fmtTime(k), vals: [buckets[k]] }; }), [{ name: 'Nights', color: RP_C.acc }], { height: 160, capLabel: function(g){ return String(g.vals[0]); } }));
    }
    onKids.push(rpSub('Night by night'));
    onKids.push(rpTable([ 'Night', 'Bed', 'Up for the day', { t: 'Wakes', n: true }, { t: 'Asleep', n: true }, { t: 'Active', n: true }, { t: 'Over 2 h', n: true } ],
      nights.map(function(n){ return [ fmtDate(n.d), n.bed ? fmtTime(n.bed) : '—', n.up ? fmtTime(n.up) : '—', { t: String(n.wakes), n: true }, { t: hrsFmt(n.asleep) + ' h', n: true }, { t: hrsFmt(n.active) + ' h', n: true }, { t: n.active > 2 ? '+' + hrsFmt(n.active - 2) + ' h' : '—', n: true } ]; })));
  }
  doc.appendChild(rpSec(4, 'Overnight support inside the sleepover block (11pm to 7am)',
    'The NDIS sleepover price includes up to 2 hours of active support a night. Each column is one night: grey is time asleep, teal is active support within the allowance, red is active support above it.', onKids, 'rp-sec-long'));

  /* ---- 5. personal care ---- */
  var padW = sum(care.map(function(l){ return l.pad_wet; })), padB = sum(care.map(function(l){ return l.pad_bowel; })), bedW = sum(care.map(function(l){ return l.bed_wet; })), bedC = sum(care.map(function(l){ return l.bedding_changes; }));
  var shOff = care.filter(function(l){ return l.shower_offered; }), shDone = shOff.filter(function(l){ return l.shower_done; }), shDecl = shOff.length - shDone.length;
  var promptsAvg = shOff.length ? avg(shOff.map(function(l){ return l.shower_prompts; })) : 0;
  var refusals = sum(care.map(function(l){ return l.care_refusals; })), transfers = sum(care.map(function(l){ return l.transfers; })), unsafe = sum(care.map(function(l){ return l.transfer_unsafe_alone; }));
  var careDays = {}; care.forEach(function(l){ careDays[byId[l.shift_id].date] = 1; }); var nCareDays = Object.keys(careDays).length || 1;
  function pd1(v){ return { t: hrsFmt(v / nCareDays), n: true }; }
  doc.appendChild(rpSec(5, 'Personal care and manual handling load',
    care.length ? 'From ' + care.length + ' personal care logs across ' + Object.keys(careDays).length + ' day' + (Object.keys(careDays).length === 1 ? '' : 's') + '. Per-day figures divide by the days that have a log.' : 'One personal care log is expected per shift.',
    care.length ? [
      rpTable([ 'Measure', { t: 'Total', n: true }, { t: 'Per day', n: true }, 'Note' ], [
        [ 'Pad changes (wet and bowel)', { t: String(padW + padB), n: true }, pd1(padW + padB), '' ],
        [ 'Bowel movement changes', { t: String(padB), n: true }, pd1(padB), '' ],
        [ 'Found wet in bed', { t: String(bedW), n: true }, pd1(bedW), { t: bedW ? pct(care.filter(function(l){ return l.bed_wet > 0; }).length, nCareDays) + ' of days' : '', m: true } ],
        [ 'Bedding changes', { t: String(bedC), n: true }, pd1(bedC), '' ],
        [ 'Showers offered / done / declined', { t: shOff.length + ' / ' + shDone.length + ' / ' + shDecl, n: true }, { t: '', n: true }, { t: shOff.length ? pct(shDecl, shOff.length) + ' declined at first' : '', m: true } ],
        [ 'Prompts before a shower is accepted', { t: hrsFmt(promptsAvg), n: true }, { t: '', n: true }, { t: 'average', m: true } ],
        [ 'Other care refusals needing prompting', { t: String(refusals), n: true }, pd1(refusals), '' ],
        [ 'Assisted transfers', { t: String(transfers), n: true }, pd1(transfers), '' ],
        [ 'Transfers one worker could not do safely alone', { t: String(unsafe), n: true }, pd1(unsafe), { t: transfers ? pct(unsafe, transfers) + ' of transfers' : '', m: true } ]
      ])
    ] : [ rpEmpty('No personal care logs recorded', 'Workers fill the care log from the shift card. Pad changes, showers, prompting and transfers appear here once logged.') ]));

  /* ---- 6. 2:1 ---- */
  doc.appendChild(rpSec(6, 'Evidence for a second worker (2:1)',
    'Events where one worker was not enough to keep ' + firstName(cname) + ' safe, drawn from the same records as the sections above.', [
    rpTable([ 'Measure', { t: 'Count', n: true }, 'Context' ], [
      [ 'Falls where a second person was needed to get up', { t: String(secondPerson.length), n: true }, { t: falls.length ? pct(secondPerson.length, falls.length) + ' of falls' : 'no falls recorded', m: true } ],
      [ 'Minutes on the floor waiting for help', { t: String(floorMins), n: true }, { t: falls.length ? 'average ' + hrsFmt(floorMins / falls.length) + ' min per fall' : '', m: true } ],
      [ '000 / emergency service calls', { t: String(emerg.length), n: true }, { t: emerg.length ? emerg.map(function(i){ return fmtDate(evDate(i)); }).join(', ') : '', m: true } ],
      [ 'Near misses at or beyond one worker’s capacity', { t: String(nmCap), n: true }, { t: nms.length ? 'of ' + nms.length + ' near misses' : '', m: true } ],
      [ 'Falls and near misses during a transfer', { t: String(transferEvents), n: true }, { t: (falls.length + nms.length) ? pct(transferEvents, falls.length + nms.length) + ' of events' : '', m: true } ],
      [ 'Transfers logged as unsafe for one worker', { t: String(unsafe), n: true }, { t: transfers ? pct(unsafe, transfers) + ' of ' + transfers + ' transfers' : '', m: true } ],
      [ 'Injuries recorded', { t: String(injuries.length), n: true }, '' ],
      [ 'Equipment involved or failed', { t: String(equip), n: true }, { t: 'wheelchair, shower chair, bed or hoist', m: true } ]
    ])
  ]));

  /* ---- method ---- */
  doc.appendChild(el('div', { 'class': 'rp-method' }, [
    el('b', null, 'How to read this report. '),
    'Every figure is a count of contemporaneous records entered by the support worker on shift in Astar Care (incident reports, near miss logs, personal care logs and overnight summaries), each traceable to a dated shift. Nothing is extracted or inferred from the free-text shift notes. Overnight hours are measured inside the 11:00pm to 7:00am sleepover block, which includes 2 hours of active support in the NDIS sleepover price. Periods with no records show as empty rather than as zero events. Full shift notes and the underlying records are available on request.'
  ]));
  doc.appendChild(el('div', { 'class': 'rp-foot' }, [ el('span', null, org + ' · Support needs summary · ' + cname), el('span', null, fmtDateFull(R.from) + ' to ' + fmtDateFull(R.to) + ' · prepared ' + fmtDateFull(todayYmd())) ]));
}
function avgTimeLabel(times){
  var mins = times.filter(Boolean).map(function(t){ return tMin(t); });
  if (!mins.length) return '—';
  var m = Math.round(avg(mins));
  return fmtTime(pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60));
}
