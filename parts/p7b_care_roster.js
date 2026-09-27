/* ================= admin: roster of care =================
   The PLANNED supports per each client's service agreement (table ac_care_roster).
   Kept apart from the worker roster (ac_shifts): changing a worker's shift never
   changes the roster of care, and workers never see this page (admin-only RLS).
   No worker names here by design. Shares week / range / client with the Roster tab. */
function rocFor(clientId, date){
  return state.data.roc.filter(function(r){ return r.client_id === clientId && r.date === date; })
    .sort(function(a, b){ return tMin(a.start_t) - tMin(b.start_t); });
}
/* clients shown: active ones with a care-plan pattern, plus any with roster-of-care rows in view */
function rocClients(days){
  return state.data.clients.filter(function(c){
    if (state.roster.client !== 'all' && c.id !== state.roster.client) return false;
    var hasReq = state.data.reqs.some(function(r){ return r.client_id === c.id; });
    var hasRows = state.data.roc.some(function(r){ return r.client_id === c.id && r.date >= days[0] && r.date <= days[days.length - 1]; });
    return (c.active !== false && hasReq) || hasRows;
  });
}
/* pattern slots (from the client's shift types) that have no roster-of-care row yet on that day */
function rocMissing(c, d){
  return state.data.reqs.filter(function(rq){
    return rq.client_id === c.id && rq.days.indexOf(dow(d)) >= 0 &&
      !state.data.roc.some(function(r){ return r.client_id === c.id && r.date === d && r.req_id === rq.id; });
  });
}
function rocRowFromReq(c, rq, d){
  return { client_id: c.id, req_id: rq.id, date: d, start_t: rq.start_t, end_t: rq.end_t, type: rq.type };
}

function viewRosterOfCare(main){
  var days = rosterDays();
  var t = todayYmd();
  var clients = rocClients(days);

  var hours = 0, count = 0, missing = 0;
  clients.forEach(function(c){
    days.forEach(function(d){
      rocFor(c.id, d).forEach(function(r){ hours += shiftHours(r); count++; });
      missing += rocMissing(c, d).length;
    });
  });

  main.appendChild(el('div', { 'class': 'section-head', style: 'margin:6px 0 6px;flex-wrap:wrap' }, [
    el('div', { 'class': 't-display' }, 'Roster of care'),
    el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
      missing ? el('button', { 'class': 'btn btn-sec btn-sm', onclick: function(){ rocFill(days, clients); } }, [svgIcon(IC.plus), 'Fill from shift types']) : null,
      state.roster.range === 'week' ? el('button', { 'class': 'btn btn-sec btn-sm', onclick: rocCopyLastWeek }, [svgIcon(IC.grid), 'Copy last week']) : null,
      el('button', { 'class': 'btn btn-sec btn-sm', onclick: function(){ openRocShift(null, { date: days[0] }); } }, [svgIcon(IC.plus), 'Add shift'])
    ])
  ]));
  main.appendChild(el('p', { 'class': 't-mut', style: 'font-size:14px;margin:0 0 16px;max-width:680px' },
    'The planned supports from each service agreement. Only you see this page. Workers only see the Roster, so changing a worker’s shift there never changes this.'));

  main.appendChild(el('div', { 'class': 'statgrid' }, [
    el('div', { 'class': 'stat' }, [ el('div', { 'class': 'st-v' }, [hrsFmt(hours), el('span', { style: 'font-size:16px;color:var(--dim)' }, ' h')]), el('div', { 'class': 'st-l' }, 'planned hours') ]),
    el('div', { 'class': 'stat' }, [ el('div', { 'class': 'st-v' }, String(count)), el('div', { 'class': 'st-l' }, 'planned shifts') ]),
    el('div', { 'class': 'stat' }, [ el('div', { 'class': 'st-v', style: missing ? 'color:var(--warnc)' : '' }, String(missing)), el('div', { 'class': 'st-l' }, 'not yet planned') ])
  ]));

  /* same controls as the Roster tab (shared week / range / client) */
  var isCurrent = state.roster.anchor === mondayOf(t);
  var step = state.roster.range === 'week' ? 7 : (state.roster.range === 'fortnight' ? 14 : 28);
  main.appendChild(el('div', { 'class': 'cal-head', style: 'margin-top:20px' }, [
    el('div', { 'class': 'seg' }, [['week','Week'],['fortnight','Fortnight'],['month','Month']].map(function(p){
      return el('button', { 'class': state.roster.range === p[0] ? 'on' : '', onclick: function(){ state.roster.range = p[0]; render(); } }, p[1]);
    })),
    el('div', { style: 'display:flex;align-items:center;gap:2px' }, [
      el('button', { 'class': 'iconbtn', 'aria-label': 'Previous period', onclick: function(){ state.roster.anchor = addDays(state.roster.anchor, -step); render(); ensureWindow(state.roster.anchor); } }, svgIcon(IC.left)),
      el('button', { 'class': 'iconbtn', 'aria-label': 'Next period', onclick: function(){ state.roster.anchor = addDays(state.roster.anchor, step); render(); ensureWindow(addDays(state.roster.anchor, 27)); } }, svgIcon(IC.right))
    ]),
    el('div', { 'class': 't-sub', style: 'flex:1;min-width:120px' }, fmtDate(days[0]) + ' – ' + fmtDate(days[days.length - 1])),
    !isCurrent ? el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ state.roster.anchor = mondayOf(t); render(); } }, 'Today') : null,
    el('div', { 'class': 'seg' }, [el('button', { 'class': state.roster.client === 'all' ? 'on' : '', onclick: function(){ state.roster.client = 'all'; render(); } }, 'All')].concat(
      state.data.clients.map(function(c){
        return el('button', { 'class': state.roster.client === c.id ? 'on' : '', style: state.roster.client === c.id ? 'color:' + c.colour : '', onclick: function(){ state.roster.client = c.id; render(); } }, c.name);
      })))
  ]));

  if (!clients.length) {
    main.appendChild(el('div', { 'class': 'card', style: 'margin-top:14px' }, 'No clients with shift types yet. Add shift types in Team, or use Add shift.'));
    return;
  }
  var mobile = window.innerWidth < 860;
  for (var wk = 0; wk < days.length / 7; wk++) {
    var wkDays = days.slice(wk * 7, wk * 7 + 7);
    main.appendChild(mobile ? rocMobileWeek(wkDays, clients, t) : rocWeekGrid(wkDays, clients, t));
  }
  main.appendChild(el('div', { 'class': 'legend', 'aria-label': 'Roster of care key' }, [
    el('span', null, [ el('i', { style: 'background:var(--acc-soft);border:1px solid #BBD9DB' }), 'Planned' ]),
    el('span', null, [ el('i', { style: 'background:transparent;border:1px dashed var(--line-2)' }), 'Shift type not planned yet (tap to add)' ]),
    el('span', null, '☾ sleepover')
  ]));
}

