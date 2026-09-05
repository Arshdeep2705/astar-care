/* ================= admin: inbox ================= */
function viewInbox(main){
  main.appendChild(el('div', { style: 'margin:6px 0 20px' }, el('div', { 'class': 't-display' }, 'Inbox')));

  /* urgent flags */
  var flags = state.data.flags.filter(function(f){ return !f.resolved; });
  if (flags.length) {
    var secF = el('div', { 'class': 'section', style: 'margin-top:0' });
    secF.appendChild(el('div', { 'class': 't-label', style: 'margin-bottom:10px' }, 'Worker messages'));
    flags.forEach(function(f){
      var w = workerById(f.worker_id);
      secF.appendChild(el('div', { 'class': 'banner ' + (f.urgent ? 'warn' : 'acc'), style: 'margin-bottom:10px' }, [
        w ? el('span', { 'class': 'avatar', style: 'background:' + w.colour + ';flex:none' }, initials(w.name)) : null,
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, [
            el('b', { style: 'font-size:14px' }, w ? w.name : 'Unknown'),
            f.urgent ? el('span', { 'class': 'tag tag-warn' }, 'Urgent') : null,
            el('span', { 'class': 't-cap' }, fmtDT(f.created_at))
          ]),
          el('div', { style: 'font-size:14px;margin-top:4px;white-space:pre-wrap' }, f.msg),
          el('button', { 'class': 'btn btn-sm btn-sec', style: 'margin-top:10px', onclick: function(){
            sbUpd('ac_flags', 'id=eq.' + f.id, { resolved: true }).then(function(){ toast('Resolved'); refresh(); })["catch"](function(e){ toast(e.message, true); });
          } }, 'Mark resolved')
        ])
      ]));
    });
    main.appendChild(secF);
  }

  /* outstanding notes */
  var t = todayYmd();
  var outstanding = state.data.shifts.filter(function(s){
    return s.worker_id && !s.note_waived && s.date >= addDays(t, -14) && shiftEnded(s) && notesForShift(s.id).length === 0;
  }).sort(function(a,b){ return a.date < b.date ? 1 : -1; });
  var secO = el('div', { 'class': 'section' });
  secO.appendChild(el('div', { 'class': 't-label', style: 'margin-bottom:10px' }, 'Outstanding shift notes'));
  if (!outstanding.length) {
    secO.appendChild(el('div', { 'class': 'card empty', style: 'padding:24px' }, [
      el('b', null, 'All caught up'),
      'Every finished shift in the last fortnight has its note.'
    ]));
  } else {
    var listO = el('div', { 'class': 'card', style: 'padding:4px 16px' });
    outstanding.forEach(function(s){
      var c = clientById(s.client_id), w = workerById(s.worker_id);
      listO.appendChild(el('div', { 'class': 'rowline' }, [
        el('span', { 'class': 'dot', style: 'background:' + (c ? c.colour : '#999') }),
        el('div', { style: 'flex:1;min-width:0;cursor:pointer', onclick: function(){ openAdminShift(s); } }, [
          el('b', { style: 'font-size:14px' }, (c ? c.name : '?') + ' — ' + (w ? w.name : '?')),
          el('div', { 'class': 't-cap t-num' }, fmtDate(s.date) + ' · ' + fmtRange(s.start_t, s.end_t))
        ]),
        w ? el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ openReminder(s, w); } }, 'Remind') : null,
        el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(e){
          busyBtn(e.currentTarget, true);
          sbUpd('ac_shifts', 'id=eq.' + s.id, { note_waived: true })
            .then(function(){ toast('Cleared — this shift is no longer chased for a note'); refresh(); })
            ["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
        } }, 'Clear')
      ]));
    });
    secO.appendChild(listO);
  }
  main.appendChild(secO);

  /* latest notes — unread first, read ones tucked behind a toggle */
  function markSeenBtn(table, row){
    return el('button', { 'class': 'btn btn-sm btn-ghost', style: 'flex:none;align-self:center', onclick: function(e){
      e.stopPropagation();
      busyBtn(e.currentTarget, true);
      sbUpd(table, 'id=eq.' + row.id, { seen: true })
        .then(function(){ refresh(); })
        ["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
    } }, 'Done');
  }
  function noteRow(n, isNew){
    var w = workerById(n.worker_id), c = clientById(n.participant_id), s = n.shift_id ? shiftById(n.shift_id) : null;
    return el('div', { style: 'display:flex;gap:6px;align-items:stretch' }, [
      el('button', { 'class': 'listnote', style: 'display:flex;gap:10px;flex:1;min-width:0;text-align:left', onclick: function(){ openNoteModal({ note: n, shift: s, worker: w }); } }, [
        el('span', { style: 'color:var(--acc);display:flex;margin-top:2px' }, svgIcon(IC.note)),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { style: 'display:flex;gap:8px;align-items:baseline;flex-wrap:wrap' }, [
            el('b', { style: 'font-size:13.5px' }, n.note_type),
            isNew ? el('span', { 'class': 'tag tag-ok' }, 'New') : null,
            c ? el('span', { style: 'font-size:12.5px;font-weight:700;color:' + c.colour }, c.name) : null,
            w ? el('span', { 'class': 't-cap' }, w.name) : null,
            el('span', { 'class': 't-cap t-num' }, fmtDT(n.created_at))
          ]),
          el('div', { 'class': 't-cap', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px' }, notePreview(n.body))
        ]),
        el('span', { 'class': 't-cap', style: 'flex:none' }, 'Read / edit')
      ]),
      isNew ? markSeenBtn('ac_note_entries', n) : null
    ]);
  }
  var secN = el('div', { 'class': 'section' });
  var newN = state.data.notes.filter(function(n){ return !n.seen; });
  var oldN = state.data.notes.filter(function(n){ return n.seen; }).slice(0, 8);
  secN.appendChild(el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap' }, [
    el('div', { 'class': 't-label' }, 'Latest shift notes'),
    el('div', { 'class': 'spacer', style: 'flex:1' }),
    newN.length > 1 ? el('button', { 'class': 'btn btn-sm btn-ghost', onclick: function(e){
      busyBtn(e.currentTarget, true);
      sbUpd('ac_note_entries', 'seen=eq.false', { seen: true })
        .then(function(){ toast('All notes marked as read'); refresh(); })
        ["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
    } }, 'Mark all read') : null
  ]));
  if (!state.data.notes.length) secN.appendChild(el('div', { 'class': 'notice' }, 'No notes yet.'));
  else {
    var listN = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    if (!newN.length) listN.appendChild(el('div', { 'class': 'notice' }, 'No new notes — you have read everything.'));
    newN.forEach(function(n){ listN.appendChild(noteRow(n, true)); });
    if (oldN.length) {
      listN.appendChild(el('button', { 'class': 'btn btn-sm btn-ghost', style: 'align-self:flex-start', onclick: function(){ ui.inboxReadNotes = !ui.inboxReadNotes; render(); } },
        ui.inboxReadNotes ? 'Hide read notes' : 'Show read notes'));
      if (ui.inboxReadNotes) oldN.forEach(function(n){ listN.appendChild(noteRow(n, false)); });
    }
    secN.appendChild(listN);
  }
  main.appendChild(secN);

  /* latest incidents — same unread-first pattern */
  function irRow(ir, isNew){
    var w = workerById(ir.worker_id), c = clientById(ir.participant_id), s = ir.shift_id ? shiftById(ir.shift_id) : null;
    return el('div', { style: 'display:flex;gap:6px;align-items:stretch' }, [
      el('button', { 'class': 'listnote', style: 'display:flex;gap:10px;flex:1;min-width:0;text-align:left', onclick: function(){ openIncidentModal({ incident: ir, shift: s, worker: w }); } }, [
        el('span', { style: 'color:var(--warnc);display:flex;margin-top:2px' }, svgIcon(IC.alert)),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { style: 'display:flex;gap:8px;align-items:baseline;flex-wrap:wrap' }, [
            el('b', { style: 'font-size:13.5px' }, (ir.incident_types || []).join(', ') || 'Incident'),
            isNew ? el('span', { 'class': 'tag tag-warn' }, 'New') : null,
            c ? el('span', { style: 'font-size:12.5px;font-weight:700;color:' + c.colour }, c.name) : null,
            el('span', { 'class': 't-cap t-num' }, ir.incident_date ? fmtDate(ir.incident_date) : fmtDT(ir.created_at))
          ]),
          el('div', { 'class': 't-cap', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px' }, ir.ticket_desc)
        ]),
        el('span', { 'class': 't-cap', style: 'flex:none' }, 'Read / edit')
      ]),
      isNew ? markSeenBtn('ac_incident_forms', ir) : null
    ]);
  }
  var secI = el('div', { 'class': 'section' });
  var newI = state.data.incidents.filter(function(ir){ return !ir.seen; });
  var oldI = state.data.incidents.filter(function(ir){ return ir.seen; }).slice(0, 8);
  secI.appendChild(el('div', { 'class': 't-label', style: 'margin-bottom:10px' }, 'Incident reports'));
  if (!state.data.incidents.length) secI.appendChild(el('div', { 'class': 'notice' }, 'No incident reports.'));
  else {
    var listI = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    if (!newI.length) listI.appendChild(el('div', { 'class': 'notice' }, 'No new incident reports.'));
    newI.forEach(function(ir){ listI.appendChild(irRow(ir, true)); });
    if (oldI.length) {
      listI.appendChild(el('button', { 'class': 'btn btn-sm btn-ghost', style: 'align-self:flex-start', onclick: function(){ ui.inboxReadIncidents = !ui.inboxReadIncidents; render(); } },
        ui.inboxReadIncidents ? 'Hide read reports' : 'Show read reports'));
      if (ui.inboxReadIncidents) oldI.forEach(function(ir){ listI.appendChild(irRow(ir, false)); });
    }
    secI.appendChild(listI);
  }
  main.appendChild(secI);
}

