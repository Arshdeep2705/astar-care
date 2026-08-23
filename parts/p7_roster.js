/* ================= admin: roster ================= */
function rosterDays(){
  var r = state.roster;
  var n = r.range === 'week' ? 7 : (r.range === 'fortnight' ? 14 : 28);
  var days = [];
  for (var i = 0; i < n; i++) days.push(addDays(r.anchor, i));
  return days;
}
function reqRows(){
  var rows = [];
  state.data.reqs.forEach(function(rq){
    var c = clientById(rq.client_id);
    if (!c) return;
    if (state.roster.client !== 'all' && c.id !== state.roster.client) return;
    rows.push({ req: rq, client: c });
  });
  rows.sort(function(a,b){
    if (a.client.name !== b.client.name) return a.client.name < b.client.name ? -1 : 1;
    return tMin(a.req.start_t) - tMin(b.req.start_t);
  });
  return rows;
}
function shiftFor(reqId, date){
  return state.data.shifts.find(function(s){ return s.req_id === reqId && s.date === date; });
}
/* one roster row per client — a client with several requirements (e.g. Tim's
   day shift + sleepover) gets its chips stacked in the same cell */
function clientRowGroups(){
  var groups = [];
  reqRows().forEach(function(row){
    var g = groups.find(function(x){ return x.client.id === row.client.id; });
    if (!g) { g = { client: row.client, reqs: [] }; groups.push(g); }
    g.reqs.push(row.req);
  });
  return groups;
}

