/* ================= calendar ================= */
function calRange(){
  var c = state.cal, a = c.anchor;
  if (c.mode === 'month') {
    var d = pd(a); var first = new Date(d.getFullYear(), d.getMonth(), 1);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return { from: mondayOf(ymd(first)), to: addDays(mondayOf(ymd(last)), 6), moFirst: ymd(first), moLast: ymd(last) };
  }
  if (c.mode === 'week') { var m = mondayOf(a); return { from: m, to: addDays(m, 6) }; }
  return { from: a, to: a };
}
function calTitle(){
  var c = state.cal, d = pd(c.anchor);
  if (c.mode === 'month') return MON[d.getMonth()] + ' ' + d.getFullYear();
  if (c.mode === 'week') { var m = mondayOf(c.anchor); var e = addDays(m, 6);
    return fmtDate(m).slice(4) + ' – ' + fmtDate(e).slice(4) + ' ' + pd(e).getFullYear(); }
  return fmtDateFull(c.anchor);
}
function calNav(dir){
  var c = state.cal, d = pd(c.anchor);
  if (c.mode === 'month') { d.setDate(1); d.setMonth(d.getMonth() + dir); }
  else if (c.mode === 'week') d.setDate(d.getDate() + dir * 7);
  else d.setDate(d.getDate() + dir);
  c.anchor = ymd(d);
  render();
  ensureWindow(c.anchor);
}

function viewCalendar(main, w){
  var shifts = myShifts(w);
  var r = calRange();
  var inRange = shifts.filter(function(s){ return s.date >= r.from && s.date <= r.to; });
  var totalH = 0;
  inRange.forEach(function(s){
    if (state.cal.mode === 'month') { if (s.date >= r.moFirst && s.date <= r.moLast) totalH += shiftHours(s); }
    else totalH += shiftHours(s);
  });

  main.appendChild(el('div', { style: 'margin:6px 0 16px' }, el('div', { 'class': 't-display' }, 'My calendar')));

  var isToday = (state.cal.mode === 'month')
    ? (pd(state.cal.anchor).getMonth() === new Date().getMonth() && pd(state.cal.anchor).getFullYear() === new Date().getFullYear())
    : (state.cal.mode === 'week' ? mondayOf(state.cal.anchor) === mondayOf(todayYmd()) : state.cal.anchor === todayYmd());

  var head = el('div', { 'class': 'cal-head' }, [
    el('div', { 'class': 'seg' }, ['month','week','day'].map(function(mo){
      return el('button', { 'class': state.cal.mode === mo ? 'on' : '', onclick: function(){ state.cal.mode = mo; render(); } },
        mo.charAt(0).toUpperCase() + mo.slice(1));
    })),
    el('div', { style: 'display:flex;align-items:center;gap:2px' }, [
      el('button', { 'class': 'iconbtn', 'aria-label': 'Back', onclick: function(){ calNav(-1); } }, svgIcon(IC.left)),
      el('button', { 'class': 'iconbtn', 'aria-label': 'Forward', onclick: function(){ calNav(1); } }, svgIcon(IC.right))
    ]),
    el('div', { 'class': 't-sub', style: 'flex:1;min-width:0' }, calTitle()),
    !isToday ? el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ state.cal.anchor = todayYmd(); render(); } }, 'Today') : null,
    el('span', { 'class': 'tag tag-mut t-num' }, hrsFmt(totalH) + ' h')
  ]);
  main.appendChild(head);

  var mobile = window.innerWidth < 640;
  if (state.cal.mode === 'month') {
    if (mobile) calAgenda(main, w, inRange, r);
    else calMonth(main, w, inRange, r);
  } else if (state.cal.mode === 'week') {
    calWeek(main, w, shifts, r);
  } else {
    calDay(main, w, inRange);
  }
}

function calMonth(main, w, shifts, r){
  var box = el('div', { 'class': 'cal-month' });
  box.appendChild(el('div', { 'class': 'cal-dow' }, DOW3.slice(1).concat([DOW3[0]]).map(function(d){ return el('div', null, d); })));
  var grid = el('div', { 'class': 'cal-grid' });
  var t = todayYmd();
  var d = r.from;
  while (d <= r.to) {
    (function(d){
      var out = d < r.moFirst || d > r.moLast;
      var cell = el('div', { 'class': 'cal-cell' + (out ? ' outmo' : '') });
      cell.appendChild(el('div', { 'class': 'cal-dnum' + (d === t ? ' today' : '') }, String(pd(d).getDate())));
      shifts.filter(function(s){ return s.date === d; })
        .sort(function(a,b){ return tMin(a.start_t) - tMin(b.start_t); })
        .forEach(function(s){ cell.appendChild(calEvent(s, w)); });
      grid.appendChild(cell);
    })(d);
    d = addDays(d, 1);
  }
  box.appendChild(grid);
  main.appendChild(box);
}

function calEvent(s, w){
  var c = clientById(s.client_id);
  var noted = notesForShift(s.id).length > 0;
  var typeTag = s.type === 'sleepover' ? 'Sleepover' : (tMin(s.start_t) >= 18 * 60 || tMin(s.end_t) <= tMin(s.start_t) ? 'Night' : 'Day');
  return el('div', { 'class': 'cal-ev', style: '--c:' + (c ? c.colour : 'var(--acc)'), onclick: function(){ openShiftSheet(s, w); } }, [
    el('div', { 'class': 'ev-time' }, [
      el('span', null, fmtTime(s.start_t) + '–' + fmtTime(s.end_t)),
      el('span', { 'class': 'ev-tag' }, typeTag)
    ]),
    el('div', { 'class': 'ev-name', style: 'display:flex;align-items:center;gap:4px' }, [
      c ? c.name : '?',
      noted ? el('span', { 'class': 'ev-tick', style: 'display:flex' }, svgIcon(IC.check, '0 0 24 24')) : null
    ])
  ]);
}