/* ================= admin: availability ================= */
function viewAdminAvail(main){
  var nextMon = addDays(mondayOf(todayYmd()), 7);
  main.appendChild(el('div', { style: 'margin:6px 0 4px' }, el('div', { 'class': 't-display' }, 'Availability')));
  main.appendChild(el('p', { 'class': 't-mut', style: 'margin-bottom:20px' }, 'Week of ' + fmtDate(nextMon) + ' – ' + fmtDate(addDays(nextMon, 6))));

  var workers = state.data.workers.filter(function(w){ return !w.is_admin && w.active; });
  var card = el('div', { 'class': 'card', style: 'overflow:hidden' });
  var mobile = window.innerWidth < 700;

  if (!mobile) {
    var tbl = el('table', { 'class': 'tbl' });
    var thead = el('tr', null, [el('th', null, 'Worker')]);
    for (var i = 0; i < 7; i++) thead.appendChild(el('th', { style: 'text-align:center' }, DOW3[dow(addDays(nextMon, i))]));
    tbl.appendChild(thead);
    workers.forEach(function(w){
      var a = state.data.avail.find(function(x){ return x.worker_id === w.id && x.week_start === nextMon; });
      var tr = el('tr', null, [ el('td', null, el('div', { style: 'display:flex;align-items:center;gap:8px' }, [
        el('span', { 'class': 'dot', style: 'background:' + w.colour }), el('b', { style: 'font-size:13.5px' }, w.name) ])) ]);
      for (var i = 0; i < 7; i++) {
        var dnum = String(dow(addDays(nextMon, i)));
        var v = a && a.days ? a.days[dnum] : null;
        tr.appendChild(el('td', { style: 'text-align:center' },
          a ? (v ? el('span', { style: 'color:var(--ok);display:inline-flex' }, svgIcon(IC.check)) : el('span', { style: 'color:var(--line-2)' }, '—'))
            : el('span', { style: 'color:var(--dim)' }, '·')));
      }
      tbl.appendChild(tr);
    });
    card.appendChild(el('div', { style: 'padding:6px 10px' }, tbl));
  } else {
    workers.forEach(function(w){
      var a = state.data.avail.find(function(x){ return x.worker_id === w.id && x.week_start === nextMon; });
      var row = el('div', { style: 'padding:12px 16px;border-bottom:1px solid var(--line)' }, [
        el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:6px' }, [
          el('span', { 'class': 'dot', style: 'background:' + w.colour }), el('b', { style: 'font-size:14px' }, w.name),
          !a ? el('span', { 'class': 'tag tag-warn', style: 'margin-left:auto' }, 'Not submitted') : null
        ]),
        a ? el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, Array.apply(null, Array(7)).map(function(_, i){
          var d = addDays(nextMon, i); var v = a.days ? a.days[String(dow(d))] : false;
          return el('span', { 'class': 'tag ' + (v ? 'tag-ok' : 'tag-mut') }, DOW3[dow(d)]);
        })) : el('span', { 'class': 't-cap' }, 'Nothing submitted yet.')
      ]);
      card.appendChild(row);
    });
  }
  main.appendChild(card);

  /* nudge list */
  var missing = workers.filter(function(w){
    return !state.data.avail.some(function(x){ return x.worker_id === w.id && x.week_start === nextMon; });
  });
  if (missing.length) {
    var sec = el('div', { 'class': 'section' });
    /* nudge state lives in ui so a mid-chain live refresh can't re-enable the
       buttons and let the admin double-send */
    ui.nudged = ui.nudged || {};
    var nudgeAll = el('button', { 'class': 'btn btn-sm btn-dark', disabled: !!ui.nudging, onclick: function(){
      if (ui.nudging) return;
      ui.nudging = true;
      nudgeAll.disabled = true; nudgeAll.textContent = 'Nudging…';
      var chain = Promise.resolve();
      missing.forEach(function(w){
        var nmsg = firstName(w.name) + ', availability for next week (' + fmtDate(nextMon) + ' onwards) opens this Saturday — please submit it then. Thanks!';
        chain = chain.then(function(){
          if (ui.nudged[w.id]) return null;
          return sbIns('ac_reminders', [{ shift_id: null, worker_id: w.id, sent_by: 'Office', message: nmsg, emailed: false }])
            .then(function(){ ui.nudged[w.id] = true; sendPush([w.id], 'Availability reminder', nmsg); });
        });
      });
      chain.then(function(){ ui.nudging = false; toast('Nudged ' + missing.length + (missing.length === 1 ? ' worker' : ' workers')); refresh(); })
        ["catch"](function(e){ ui.nudging = false; toast(e.message, true); refresh(); });
    } }, [svgIcon(IC.bell), ui.nudging ? 'Nudging…' : 'Nudge everyone (' + missing.length + ')']);
    sec.appendChild(el('div', { 'class': 'section-head', style: 'margin-bottom:10px' }, [
      el('div', { 'class': 't-label' }, "Haven't submitted"),
      nudgeAll
    ]));
    var box = el('div', { 'class': 'card', style: 'padding:4px 16px' });
    missing.forEach(function(w){
      box.appendChild(el('div', { 'class': 'rowline' }, [
        el('span', { 'class': 'avatar', style: 'background:' + w.colour }, initials(w.name)),
        el('div', { style: 'flex:1;min-width:0' }, [ el('b', { style: 'font-size:14px' }, w.name), el('div', { 'class': 't-cap' }, w.email) ]),
        el('button', { 'class': 'btn btn-sm btn-sec', disabled: !!ui.nudged[w.id], onclick: function(e){
          if (ui.nudged[w.id]) return;
          var b = e.currentTarget;
          b.disabled = true;
          var nmsg = firstName(w.name) + ', availability for next week (' + fmtDate(nextMon) + ' onwards) opens this Saturday — please submit it then. Thanks!';
          sbIns('ac_reminders', [{ shift_id: null, worker_id: w.id, sent_by: 'Office', message: nmsg, emailed: false }])
            .then(function(){
              ui.nudged[w.id] = true;
              sendPush([w.id], 'Availability reminder', nmsg);
              b.textContent = 'Nudged ✓'; toast('Nudge sent to ' + w.name); refresh();
            })
            ["catch"](function(err){ b.disabled = false; toast(err.message, true); });
        } }, ui.nudged[w.id] ? 'Nudged ✓' : 'Nudge')
      ]));
    });
    sec.appendChild(box);
    main.appendChild(sec);
  }
}