function viewRoster(main){
  var days = rosterDays();
  var rows = reqRows();
  var t = todayYmd();

  /* make sure the admin actually turns notifications on — the bell alone is easy to miss */
  if (pushSupported() && !pushEnabled() && !localStorage.getItem('ac_push_dismiss_admin')) {
    main.appendChild(el('div', { 'class': 'banner acc', style: 'margin:6px 0 18px' }, [
      el('div', { style: 'color:var(--acc);flex:none;margin-top:2px' }, svgIcon(IC.bell)),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('b', { style: 'font-size:14px' }, 'Get notified when workers message you'),
        el('div', { 'class': 't-cap', style: 'margin-top:2px' }, 'Urgent messages and availability changes pop up on this device like normal app notifications. You get a test notification straight away.'),
        el('div', { style: 'display:flex;gap:8px;margin-top:10px' }, [
          el('button', { 'class': 'btn btn-sm btn-pri', onclick: enablePush }, 'Turn on'),
          el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(){ localStorage.setItem('ac_push_dismiss_admin', '1'); render(); } }, 'Not now')
        ])
      ])
    ]));
  }

  /* stats across visible range */
  var total = 0, covered = 0, hoursReq = 0, hoursFill = 0;
  rows.forEach(function(row){
    days.forEach(function(d){
      if (row.req.days.indexOf(dow(d)) < 0) return;
      var s = shiftFor(row.req.id, d);
      total++;
      hoursReq += shiftHours(s || row.req);
      if (s && s.worker_id) { covered++; hoursFill += shiftHours(s); }
    });
  });
  var urgents = state.data.flags.filter(function(f){ return f.urgent && !f.resolved; }).length;

  main.appendChild(el('div', { 'class': 'section-head', style: 'margin:6px 0 16px;flex-wrap:wrap' }, [
    el('div', { 'class': 't-display' }, 'Roster'),
    el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
      el('button', { 'class': 'btn btn-sec btn-sm', onclick: openSendRoster }, [svgIcon(IC.send), 'Send roster'])
    ])
  ]));

  main.appendChild(el('div', { 'class': 'statgrid' }, [
    el('div', { 'class': 'stat' }, [
      el('div', { 'class': 'st-v', style: total && covered === total ? 'color:var(--ok)' : '' }, total ? Math.round(covered / total * 100) + '%' : '—'),
      el('div', { 'class': 'st-l' }, 'coverage')
    ]),
    el('div', { 'class': 'stat' }, [
      el('div', { 'class': 'st-v' }, [hrsFmt(hoursFill), el('span', { style: 'font-size:16px;color:var(--dim)' }, ' / ' + hrsFmt(hoursReq) + ' h')]),
      el('div', { 'class': 'st-l' }, 'hours filled')
    ]),
    el('div', { 'class': 'stat' }, [
      el('div', { 'class': 'st-v', style: (total - covered) ? 'color:var(--bad)' : '' }, String(total - covered)),
      el('div', { 'class': 'st-l' }, 'need cover')
    ]),
    el('div', { 'class': 'stat', style: 'cursor:pointer', onclick: function(){ state.adminTab = 'inbox'; render(); } }, [
      el('div', { 'class': 'st-v', style: urgents ? 'color:var(--warnc)' : '' }, String(urgents)),
      el('div', { 'class': 'st-l' }, 'urgent flags')
    ])
  ]));

  /* controls */
  var isCurrent = state.roster.anchor === mondayOf(t);
  main.appendChild(el('div', { 'class': 'cal-head', style: 'margin-top:20px' }, [
    el('div', { 'class': 'seg' }, [['week','Week'],['fortnight','Fortnight'],['month','Month']].map(function(p){
      return el('button', { 'class': state.roster.range === p[0] ? 'on' : '', onclick: function(){ state.roster.range = p[0]; render(); } }, p[1]);
    })),
    el('div', { style: 'display:flex;align-items:center;gap:2px' }, [
      el('button', { 'class': 'iconbtn', onclick: function(){ state.roster.anchor = addDays(state.roster.anchor, state.roster.range === 'week' ? -7 : (state.roster.range === 'fortnight' ? -14 : -28)); render(); ensureWindow(state.roster.anchor); } }, svgIcon(IC.left)),
      el('button', { 'class': 'iconbtn', onclick: function(){ state.roster.anchor = addDays(state.roster.anchor, state.roster.range === 'week' ? 7 : (state.roster.range === 'fortnight' ? 14 : 28)); render(); ensureWindow(addDays(state.roster.anchor, 27)); } }, svgIcon(IC.right))
    ]),
    el('div', { 'class': 't-sub', style: 'flex:1;min-width:120px' }, fmtDate(days[0]) + ' – ' + fmtDate(days[days.length - 1])),
    !isCurrent ? el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ state.roster.anchor = mondayOf(t); render(); } }, 'Today') : null,
    el('div', { 'class': 'seg' }, [el('button', { 'class': state.roster.client === 'all' ? 'on' : '', onclick: function(){ state.roster.client = 'all'; render(); } }, 'All')].concat(
      state.data.clients.map(function(c){
        return el('button', { 'class': state.roster.client === c.id ? 'on' : '', style: state.roster.client === c.id ? 'color:' + c.colour : '', onclick: function(){ state.roster.client = c.id; render(); } }, c.name);
      })))
  ]));

  /* grids: one 7-day grid per week, one row per client */
  var groups = clientRowGroups();
  var mobile = window.innerWidth < 860;
  for (var wk = 0; wk < days.length / 7; wk++) {
    var wkDays = days.slice(wk * 7, wk * 7 + 7);
    if (mobile) main.appendChild(rosterMobileWeek(wkDays, rows, t));
    else main.appendChild(rosterWeekGrid(wkDays, groups, t));
  }
}