function rocChip(r){
  return el('button', { 'class': 'rw-chip cov', 'aria-label': 'Planned ' + fmtRange(r.start_t, r.end_t), onclick: function(){ openRocShift(r); } }, [
    (r.type === 'sleepover' ? '☾ ' : '') + fmtTime(r.start_t) + '–' + fmtTime(r.end_t),
    el('span', { 'class': 'rc-t' }, hrsFmt(shiftHours(r)) + ' h')
  ]);
}
function rocGhostChip(c, rq, d){
  return el('button', { 'class': 'rw-chip', style: 'background:transparent;border:1px dashed var(--line-2);color:var(--mut)', 'aria-label': 'Add planned ' + fmtRange(rq.start_t, rq.end_t),
    onclick: function(e){
      e.currentTarget.disabled = true;
      sbIns('ac_care_roster', [rocRowFromReq(c, rq, d)])
        .then(function(){ toast('Planned ' + c.name + ' ' + fmtDate(d) + ' · ' + fmtRange(rq.start_t, rq.end_t)); refresh(); })
        ["catch"](function(err){ toast(err.message, true); refresh(); });
    } }, [
    '+ ' + (rq.type === 'sleepover' ? '☾ ' : '') + fmtTime(rq.start_t) + '–' + fmtTime(rq.end_t),
    el('span', { 'class': 'rc-t' }, 'not planned')
  ]);
}
function rocWeekHours(c, wkDays){
  var h = 0;
  wkDays.forEach(function(d){ rocFor(c.id, d).forEach(function(r){ h += shiftHours(r); }); });
  return h;
}

function rocWeekGrid(wkDays, clients, t){
  var grid = el('div', { 'class': 'rw-grid', style: 'margin-top:14px' });
  var head = el('div', { 'class': 'rw-row rw-hidehead' });
  head.appendChild(el('div', { 'class': 'rw-rowhead' }, el('span', { 'class': 't-label' }, fmtDM(wkDays[0]) + ' – ' + fmtDM(wkDays[6]))));
  wkDays.forEach(function(d){
    head.appendChild(el('div', { 'class': 'rw-dayhead' + (d === t ? ' today' : '') }, DOW3[dow(d)] + ' ' + pd(d).getDate()));
  });
  grid.appendChild(head);
  clients.forEach(function(c){
    var tr = el('div', { 'class': 'rw-row' });
    tr.appendChild(el('div', { 'class': 'rw-rowhead' }, [
      el('div', { style: 'display:flex;align-items:center;gap:6px' }, [
        el('span', { 'class': 'dot', style: 'background:' + c.colour }),
        el('b', { style: 'font-size:13.5px' }, c.name)
      ]),
      el('span', { 'class': 't-cap t-num' }, hrsFmt(rocWeekHours(c, wkDays)) + ' h this week')
    ]));
    wkDays.forEach(function(d){
      var cell = el('div', { 'class': 'rw-cellwrap' });
      var rows = rocFor(c.id, d), miss = rocMissing(c, d);
      rows.forEach(function(r){ cell.appendChild(rocChip(r)); });
      miss.forEach(function(rq){ cell.appendChild(rocGhostChip(c, rq, d)); });
      if (!rows.length && !miss.length) cell.appendChild(el('div', { 'class': 'rw-chip off' }, ''));
      tr.appendChild(cell);
    });
    grid.appendChild(tr);
  });
  return grid;
}