/* ================= admin: pay ================= */
function fortStart(anchorLike){
  var anchor = state.data.settings.fortnight_anchor || mondayOf(todayYmd());
  var base = state.pay.anchor || (function(){
    var t = mondayOf(todayYmd());
    var diff = Math.round((pd(t) - pd(anchor)) / 86400000);
    var k = Math.floor(diff / 14);
    return addDays(anchor, k * 14);
  })();
  return base;
}
/* pay for one shift: flat shift types (req.flat_pay) pay the flat amount plus
   hours beyond the standard length at flat/standard per hour; a part of a
   shared slot is pro-rated; hourly types return flat:false for the caller */
function shiftPay(s){
  var rq = state.data.reqs.find(function(x){ return x.id === s.req_id; });
  if (!rq || rq.flat_pay == null || rq.flat_pay === '') return { flat: false };
  var flat = +rq.flat_pay || 0;
  var stdH = shiftHours(rq) || 1;
  var h = shiftHours(s);
  var hourly = flat / stdH;
  var shared = shiftsFor(s.req_id, s.date).length > 1;
  if (shared) return { flat: true, base: Math.round(hourly * h * 100) / 100, extraH: 0, extra: 0, hourly: hourly, shared: true };
  var extraH = Math.max(0, h - stdH);
  return { flat: true, base: flat, extraH: extraH, extra: Math.round(extraH * hourly * 100) / 100, hourly: hourly };
}