function gapCreateShift(row, d, btn){
  if (btn) btn.disabled = true;   // guard against a double-tap creating two shifts
  var dup = shiftFor(row.req.id, d);
  if (dup) { openAssign(dup); return; }
  sbIns('ac_shifts', [{ client_id: row.client.id, req_id: row.req.id, date: d,
    start_t: row.req.start_t, end_t: row.req.end_t, type: row.req.type }])
    .then(function(rows){ state.data.shifts.push(rows[0]); openAssign(rows[0]); })
    ["catch"](function(e){ if (btn) btn.disabled = false; toast(e.message, true); });
}
function rosterChip(s, row, d){
  var pre = (s ? s.type : row.req.type) === 'sleepover' ? '☾ ' : '';
  if (!s) {
    return el('button', { 'class': 'rw-chip gap', onclick: function(e){ gapCreateShift(row, d, e.currentTarget); } }, [
      'Needs cover', el('span', { 'class': 'rc-t' }, pre + fmtTime(row.req.start_t) + '–' + fmtTime(row.req.end_t))
    ]);
  }
  var w = s.worker_id ? workerById(s.worker_id) : null;
  if (w) {
    return el('button', { 'class': 'rw-chip cov', onclick: function(){ openAdminShift(s); } }, [
      w.name, el('span', { 'class': 'rc-t' }, pre + fmtTime(s.start_t) + '–' + fmtTime(s.end_t))
    ]);
  }
  return el('button', { 'class': 'rw-chip gap', onclick: function(){ openAssign(s); } }, [
    'Needs cover', el('span', { 'class': 'rc-t' }, pre + fmtTime(s.start_t) + '–' + fmtTime(s.end_t))
  ]);
}

function rosterWeekGrid(wkDays, groups, t){
  var grid = el('div', { 'class': 'rw-grid', style: 'margin-top:14px' });
  var head = el('div', { 'class': 'rw-row rw-hidehead' });
  head.appendChild(el('div', { 'class': 'rw-rowhead' }, el('span', { 'class': 't-label' }, fmtDM(wkDays[0]) + ' – ' + fmtDM(wkDays[6]))));
  wkDays.forEach(function(d){
    head.appendChild(el('div', { 'class': 'rw-dayhead' + (d === t ? ' today' : '') }, DOW3[dow(d)] + ' ' + pd(d).getDate()));
  });
  grid.appendChild(head);
  groups.forEach(function(g){
    var tr = el('div', { 'class': 'rw-row' });
    tr.appendChild(el('div', { 'class': 'rw-rowhead' }, [
      el('div', { style: 'display:flex;align-items:center;gap:6px' }, [
        el('span', { 'class': 'dot', style: 'background:' + g.client.colour }),
        el('b', { style: 'font-size:13.5px' }, g.client.name)
      ]),
      el('span', { 'class': 't-cap' }, g.reqs.map(function(r){ return r.label; }).join(' · '))
    ]));
    wkDays.forEach(function(d){
      var cell = el('div', { 'class': 'rw-cellwrap' });
      var any = false;
      g.reqs.forEach(function(rq){
        if (rq.days.indexOf(dow(d)) < 0) return;
        any = true;
        cell.appendChild(rosterChip(shiftFor(rq.id, d), { client: g.client, req: rq }, d));
      });
      if (!any) cell.appendChild(el('div', { 'class': 'rw-chip off' }, ''));
      tr.appendChild(cell);
    });
    grid.appendChild(tr);
  });
  return grid;
}

function rosterMobileWeek(wkDays, rows, t){
  var box = el('div', { style: 'margin-top:14px;display:flex;flex-direction:column;gap:10px' });
  wkDays.forEach(function(d){
    var items = [];
    rows.forEach(function(row){
      if (row.req.days.indexOf(dow(d)) < 0) return;
      items.push({ s: shiftFor(row.req.id, d) || null, row: row });
    });
    if (!items.length) return;
    var day = el('div', { 'class': 'agenda-day' + (d === t ? ' today' : '') }, [
      el('div', { 'class': 'agenda-date' }, [
        el('div', { 'class': 'dnm' }, DOW3[dow(d)]),
        el('div', { 'class': 'dno' }, String(pd(d).getDate()))
      ]),
      el('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px' }, items.map(function(it){
        var w = it.s && it.s.worker_id ? workerById(it.s.worker_id) : null;
        var st = it.s || it.row.req;
        return el('button', { 'class': 'rw-chip ' + (w ? 'cov' : 'gap'), style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px',
          onclick: function(){
            if (w) openAdminShift(it.s);
            else if (it.s) openAssign(it.s);
            else gapCreateShift(it.row, d);
          } }, [
          el('span', null, [
            el('b', { style: 'color:' + it.row.client.colour }, it.row.client.name),
            ' · ' + (w ? w.name : 'Needs cover')
          ]),
          el('span', { 'class': 'rc-t', style: 'display:inline' }, (st.type === 'sleepover' ? '☾ ' : '') + fmtTime(st.start_t) + '–' + fmtTime(st.end_t))
        ]);
      }))
    ]);
    box.appendChild(day);
  });
  return box;
}