function calAgenda(main, w, shifts, r){
  var from = r.moFirst || r.from, to = r.moLast || r.to;
  var t = todayYmd();
  var any = false;
  var box = el('div');
  var d = from;
  while (d <= to) {
    (function(d){
      var todaysShifts = shifts.filter(function(s){ return s.date === d; });
      if (!todaysShifts.length) return;
      any = true;
      var day = el('div', { 'class': 'agenda-day' + (d === t ? ' today' : '') }, [
        el('div', { 'class': 'agenda-date' }, [
          el('div', { 'class': 'dnm' }, DOW3[pd(d).getDay()]),
          el('div', { 'class': 'dno' }, String(pd(d).getDate()))
        ]),
        el('div', { style: 'flex:1;min-width:0;display:flex;flex-direction:column;gap:8px' },
          todaysShifts.sort(function(a,b){ return tMin(a.start_t) - tMin(b.start_t); }).map(function(s){ return calEvent(s, w); }))
      ]);
      box.appendChild(day);
    })(d);
    d = addDays(d, 1);
  }
  if (!any) {
    box.appendChild(el('div', { 'class': 'card empty' }, [
      el('div', { 'class': 'e-art' }, '···'),
      el('b', null, 'No shifts this month'),
      'When Ash rosters you on, your days appear here.'
    ]));
  }
  main.appendChild(box);
}

function calWeek(main, w, allShifts, r){
  var box = el('div', { 'class': 'cal-week' });
  /* day headers */
  var t = todayYmd();
  var headRow = el('div', { style: 'display:grid;grid-template-columns:46px repeat(7,1fr);border-bottom:1px solid var(--line);background:var(--paper)' });
  headRow.appendChild(el('div'));
  for (var i = 0; i < 7; i++) {
    var d = addDays(r.from, i);
    headRow.appendChild(el('div', { style: 'padding:8px 4px;text-align:center;border-left:1px solid var(--line)' }, [
      el('div', { style: 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--dim)' }, DOW3[pd(d).getDay()]),
      el('div', { 'class': 'cal-dnum' + (d === t ? ' today' : ''), style: 'margin:2px auto 0' }, String(pd(d).getDate()))
    ]));
  }
  box.appendChild(headRow);

  var scroll = el('div', { 'class': 'cw-scroll' });
  var grid = el('div', { 'class': 'cw-grid' });
  var HOUR_H = 44;
  /* hour labels */
  var hourCol = el('div');
  for (var h = 0; h < 24; h++) hourCol.appendChild(el('div', { 'class': 'cw-hour' }, h === 0 ? '' : pad2(h) + ':00'));
  grid.appendChild(hourCol);
  /* day columns */
  for (i = 0; i < 7; i++) {
    (function(i){
      var d = addDays(r.from, i);
      var col = el('div', { 'class': 'cw-col' });
      for (var h = 0; h < 24; h++) col.appendChild(el('div', { 'class': 'cw-cell' }));
      /* segments: shifts starting this day (clipped at midnight) + carryover from yesterday */
      allShifts.forEach(function(s){
        var cross = tMin(s.end_t) <= tMin(s.start_t);
        if (s.date === d) {
          var startM = tMin(s.start_t);
          var endM = cross ? 1440 : tMin(s.end_t);
          col.appendChild(weekEvent(s, w, startM, endM, HOUR_H, cross ? 'start' : null));
        }
        if (cross && tMin(s.end_t) > 0 && s.date === addDays(d, -1)) {
          col.appendChild(weekEvent(s, w, 0, tMin(s.end_t), HOUR_H, 'end'));
        }
      });
      grid.appendChild(col);
    })(i);
  }
  scroll.appendChild(grid);
  box.appendChild(scroll);
  main.appendChild(box);
  /* scroll to 8am */
  setTimeout(function(){ scroll.scrollTop = 8 * HOUR_H - 10; }, 0);
}
function weekEvent(s, w, startM, endM, HOUR_H, part){
  var c = clientById(s.client_id);
  var top = startM / 60 * HOUR_H;
  var hgt = Math.max((endM - startM) / 60 * HOUR_H - 3, 18);
  var col = c ? c.colour : '#0e7568';
  var ev = el('div', { 'class': 'cw-ev', style: 'top:' + top + 'px;height:' + hgt + 'px;--c:' + col + ';--evbg:' + col + '1a' +
    (part === 'start' ? ';border-radius:8px 8px 0 0' : '') + (part === 'end' ? ';border-radius:0 0 8px 8px' : ''),
    onclick: function(){ openShiftSheet(s, w); } }, [
    el('b', null, (c ? c.name : '?') + (part === 'end' ? ' (cont.)' : '')),
    el('span', null, fmtTime(s.start_t) + ' – ' + fmtTime(s.end_t))
  ]);
  return ev;
}

function calDay(main, w, shifts){
  if (!shifts.length) {
    main.appendChild(el('div', { 'class': 'card empty', style: 'margin-top:8px' }, [
      el('div', { 'class': 'e-art' }, '☾'),
      el('b', null, 'Nothing on ' + fmtDate(state.cal.anchor)),
      'A quiet day. Use the arrows to move between days.'
    ]));
    return;
  }
  shifts.sort(function(a,b){ return tMin(a.start_t) - tMin(b.start_t); }).forEach(function(s){
    main.appendChild(shiftCard(s, w, { clock: true, showDate: false }));
  });
}