function viewPay(main){
  var fs = fortStart();
  state.pay.anchor = fs;
  var fe = addDays(fs, 13);
  main.appendChild(el('div', { style: 'margin:6px 0 16px' }, el('div', { 'class': 't-display' }, 'Pay')));
  main.appendChild(el('div', { 'class': 'cal-head' }, [
    el('button', { 'class': 'iconbtn', onclick: function(){ state.pay.anchor = addDays(fs, -14); render(); ensureWindow(state.pay.anchor); } }, svgIcon(IC.left)),
    el('button', { 'class': 'iconbtn', onclick: function(){ state.pay.anchor = addDays(fs, 14); render(); ensureWindow(addDays(state.pay.anchor, 13)); } }, svgIcon(IC.right)),
    el('div', { 'class': 't-sub', style: 'flex:1' }, 'Fortnight ' + fmtDate(fs) + ' – ' + fmtDate(fe)),
    el('span', { 'class': 'tag tag-mut' }, 'ABN · paid fortnightly')
  ]));

  var workers = state.data.workers.filter(function(w){ return !w.is_admin && w.active; });
  var anyRates = workers.some(function(w){ var r = w.rates || {}; return (r.weekday || r.saturday || r.sunday); });
  if (!anyRates) {
    main.appendChild(el('div', { 'class': 'banner warn', style: 'margin-bottom:14px' }, [
      el('div', { style: 'color:var(--warnc);display:flex' }, svgIcon(IC.alert)),
      el('div', { style: 'font-size:13.5px' }, 'All pay rates are still $0 — set each worker’s rates under Team → Rates and the totals here fill in.')
    ]));
  }
  main.appendChild(el('div', { 'class': 'hint', style: 'margin-bottom:4px' },
    'Hourly shift types pay the worker’s weekday / Saturday / Sunday rate. Flat shift types (set on the shift type under Team, e.g. Tim’s day $250 and sleepover $150) pay the flat amount per shift, plus any hours beyond the standard length at that shift’s hourly rate (flat ÷ standard hours). A shorter shift is not reduced unless the slot was shared with a second worker, which pays pro-rata. Kilometres come from Mileage notes at ' + money(+(state.data.settings.km_rate || 0)) + '/km.'));

  workers.forEach(function(w){
    var mine = state.data.shifts.filter(function(s){ return s.worker_id === w.id && s.date >= fs && s.date <= fe; });
    var hWd = 0, hSat = 0, hSun = 0, kmSum = 0;
    var flatN = 0, flatAmt = 0, extraH = 0, extraAmt = 0;
    mine.forEach(function(s){
      var p = shiftPay(s);
      if (p.flat) { flatN++; flatAmt += p.base; extraH += p.extraH; extraAmt += p.extra; return; }
      var d = dow(s.date), h = shiftHours(s);
      if (d === 6) hSat += h; else if (d === 0) hSun += h; else hWd += h;
    });
    state.data.notes.forEach(function(n){
      if (n.worker_id !== w.id || n.note_type !== 'Mileage' || !n.shift_id) return;
      var s = shiftById(n.shift_id);
      if (!s || s.date < fs || s.date > fe) return;
      var re = /(\d+(?:\.\d+)?)\s*km/ig, mkm;
      while ((mkm = re.exec(n.body || ''))) kmSum += parseFloat(mkm[1]);
    });
    var r = w.rates || {};
    var kmRate = +(state.data.settings.km_rate || 0);
    var total = hWd * (+r.weekday || 0) + hSat * (+r.saturday || 0) + hSun * (+r.sunday || 0) + flatAmt + extraAmt + kmSum * kmRate;
    var inv = state.data.invoices.find(function(x){ return x.worker_id === w.id && x.fort_start === fs; });

    var card = el('div', { 'class': 'card card-pad', style: 'margin-top:14px' });
    card.appendChild(el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:12px' }, [
      el('span', { 'class': 'avatar', style: 'background:' + w.colour }, initials(w.name)),
      el('div', { style: 'flex:1' }, [ el('b', null, w.name), el('div', { 'class': 't-cap' }, mine.length + ' shift' + (mine.length === 1 ? '' : 's') + ' this fortnight') ]),
      el('div', { 'class': 't-title t-num' }, money(total))
    ]));
    var grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px' });
    [['Weekday', hrsFmt(hWd) + ' h', money(hWd * (+r.weekday || 0))],
     ['Saturday', hrsFmt(hSat) + ' h', money(hSat * (+r.saturday || 0))],
     hSun ? ['Sunday', hrsFmt(hSun) + ' h', money(hSun * (+r.sunday || 0))] : null,
     ['Flat shifts', String(flatN), money(flatAmt)],
     ['Extra hours', hrsFmt(extraH) + ' h', money(extraAmt)],
     ['Kilometres', hrsFmt(kmSum) + ' km', money(kmSum * kmRate)]
    ].filter(Boolean).forEach(function(p){
      grid.appendChild(el('div', { style: 'background:var(--paper);border-radius:10px;padding:9px 12px' }, [
        el('div', { 'class': 't-cap' }, p[0]),
        el('b', { 'class': 't-num', style: 'font-size:14px' }, p[1]),
        el('div', { 'class': 't-cap t-num' }, p[2])
      ]));
    });
    card.appendChild(grid);
    card.appendChild(el('label', { 'class': 'checkrow', style: 'margin-top:10px' }, [
      el('input', { type: 'checkbox', checked: !!(inv && inv.received), onchange: function(e){
        sbUpsert('ac_invoices', [{ worker_id: w.id, fort_start: fs, received: e.target.checked }], 'worker_id,fort_start')
          .then(function(){ toast(e.target.checked ? 'Invoice marked received' : 'Invoice unmarked'); refresh(); })
          ["catch"](function(err){ toast(err.message, true); });
      } }),
      el('span', { style: 'font-size:14px' }, 'Invoice received for this fortnight')
    ]));
    main.appendChild(card);
  });
}