/* ---------- assign a worker ---------- */
function workerAvailFor(w, date){
  var wk = mondayOf(date);
  var a = state.data.avail.find(function(x){ return x.worker_id === w.id && x.week_start === wk; });
  if (!a || !a.days) return null;                 // not submitted
  return !!a.days[String(dow(date))];
}
function overlaps(s1, s2){
  var a1 = shiftStartDate(s1).getTime(), b1 = shiftEndDate(s1).getTime();
  var a2 = shiftStartDate(s2).getTime(), b2 = shiftEndDate(s2).getTime();
  return a1 < b2 && a2 < b1;
}
function doubleBooked(w, s){
  return state.data.shifts.some(function(o){
    return o.id !== s.id && o.worker_id === w.id && Math.abs(pd(o.date) - pd(s.date)) <= 86400000 * 1.5 && overlaps(o, s);
  });
}

function openAssign(s){
  var c = clientById(s.client_id);
  var cands = state.data.workers.filter(function(w){ return !w.is_admin && w.active; }).map(function(w){
    var avail = workerAvailFor(w, s.date);
    var busy = doubleBooked(w, s);
    return { w: w, avail: avail, busy: busy, rank: busy ? 2 : (avail === true ? 0 : (avail === null ? 1 : 3)) };
  }).sort(function(a,b){ return a.rank - b.rank || (a.w.name < b.w.name ? -1 : 1); });

  var m = el('div', { 'class': 'modal', style: 'max-width:460px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, 'Who covers ' + (c ? c.name : '?') + '?'),
        el('div', { 'class': 't-cap t-num' }, fmtDateFull(s.date) + ' · ' + fmtRange(s.start_t, s.end_t))
      ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 't-cap', style: 'margin-bottom:10px' }, 'Ranked by submitted availability for that day.'),
      el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, cands.map(function(cd){
        return el('button', { 'class': 'listnote', style: 'display:flex;align-items:center;gap:10px;width:100%;text-align:left', onclick: function(){
          function doAssign(){
            sbUpd('ac_shifts', 'id=eq.' + s.id, { worker_id: cd.w.id }).then(function(){
              closeModal(); toast(cd.w.name + ' assigned to ' + (c ? c.name : '')); refresh();
            })["catch"](function(e){ toast(e.message, true); });
          }
          if (cd.busy) confirmDlg('Double booking', cd.w.name + ' already has an overlapping shift that day. Assign anyway?', 'Assign anyway', doAssign, true);
          else doAssign();
        } }, [
          el('span', { 'class': 'avatar', style: 'background:' + cd.w.colour }, initials(cd.w.name)),
          el('div', { style: 'flex:1' }, [
            el('b', { style: 'font-size:14px' }, cd.w.name),
            el('div', { 'class': 't-cap' }, cd.busy ? 'Already rostered then' : (cd.avail === true ? 'Available' : (cd.avail === false ? 'Marked unavailable' : 'No availability submitted')))
          ]),
          cd.busy ? el('span', { 'class': 'tag tag-bad' }, 'Clash')
            : (cd.avail === true ? el('span', { 'class': 'tag tag-ok' }, 'Free')
            : (cd.avail === false ? el('span', { 'class': 'tag tag-warn' }, 'Unavail') : el('span', { 'class': 'tag tag-mut' }, '?')))
        ]);
      }))
    ])
  ]);
  openModal(m);
}