function rocMobileWeek(wkDays, clients, t){
  var box = el('div', { style: 'margin-top:14px;display:flex;flex-direction:column;gap:10px' });
  box.appendChild(el('div', { 'class': 't-label' }, fmtDM(wkDays[0]) + ' – ' + fmtDM(wkDays[6]) + ' · ' +
    clients.map(function(c){ return c.name + ' ' + hrsFmt(rocWeekHours(c, wkDays)) + ' h'; }).join(' · ')));
  wkDays.forEach(function(d){
    var items = [];
    clients.forEach(function(c){
      rocFor(c.id, d).forEach(function(r){ items.push(el('button', { 'class': 'rw-chip cov', style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px', onclick: function(){ openRocShift(r); } }, [
        el('b', { style: 'color:' + c.colour }, c.name),
        el('span', { 'class': 'rc-t', style: 'display:inline' }, (r.type === 'sleepover' ? '☾ ' : '') + fmtTime(r.start_t) + '–' + fmtTime(r.end_t) + ' · ' + hrsFmt(shiftHours(r)) + ' h')
      ])); });
      rocMissing(c, d).forEach(function(rq){
        var g = rocGhostChip(c, rq, d);
        g.style.cssText += ';display:flex;justify-content:space-between;align-items:center;gap:8px;padding:9px 12px';
        g.textContent = '';
        g.appendChild(el('b', null, c.name));
        g.appendChild(el('span', { 'class': 'rc-t', style: 'display:inline' }, '+ ' + fmtTime(rq.start_t) + '–' + fmtTime(rq.end_t) + ' · not planned'));
        items.push(g);
      });
    });
    if (!items.length) return;
    box.appendChild(el('div', { 'class': 'agenda-day' + (d === t ? ' today' : '') }, [
      el('div', { 'class': 'agenda-date' }, [
        el('div', { 'class': 'dnm' }, DOW3[dow(d)]),
        el('div', { 'class': 'dno' }, String(pd(d).getDate()))
      ]),
      el('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:6px' }, items)
    ]));
  });
  return box;
}

/* fill every unplanned shift-type slot in the visible period */
function rocFill(days, clients){
  var rows = [];
  clients.forEach(function(c){ days.forEach(function(d){ rocMissing(c, d).forEach(function(rq){ rows.push(rocRowFromReq(c, rq, d)); }); }); });
  if (!rows.length) { toast('Everything in view is already planned.'); return; }
  confirmDlg('Fill from shift types?',
    'Adds ' + rows.length + ' planned shift' + (rows.length === 1 ? '' : 's') + ' for ' + fmtDate(days[0]) + ' – ' + fmtDate(days[days.length - 1]) +
    ', using each client’s shift types (days and times set in Team). Days already planned are left alone. The worker roster is not touched.',
    'Add ' + rows.length,
    function(){
      sbIns('ac_care_roster', rows)
        .then(function(){ toast('Planned ' + rows.length + ' shifts'); refresh(); })
        ["catch"](function(e){ toast(e.message, true); refresh(); });
    });
}
function rocCopyLastWeek(){
  var anchor = state.roster.anchor, rows = [];
  state.data.roc.forEach(function(r){
    if (r.date < addDays(anchor, -7) || r.date > addDays(anchor, -1)) return;
    if (state.roster.client !== 'all' && r.client_id !== state.roster.client) return;
    var d = addDays(r.date, 7);
    var taken = state.data.roc.some(function(o){ return o.client_id === r.client_id && o.date === d && (r.req_id ? o.req_id === r.req_id : o.start_t === r.start_t); });
    if (!taken) rows.push({ client_id: r.client_id, req_id: r.req_id, date: d, start_t: r.start_t, end_t: r.end_t, type: r.type });
  });
  if (!rows.length) { toast('Nothing to copy. Last week is empty or this week already matches it.'); return; }
  confirmDlg('Copy last week?',
    'Copies ' + rows.length + ' planned shift' + (rows.length === 1 ? '' : 's') + ' from ' + fmtDate(addDays(anchor, -7)) + ' – ' + fmtDate(addDays(anchor, -1)) +
    ' into this week. Days already planned are left alone. The worker roster is not touched.',
    'Copy ' + rows.length,
    function(){
      sbIns('ac_care_roster', rows)
        .then(function(){ toast('Copied ' + rows.length + ' planned shifts'); refresh(); })
        ["catch"](function(e){ toast(e.message, true); refresh(); });
    });
}