/* ================= admin: team ================= */
function viewTeam(main){
  main.appendChild(el('div', { 'class': 'section-head', style: 'margin:6px 0 16px' }, [
    el('div', { 'class': 't-display' }, 'Team'),
    el('button', { 'class': 'btn btn-pri btn-sm', onclick: openAddWorker }, [svgIcon(IC.plus), 'Add worker'])
  ]));

  var card = el('div', { 'class': 'card', style: 'padding:4px 16px' });
  state.data.workers.forEach(function(w){
    var status = !w.auth_uid ? ['No login', 'tag-bad'] : (w.must_change_password ? ['Awaiting first sign-in', 'tag-warn'] : ['Login active', 'tag-ok']);
    card.appendChild(el('div', { 'class': 'rowline', style: 'flex-wrap:wrap' }, [
      el('span', { 'class': 'avatar', style: 'background:' + w.colour }, initials(w.name)),
      el('div', { style: 'flex:1;min-width:140px' }, [
        el('div', { style: 'display:flex;gap:8px;align-items:center' }, [
          el('b', { style: 'font-size:14.5px' }, w.name),
          w.is_admin ? el('span', { 'class': 'tag tag-mut' }, 'Admin') : null
        ]),
        el('div', { 'class': 't-cap' }, w.email)
      ]),
      el('span', { 'class': 'tag ' + status[1] }, status[0]),
      el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, [
        !w.auth_uid ? el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ createLogin(w); } }, 'Create login') : null,
        w.auth_uid && !w.is_admin ? el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){
          confirmDlg('Reset ' + w.name + "'s password?", 'Next time they sign in with their current password they must choose a new one.', 'Reset', function(){
            sbUpd('ac_workers', 'id=eq.' + w.id, { must_change_password: true })
              .then(function(){ toast(w.name + ' will set a new password at next sign-in'); refresh(); })
              ["catch"](function(e){ toast(e.message, true); });
          });
        } }, 'Reset password') : null,
        !w.is_admin ? el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ openRates(w); } }, 'Rates') : null,
        el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ openWorkerModal(w); } }, 'Edit')
      ])
    ]));
  });
  main.appendChild(card);

  /* clients */
  var sec = el('div', { 'class': 'section' });
  sec.appendChild(el('div', { 'class': 'section-head', style: 'margin-bottom:10px' }, [
    el('div', { 'class': 't-label' }, 'Clients'),
    el('button', { 'class': 'btn btn-sm btn-pri', onclick: function(){ openClientModal(null); } }, [svgIcon(IC.plus), 'Add client'])
  ]));
  state.data.clients.forEach(function(c){
    var reqs = state.data.reqs.filter(function(r){ return r.client_id === c.id; });
    sec.appendChild(el('div', { 'class': 'card card-pad', style: 'margin-bottom:12px;border-left:4px solid ' + c.colour }, [
      el('div', { style: 'display:flex;align-items:baseline;gap:10px' }, [
        el('div', { 'class': 't-sub', style: 'color:' + c.colour }, c.name),
        el('button', { 'class': 'btn btn-sm btn-ghost', style: 'min-height:28px;padding:2px 10px;font-size:12px', onclick: function(){ openClientModal(c); } }, 'Edit client')
      ]),
      el('div', { 'class': 't-cap', style: 'display:flex;align-items:center;gap:4px;margin:4px 0 4px' }, [svgIcon(IC.pin), c.address + ' · geofence ' + (c.radius_m || 200) + ' m']),
      el('div', { 'class': 't-cap', style: 'display:flex;align-items:center;gap:4px;margin:0 0 10px' }, [svgIcon(IC.send), clientContactLine(c)]),
      el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, reqs.map(function(r){
        return el('div', { style: 'display:flex;gap:10px;align-items:center;font-size:13.5px;flex-wrap:wrap' }, [
          el('span', { 'class': 'tag ' + (r.type === 'sleepover' ? 'tag-sleep' : 'tag-day') }, r.type === 'sleepover' ? 'Sleepover' : 'Day'),
          el('b', null, r.label),
          el('span', { 'class': 't-mut t-num' }, fmtRange(r.start_t, r.end_t)),
          r.flat_pay != null ? el('span', { 'class': 'tag tag-mut t-num' }, 'flat ' + money(+r.flat_pay) + ' · extra ' + money((+r.flat_pay) / (shiftHours(r) || 1)) + '/h') : null,
          el('span', { 'class': 't-cap' }, r.days.length === 7 ? 'Every day' : r.days.slice().sort().map(function(d){ return DOW3[d]; }).join(' ')),
          el('button', { 'class': 'btn btn-sm btn-ghost', style: 'min-height:26px;padding:1px 8px;font-size:12px;margin-left:auto', onclick: function(){ openReqModal(c, r); } }, 'Edit')
        ]);
      })),
      el('button', { 'class': 'btn btn-sm btn-sec', style: 'margin-top:10px', onclick: function(){ openReqModal(c, null); } }, [svgIcon(IC.plus), 'Add shift type'])
    ]));
  });
  main.appendChild(sec);
}