/* ---------- admin shift detail ---------- */
function openAdminShift(s){
  var c = clientById(s.client_id);
  var w = s.worker_id ? workerById(s.worker_id) : null;
  var clocks = clocksForShift(s.id);
  var cin = clocks.filter(function(x){ return x.kind === 'in'; }).slice(-1)[0];
  var cout = clocks.filter(function(x){ return x.kind === 'out'; }).slice(-1)[0];
  var notes = notesForShift(s.id);
  var incidents = incidentsForShift(s.id);
  var rems = remindersForShift(s.id);
  var rostered = shiftHours(s);
  var actual = (cin && cout) ? (new Date(cout.at) - new Date(cin.at)) / 3600000 : null;

  var body = el('div', { 'class': 'modal-body' });
  /* facts */
  body.appendChild(el('div', { 'class': 'card', style: 'padding:6px 16px;margin-bottom:14px;box-shadow:none;background:var(--paper);border:0' }, [
    el('div', { 'class': 'kv' }, [ el('span', { 'class': 'k' }, 'Client'), el('span', { 'class': 'v', style: 'color:' + (c ? c.colour : '') }, c ? c.name : '—') ]),
    el('div', { 'class': 'kv' }, [ el('span', { 'class': 'k' }, 'When'), el('span', { 'class': 'v' }, fmtDate(s.date) + ' · ' + fmtRange(s.start_t, s.end_t)) ]),
    el('div', { 'class': 'kv' }, [ el('span', { 'class': 'k' }, 'Duration'), el('span', { 'class': 'v' }, hrsFmt(rostered) + ' h' + (s.type === 'sleepover' ? ' · sleepover' : '')) ]),
    el('div', { 'class': 'kv' }, [ el('span', { 'class': 'k' }, 'Address'), el('span', { 'class': 'v', style: 'font-weight:400;max-width:60%;text-align:right' }, c ? c.address : '—') ])
  ]));
  /* worker */
  if (w) {
    body.appendChild(el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:14px' }, [
      el('span', { 'class': 'avatar', style: 'background:' + w.colour }, initials(w.name)),
      el('div', { style: 'flex:1' }, [ el('b', null, w.name), el('div', { 'class': 't-cap' }, w.email) ])
    ]));
  } else {
    body.appendChild(el('div', { 'class': 'banner warn', style: 'margin-bottom:14px' }, [
      el('div', { style: 'color:var(--warnc);display:flex' }, svgIcon(IC.alert)),
      el('div', { style: 'flex:1' }, [ el('b', { style: 'font-size:14px' }, 'No worker assigned'),
        el('div', null, el('button', { 'class': 'btn btn-sm btn-dark', style: 'margin-top:8px', onclick: function(){ closeModal(); openAssign(s); } }, 'Assign someone')) ])
    ]));
  }
  /* clock */
  body.appendChild(el('div', { 'class': 't-label', style: 'margin:16px 0 8px' }, 'Clock in & out'));
  if (!cin && !cout) {
    body.appendChild(el('div', { 'class': 'notice' }, shiftEnded(s) ? 'No clock records for this shift.' : 'Not clocked in yet.'));
  } else {
    var kv = el('div', { 'class': 'card', style: 'padding:6px 16px;box-shadow:none;background:var(--paper);border:0' });
    if (cin) kv.appendChild(el('div', { 'class': 'kv' }, [ el('span', { 'class': 'k' }, 'Clock in'), el('span', { 'class': 'v' }, fmtDT(cin.at) + (cin.distance_m != null ? ' · ' + Math.round(cin.distance_m) + ' m from site' : '')) ]));
    if (cout) kv.appendChild(el('div', { 'class': 'kv' }, [ el('span', { 'class': 'k' }, 'Clock out'), el('span', { 'class': 'v' }, fmtDT(cout.at) + (cout.distance_m != null ? ' · ' + Math.round(cout.distance_m) + ' m from site' : '')) ]));
    if (actual != null) {
      var varc = actual - rostered;
      kv.appendChild(el('div', { 'class': 'kv' }, [ el('span', { 'class': 'k' }, 'Worked'), el('span', { 'class': 'v' }, hrsFmt(actual) + ' h') ]));
      kv.appendChild(el('div', { 'class': 'kv' }, [ el('span', { 'class': 'k' }, 'Variance'),
        el('span', { 'class': 'v', style: Math.abs(varc) > 0.25 ? 'color:var(--warnc)' : 'color:var(--ok)' }, (varc >= 0 ? '+' : '') + hrsFmt(varc) + ' h') ]));
    }
    body.appendChild(kv);
  }
  /* notes */
  body.appendChild(el('div', { 'class': 't-label', style: 'margin:16px 0 8px' }, 'Shift notes'));
  if (!notes.length) body.appendChild(el('div', { 'class': 'notice' }, 'No note written for this shift yet.'));
  notes.forEach(function(n){
    var nw = workerById(n.worker_id);
    body.appendChild(el('button', { 'class': 'listnote', style: 'display:flex;gap:10px;width:100%;text-align:left;margin-bottom:6px', onclick: function(){ openNoteModal({ note: n, shift: s, worker: nw }); } }, [
      el('span', { style: 'color:var(--acc);display:flex;margin-top:2px' }, svgIcon(IC.note)),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('b', { style: 'font-size:13.5px' }, n.note_type + (nw ? ' · ' + nw.name : '')),
        el('div', { 'class': 't-cap', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, notePreview(n.body))
      ]),
      el('span', { 'class': 't-cap', style: 'flex:none' }, 'Read / edit')
    ]));
  });
  /* incidents */
  if (incidents.length) {
    body.appendChild(el('div', { 'class': 't-label', style: 'margin:16px 0 8px' }, 'Incident reports'));
    incidents.forEach(function(ir){
      body.appendChild(el('button', { 'class': 'listnote', style: 'display:flex;gap:10px;width:100%;text-align:left;margin-bottom:6px', onclick: function(){ openIncidentModal({ incident: ir, shift: s }); } }, [
        el('span', { style: 'color:var(--warnc);display:flex;margin-top:2px' }, svgIcon(IC.alert)),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('b', { style: 'font-size:13.5px' }, (ir.incident_types || []).join(', ') || 'Incident'),
          el('div', { 'class': 't-cap', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, ir.ticket_desc)
        ]),
        el('span', { 'class': 't-cap', style: 'flex:none' }, 'Read / edit')
      ]));
    });
  }
  /* reminders sent */
  if (rems.length) {
    body.appendChild(el('div', { 'class': 't-label', style: 'margin:16px 0 8px' }, 'Reminders sent'));
    rems.forEach(function(r){
      body.appendChild(el('div', { 'class': 'notice', style: 'margin-bottom:6px' }, [
        el('div', { style: 'white-space:pre-wrap' }, r.message),
        el('div', { 'class': 't-cap', style: 'margin-top:4px' }, fmtDT(r.created_at) + (r.acknowledged_at ? ' · seen' : ' · unread') + (r.emailed ? ' · emailed' : ''))
      ]));
    });
  }

  var needsReminder = w && shiftEnded(s) && !notes.length;
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', { 'class': 't-title' }, (c ? c.name : 'Shift') + ' — ' + fmtDate(s.date)),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    body,
    el('div', { 'class': 'modal-foot', style: 'flex-wrap:wrap' }, [
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Close'),
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-sec btn-sm', onclick: function(){ openNoteModal({ shift: s, worker: w || me() }); } }, 'Add note'),
      needsReminder ? el('button', { 'class': 'btn btn-sec btn-sm', onclick: function(){ openReminder(s, w); } }, [svgIcon(IC.bell), 'Send reminder']) : null,
      el('button', { 'class': 'btn btn-dark btn-sm', onclick: function(){ openEditRoster(s); } }, 'Edit shift')
    ])
  ]);
  openModal(m);
}