/* add (r = null) or edit a planned shift */
function openRocShift(r, defaults){
  defaults = defaults || {};
  var cur = r || { client_id: state.roster.client !== 'all' ? state.roster.client : (state.data.clients[0] || {}).id, date: defaults.date || todayYmd(), start_t: '09:00', end_t: '17:00', type: 'day', req_id: null };
  var c = clientById(cur.client_id);
  var clientSel = el('select', { 'class': 'sel', id: 'roc-client' }, state.data.clients.map(function(x){
    return el('option', { value: x.id, selected: x.id === cur.client_id }, x.name);
  }));
  var typeSel = el('select', { 'class': 'sel', id: 'roc-type' }, [['day','Day shift'],['sleepover','Sleepover']].map(function(p){
    return el('option', { value: p[0], selected: cur.type === p[0] }, p[1]);
  }));
  var hoursLbl = el('p', { 'class': 'hint t-num', style: 'margin:-8px 0 14px' });
  function updHours(){
    var s = document.getElementById('roc-start'), e = document.getElementById('roc-end');
    var a = s ? s.value : cur.start_t, b = e ? e.value : cur.end_t;
    hoursLbl.textContent = (a && b) ? hrsFmt(shiftHours({ start_t: a, end_t: b })) + ' hours' : '';
  }
  var m = el('div', { 'class': 'modal', style: 'max-width:420px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, r ? 'Planned shift' : 'Add planned shift'),
        el('div', { 'class': 't-cap' }, 'Roster of care · workers don’t see this')
      ]),
      el('button', { 'class': 'iconbtn', 'aria-label': 'Close', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      r ? el('p', { 'class': 't-mut', style: 'font-size:14px;margin-bottom:14px' }, (c ? c.name : '') + ' · ' + fmtDate(r.date) + ' · ' + fmtRange(r.start_t, r.end_t)) : null,
      r ? null : el('div', { 'class': 'field' }, [ el('label', null, 'Client'), clientSel ]),
      el('div', { 'class': 'field' }, [ el('label', null, 'Date'), el('input', { 'class': 'inp', type: 'date', id: 'roc-date', value: cur.date }) ]),
      el('div', { 'class': 'grid2' }, [
        el('div', { 'class': 'field' }, [ el('label', null, 'Start'), el('input', { 'class': 'inp', type: 'time', id: 'roc-start', value: cur.start_t, oninput: updHours }) ]),
        el('div', { 'class': 'field' }, [ el('label', null, 'End'), el('input', { 'class': 'inp', type: 'time', id: 'roc-end', value: cur.end_t, oninput: updHours }) ])
      ]),
      hoursLbl,
      el('div', { 'class': 'field' }, [ el('label', null, 'Type'), typeSel ]),
      el('button', { 'class': 'btn btn-pri btn-block', onclick: function(e){
        var nd = document.getElementById('roc-date').value, ns = document.getElementById('roc-start').value, ne = document.getElementById('roc-end').value;
        if (!nd || !ns || !ne) { toast('Fill in the date and both times.', true); return; }
        if (ns === ne) { toast('Start and end can’t be the same time.', true); return; }
        var rec = { date: nd, start_t: ns, end_t: ne, type: typeSel.value };
        busyBtn(e.currentTarget, true);
        var p = r ? sbUpd('ac_care_roster', 'id=eq.' + r.id, rec)
                  : sbIns('ac_care_roster', [Object.assign({ client_id: clientSel.value, req_id: null }, rec)]);
        p.then(function(){ closeModal(); toast('Roster of care saved · ' + fmtDate(nd) + ' · ' + fmtRange(ns, ne)); refresh(); })
         ["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
      } }, r ? 'Save' : 'Add to roster of care'),
      r ? el('button', { 'class': 'btn btn-ghost btn-block', style: 'margin-top:10px;color:var(--bad)', onclick: function(){
        confirmDlg('Remove this planned shift?', (c ? c.name : '') + ' · ' + fmtDate(r.date) + ' · ' + fmtRange(r.start_t, r.end_t) + '. Only the roster of care changes. The worker roster is not touched.', 'Remove', function(){
          sbDel('ac_care_roster', 'id=eq.' + r.id)
            .then(function(){ toast('Removed from roster of care'); refresh(); })
            ["catch"](function(err){ toast(err.message, true); });
        }, true);
      } }, 'Remove from roster of care') : null
    ])
  ]);
  openModal(m);
  updHours();
}