/* who the weekly roster goes to, for the Team card */
function clientContactLine(c){
  var bits = [];
  if (c.contact_name) bits.push(c.contact_name);
  if (c.contact_phone) bits.push(c.contact_phone);
  if (c.contact_email) bits.push(c.contact_email);
  return bits.length ? 'Roster goes to ' + bits.join(' \u00b7 ') : 'No roster contact yet \u2014 add one to send them the weekly roster';
}

/* ---------- client editor ---------- */
function openClientModal(c){
  var f = { name: c ? c.name : '', address: c ? c.address : '', colour: c ? c.colour : '#0e7568',
    radius_m: c ? (c.radius_m || 200) : 200, lat: c && c.lat != null ? String(c.lat) : '', lng: c && c.lng != null ? String(c.lng) : '',
    contact_name: c && c.contact_name ? c.contact_name : '', contact_email: c && c.contact_email ? c.contact_email : '', contact_phone: c && c.contact_phone ? c.contact_phone : '' };
  function fld(label, key, type, hint){
    return el('div', { 'class': 'field' }, [
      el('label', null, label),
      el('input', { 'class': 'inp', type: type || 'text', value: f[key], oninput: function(e){ f[key] = e.target.value; } }),
      hint ? el('div', { 'class': 'hint' }, hint) : null
    ]);
  }
  var m = el('div', { 'class': 'modal', style: 'max-width:460px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', { 'class': 't-title' }, c ? 'Edit ' + c.name : 'Add client'),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      fld('Name', 'name'),
      fld('Address', 'address'),
      el('div', { 'class': 'grid2' }, [
        fld('Latitude', 'lat'),
        fld('Longitude', 'lng')
      ]),
      el('div', { 'class': 'hint', style: 'margin:-8px 0 14px' }, 'Used for the clock-in distance check. On Google Maps, right-click the address pin and copy the two numbers. Leave blank to skip the geofence.'),
      el('div', { 'class': 'grid2' }, [
        fld('Geofence (metres)', 'radius_m', 'number'),
        el('div', { 'class': 'field' }, [
          el('label', null, 'Colour'),
          el('input', { type: 'color', value: f.colour, style: 'width:64px;height:44px;border:1px solid var(--line-2);border-radius:10px;background:var(--card);padding:4px', onchange: function(e){ f.colour = e.target.value; } })
        ])
      ]),
      el('div', { 'class': 't-label', style: 'margin:4px 0 8px' }, 'Roster contact'),
      el('div', { 'class': 'hint', style: 'margin:-4px 0 12px' }, 'Who receives this client\u2019s weekly roster from Roster \u2192 Send roster (the participant, a family member or their coordinator). Optional.'),
      fld('Contact name', 'contact_name'),
      el('div', { 'class': 'grid2' }, [
        fld('Contact email', 'contact_email', 'email'),
        fld('Contact mobile (WhatsApp)', 'contact_phone', 'tel')
      ])
    ]),
    el('div', { 'class': 'modal-foot' }, [
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { 'class': 'btn btn-pri', onclick: function(e){
        if (!f.name.trim() || !f.address.trim()) { toast('Name and address, please.', true); return; }
        var rec = { name: f.name.trim(), address: f.address.trim(), colour: f.colour,
          radius_m: parseInt(f.radius_m, 10) || 200,
          lat: f.lat === '' ? null : parseFloat(f.lat), lng: f.lng === '' ? null : parseFloat(f.lng),
          contact_name: f.contact_name.trim() || null, contact_email: f.contact_email.trim().toLowerCase() || null, contact_phone: f.contact_phone.trim() || null };
        busyBtn(e.currentTarget, true);
        (c ? sbUpd('ac_clients', 'id=eq.' + c.id, rec) : sbIns('ac_clients', [rec]))
          .then(function(){ closeModal(); toast(c ? f.name + ' updated' : f.name + ' added — now add their shift types'); refresh(); })
          ["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
      } }, c ? 'Save changes' : 'Add client')
    ])
  ]);
  openModal(m);
}