function openEditRoster(s){
  var c = clientById(s.client_id);
  var m = el('div', { 'class': 'modal', style: 'max-width:420px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', { 'class': 't-title' }, 'Edit shift'),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      el('p', { 'class': 't-mut', style: 'font-size:14px;margin-bottom:14px' }, (c ? c.name : '') + ' · ' + fmtDate(s.date) + ' · ' + fmtRange(s.start_t, s.end_t)),
      el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, [
        el('button', { 'class': 'btn btn-sec btn-block', onclick: function(){ closeModal(); openAssign(s); } }, 'Reassign to someone else'),
        s.worker_id ? el('button', { 'class': 'btn btn-sec btn-block', onclick: function(){
          sbUpd('ac_shifts', 'id=eq.' + s.id, { worker_id: null }).then(function(){ closeModal(); toast('Worker removed — the slot now needs cover'); refresh(); })["catch"](function(e){ toast(e.message, true); });
        } }, 'Remove the worker (needs cover)') : null,
        el('button', { 'class': 'btn btn-danger btn-block', onclick: function(){
          confirmDlg('Delete this shift?', 'It disappears from the roster and calendars.', 'Delete shift', function(){
            sbDel('ac_shifts', 'id=eq.' + s.id).then(function(){ closeModal(); toast('Shift deleted'); refresh(); })["catch"](function(e){ toast(e.message, true); });
          }, true);
        } }, 'Delete this shift')
      ])
    ])
  ]);
  openModal(m);
}