/* ---------- shift requirement editor ---------- */
function openReqModal(client, r){
  var f = { label: r ? r.label : 'Day shift', type: r ? r.type : 'day',
    days: r ? r.days.slice() : [1,2,3,4,5], start_t: r ? r.start_t : '09:00', end_t: r ? r.end_t : '17:00',
    flat_pay: r && r.flat_pay != null ? String(r.flat_pay) : '' };
  var typeSel = el('select', { 'class': 'sel', onchange: function(e){ f.type = e.target.value; } }, [
    el('option', { value: 'day', selected: f.type === 'day' }, 'Day'),
    el('option', { value: 'sleepover', selected: f.type === 'sleepover' }, 'Sleepover (crosses midnight)')
  ]);
  var dayBoxes = el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, [1,2,3,4,5,6,0].map(function(d){
    var on = f.days.indexOf(d) >= 0;
    var b = el('button', { 'class': 'btn btn-sm ' + (on ? 'btn-dark' : 'btn-sec'), onclick: function(){
      var i = f.days.indexOf(d);
      if (i >= 0) f.days.splice(i, 1); else f.days.push(d);
      b.className = 'btn btn-sm ' + (f.days.indexOf(d) >= 0 ? 'btn-dark' : 'btn-sec');
    } }, DOW3[d]);
    return b;
  }));
  var m = el('div', { 'class': 'modal', style: 'max-width:460px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, (r ? 'Edit shift type' : 'Add shift type')),
        el('div', { 'class': 't-cap' }, client.name)
      ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 'field' }, [ el('label', null, 'Label'),
        el('input', { 'class': 'inp', value: f.label, oninput: function(e){ f.label = e.target.value; } }) ]),
      el('div', { 'class': 'field' }, [ el('label', null, 'Type'), typeSel ]),
      el('div', { 'class': 'field' }, [ el('label', null, 'Days'), dayBoxes ]),
      el('div', { 'class': 'grid2' }, [
        el('div', { 'class': 'field' }, [ el('label', null, 'Start'), el('input', { 'class': 'inp', type: 'time', value: f.start_t, onchange: function(e){ f.start_t = e.target.value; } }) ]),
        el('div', { 'class': 'field' }, [ el('label', null, 'End'), el('input', { 'class': 'inp', type: 'time', value: f.end_t, onchange: function(e){ f.end_t = e.target.value; } }) ])
      ]),
      el('div', { 'class': 'hint', style: 'margin-top:-6px' }, 'Changing times here shapes the roster grid and NEW shifts — shifts already created keep their own times (edit those from the roster).'),
      el('div', { 'class': 'field', style: 'margin-top:14px' }, [ el('label', null, 'Flat worker pay per shift ($)'),
        el('input', { 'class': 'inp t-num', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', placeholder: 'Leave blank to pay hourly', value: f.flat_pay, oninput: function(e){ f.flat_pay = e.target.value; } }),
        el('div', { 'class': 'hint' }, 'Blank = the worker’s hourly weekday / Saturday / Sunday rate applies. A flat amount is paid per shift of this type regardless of who works it; hours beyond the standard length are paid at flat ÷ standard hours.') ])
    ]),
    el('div', { 'class': 'modal-foot' }, [
      r ? el('button', { 'class': 'btn btn-danger', onclick: function(){
        confirmDlg('Remove this shift type?', 'It disappears from the roster grid. Existing shifts stay.', 'Remove', function(){
          sbUpd('ac_reqs', 'id=eq.' + r.id, { active: false })
            .then(function(){ closeModal(); toast('Shift type removed'); refresh(); })
            ["catch"](function(e){ toast(e.message, true); });
        }, true);
      } }, 'Remove') : null,
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { 'class': 'btn btn-pri', onclick: function(e){
        if (!f.label.trim()) { toast('Give it a label.', true); return; }
        if (!f.days.length) { toast('Pick at least one day.', true); return; }
        if (!f.start_t || !f.end_t) { toast('Set both times.', true); return; }
        var rec = { label: f.label.trim(), type: f.type, days: f.days, start_t: f.start_t, end_t: f.end_t,
          flat_pay: f.flat_pay === '' || f.flat_pay == null ? null : (parseFloat(f.flat_pay) || 0) };
        busyBtn(e.currentTarget, true);
        (r ? sbUpd('ac_reqs', 'id=eq.' + r.id, rec) : sbIns('ac_reqs', [Object.assign({ client_id: client.id }, rec)]))
          .then(function(){ closeModal(); toast('Shift type saved'); refresh(); })
          ["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
      } }, 'Save')
    ])
  ]);
  openModal(m);
}

/* ---------- worker editor ---------- */
function openWorkerModal(w){
  var f = { name: w.name, email: w.email, colour: w.colour, active: w.active };
  var m = el('div', { 'class': 'modal', style: 'max-width:420px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', { 'class': 't-title' }, 'Edit ' + w.name),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 'field' }, [ el('label', null, 'Name'),
        el('input', { 'class': 'inp', value: f.name, oninput: function(e){ f.name = e.target.value; } }) ]),
      el('div', { 'class': 'field' }, [ el('label', null, 'Email'),
        el('input', { 'class': 'inp', type: 'email', value: f.email, oninput: function(e){ f.email = e.target.value; } }),
        el('div', { 'class': 'hint' }, 'Changing this does not change the email they sign in with.') ]),
      el('div', { 'class': 'field' }, [ el('label', null, 'Colour'),
        el('input', { type: 'color', value: f.colour, style: 'width:64px;height:44px;border:1px solid var(--line-2);border-radius:10px;background:var(--card);padding:4px', onchange: function(e){ f.colour = e.target.value; } }) ]),
      el('label', { 'class': 'checkrow' }, [
        el('input', { type: 'checkbox', checked: f.active, onchange: function(e){ f.active = e.target.checked; } }),
        el('span', { style: 'font-size:14px' }, 'Active (shows in rostering and pay)')
      ])
    ]),
    el('div', { 'class': 'modal-foot' }, [
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { 'class': 'btn btn-pri', onclick: function(e){
        if (!f.name.trim() || !/@/.test(f.email)) { toast('Name and a valid email, please.', true); return; }
        busyBtn(e.currentTarget, true);
        sbUpd('ac_workers', 'id=eq.' + w.id, { name: f.name.trim(), email: f.email.trim().toLowerCase(), colour: f.colour, active: f.active })
          .then(function(){ closeModal(); toast(f.name + ' updated'); refresh(); })
          ["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
      } }, 'Save changes')
    ])
  ]);
  openModal(m);
}