/* ---------- reminders ---------- */
function openReminder(s, w){
  var c = clientById(s.client_id);
  var def = firstName(w.name) + ', could you add your shift note for ' + (c ? c.name : '') + ' on ' + DOW[dow(s.date)] + ' ' + fmtDM(s.date) + ' (' + fmtTime(s.start_t) + '–' + fmtTime(s.end_t) + ')? Thanks.';
  var ta = el('textarea', { 'class': 'ta', rows: '4' }, def);
  var emailChk = el('input', { type: 'checkbox' });
  var sendBtn = el('button', { 'class': 'btn btn-pri', onclick: function(){
    var msg = ta.value.trim();
    if (!msg) { toast('The message is empty.', true); return; }
    busyBtn(sendBtn, true);
    var wantEmail = emailChk.checked;
    sbIns('ac_reminders', [{ shift_id: s.id, worker_id: w.id, sent_by: 'Office', message: msg, emailed: wantEmail }]).then(function(){
      sendPush([w.id], 'Astar Care reminder', msg);
      if (wantEmail) {
        window.open('mailto:' + encodeURIComponent(w.email) + '?subject=' + encodeURIComponent('Shift note reminder — ' + (c ? c.name : '') + ' ' + fmtDM(s.date)) + '&body=' + encodeURIComponent(msg), '_blank');
      }
      closeModal(); toast('Reminder sent to ' + w.name); refresh();
    })["catch"](function(e){ busyBtn(sendBtn, false); toast(e.message, true); });
  } }, [svgIcon(IC.send), 'Send']);
  var m = el('div', { 'class': 'modal', style: 'max-width:480px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', { 'class': 't-title' }, 'Remind ' + w.name),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 'field' }, [ el('label', null, 'Message'), ta,
        el('div', { 'class': 'hint' }, 'They see it as a banner on their Home tab in the app, with “Add the note” and “Got it”.') ]),
      el('label', { 'class': 'checkrow' }, [ emailChk, el('span', { style: 'font-size:14px' }, 'Also open an email to ' + w.email) ])
    ]),
    el('div', { 'class': 'modal-foot' }, [ el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'), sendBtn ])
  ]);
  openModal(m);
}