function createLogin(w){
  var pass = firstName(w.name) + '@123';
  confirmDlg('Create a login for ' + w.name + '?', 'Email ' + w.email + ', starting password ' + pass + '. They must set their own password the first time they sign in.', 'Create login', function(){
    sbSignup(w.email, pass).then(function(res){
      var uid = res.user ? res.user.id : (res.id || null);
      return sbUpd('ac_workers', 'id=eq.' + w.id, { auth_uid: uid, must_change_password: true });
    }).then(function(){ toast('Login created for ' + w.name); refresh(); })
    ["catch"](function(e){ toast(e.message, true); });
  });
}

function openAddWorker(){
  var f = { name: '', email: '', colour: '#0e7568' };
  var m = el('div', { 'class': 'modal', style: 'max-width:420px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', { 'class': 't-title' }, 'Add worker'),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      el('div', { 'class': 'field' }, [ el('label', null, 'Name'), el('input', { 'class': 'inp', oninput: function(e){ f.name = e.target.value; } }) ]),
      el('div', { 'class': 'field' }, [ el('label', null, 'Email'), el('input', { 'class': 'inp', type: 'email', oninput: function(e){ f.email = e.target.value; } }) ]),
      el('div', { 'class': 'field' }, [ el('label', null, 'Colour'), el('input', { type: 'color', value: f.colour, style: 'width:64px;height:44px;border:1px solid var(--line-2);border-radius:10px;background:var(--card);padding:4px', onchange: function(e){ f.colour = e.target.value; } }) ])
    ]),
    el('div', { 'class': 'modal-foot' }, [
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { 'class': 'btn btn-pri', onclick: function(e){
        if (!f.name.trim() || !/@/.test(f.email)) { toast('Name and a valid email, please.', true); return; }
        busyBtn(e.currentTarget, true);
        sbIns('ac_workers', [{ name: f.name.trim(), email: f.email.trim().toLowerCase(), colour: f.colour, must_change_password: true }])
          .then(function(){ closeModal(); toast(f.name + ' added — now create their login from the list'); refresh(); })
          ["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
      } }, 'Add worker')
    ])
  ]);
  openModal(m);
}

function openRates(w){
  var r = {};
  var cur = w.rates || {};
  ['weekday','saturday','sunday'].forEach(function(k){ r[k] = cur[k] != null ? cur[k] : 0; });
  function rateField(label, key, hint){
    return el('div', { 'class': 'field' }, [
      el('label', null, label),
      el('input', { 'class': 'inp t-num', type: 'number', inputmode: 'decimal', step: '0.01', min: '0', value: String(r[key]), oninput: function(e){ r[key] = parseFloat(e.target.value) || 0; } }),
      hint ? el('div', { 'class': 'hint' }, hint) : null
    ]);
  }
  var m = el('div', { 'class': 'modal', style: 'max-width:420px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [ el('div', { 'class': 't-title' }, w.name + ' — rates'), el('div', { 'class': 't-cap' }, 'Per hour, for hourly shift types (Allan, Nick). Flat shift types like Tim’s are set on the shift type under Team.') ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      rateField('Weekday ($/h)', 'weekday'),
      rateField('Saturday ($/h)', 'saturday'),
      rateField('Sunday ($/h)', 'sunday', 'No Sunday shifts at the moment — set to the Saturday rate as a default.')
    ]),
    el('div', { 'class': 'modal-foot' }, [
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      el('button', { 'class': 'btn btn-pri', onclick: function(e){
        busyBtn(e.currentTarget, true);
        sbUpd('ac_workers', 'id=eq.' + w.id, { rates: r })
          .then(function(){ closeModal(); toast('Rates saved for ' + w.name); refresh(); })
          ["catch"](function(err){ busyBtn(e.target, false); toast(err.message, true); });
      } }, 'Save rates')
    ])
  ]);
  openModal(m);
}

/* ================= boot ================= */
/* only re-render on WIDTH change — mobile keyboards fire height-only resizes
   that would otherwise wipe in-progress input */
window.addEventListener('resize', (function(){
  var t, lastW = window.innerWidth;
  return function(){
    clearTimeout(t);
    t = setTimeout(function(){
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      if (state.auth && !state.loading) render();
    }, 180);
  };
})());

(function boot(){
  var saved = loadSession();
  // only restore a session that belongs to THIS portal and can renew itself
  // (token + refresh) — anything older gets a clean sign-in instead of a
  // dead "JWT expired" screen
  if (saved && saved.token && saved.refresh && ((PORTAL === 'admin' && saved.mode === 'admin') || (PORTAL === 'worker' && saved.mode === 'worker'))) {
    state.auth = saved;
  } else {
    clearSession();
  }
  render();
  if (state.auth) loadAll().then(render);
})();