/* ---------- send roster ---------- */
function openSendRoster(){
  var days = rosterDays();
  var from = days[0], to = days[days.length - 1];
  var perWorker = {};
  state.data.shifts.forEach(function(s){
    if (s.date < from || s.date > to || !s.worker_id) return;
    (perWorker[s.worker_id] = perWorker[s.worker_id] || []).push(s);
  });
  var body = el('div', { 'class': 'modal-body' });
  body.appendChild(el('p', { 'class': 't-mut', style: 'font-size:14px;margin-bottom:14px' },
    'Each worker gets their own shifts for ' + fmtDate(from) + ' – ' + fmtDate(to) + ' as an in-app message, an email, or both.'));
  var workers = state.data.workers.filter(function(w){ return !w.is_admin && w.active && perWorker[w.id]; });
  if (!workers.length) body.appendChild(el('div', { 'class': 'notice' }, 'No assigned shifts in this range yet.'));
  workers.forEach(function(w){
    var lines = perWorker[w.id].sort(function(a,b){ return a.date === b.date ? tMin(a.start_t) - tMin(b.start_t) : (a.date < b.date ? -1 : 1); })
      .map(function(s){ var c = clientById(s.client_id); return fmtDate(s.date) + ': ' + (c ? c.name : '') + ' ' + fmtRange(s.start_t, s.end_t) + (s.type === 'sleepover' ? ' (sleepover)' : ''); });
    var msg = 'Hi ' + firstName(w.name) + ', here is your roster for ' + fmtDate(from) + ' – ' + fmtDate(to) + ':\n\n' + lines.join('\n') + '\n\nThanks!';
    body.appendChild(el('div', { 'class': 'card card-pad', style: 'margin-bottom:10px;padding:14px 16px' }, [
      el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:8px' }, [
        el('span', { 'class': 'avatar', style: 'background:' + w.colour }, initials(w.name)),
        el('div', { style: 'flex:1' }, [ el('b', null, w.name), el('div', { 'class': 't-cap' }, perWorker[w.id].length + ' shift' + (perWorker[w.id].length === 1 ? '' : 's')) ])
      ]),
      el('div', { 'class': 'notice', style: 'white-space:pre-wrap;font-size:12.5px;max-height:120px;overflow:auto' }, msg),
      el('div', { style: 'display:flex;gap:8px;margin-top:10px' }, [
        el('button', { 'class': 'btn btn-sm btn-pri', onclick: function(e){
          var b = e.currentTarget;
          sbIns('ac_reminders', [{ shift_id: null, worker_id: w.id, sent_by: 'Office', message: msg, emailed: false }])
            .then(function(){
              sendPush([w.id], 'Your roster is ready', 'Roster for ' + fmtDate(from) + ' – ' + fmtDate(to) + ' — open Astar Care to see your shifts.');
              b.textContent = 'Sent ✓'; b.disabled = true; toast('Roster sent to ' + w.name); refresh();
            })
            ["catch"](function(err){ toast(err.message, true); });
        } }, 'Send in-app'),
        el('a', { 'class': 'btn btn-sm btn-sec', href: 'mailto:' + encodeURIComponent(w.email) + '?subject=' + encodeURIComponent('Your roster ' + fmtDM(from) + ' – ' + fmtDM(to)) + '&body=' + encodeURIComponent(msg), target: '_blank', style: 'text-decoration:none' }, 'Email')
      ])
    ]));
  });
  var m = el('div', { 'class': 'modal', style: 'max-width:520px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', { 'class': 't-title' }, 'Send roster'),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    body
  ]);
  openModal(m);
}
