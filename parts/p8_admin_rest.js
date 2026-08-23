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
    return s.worker_id && s.date >= addDays(t, -14) && shiftEnded(s) && notesForShift(s.id).length === 0;
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
        w ? el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ openReminder(s, w); } }, 'Remind') : null
      ]));
    });
    secO.appendChild(listO);
  }
  main.appendChild(secO);

  /* latest notes */
  var secN = el('div', { 'class': 'section' });
  secN.appendChild(el('div', { 'class': 't-label', style: 'margin-bottom:10px' }, 'Latest shift notes'));
  var latest = state.data.notes.slice(0, 8);
  if (!latest.length) secN.appendChild(el('div', { 'class': 'notice' }, 'No notes yet.'));
  else {
    var listN = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    latest.forEach(function(n){
      var w = workerById(n.worker_id), c = clientById(n.participant_id), s = n.shift_id ? shiftById(n.shift_id) : null;
      listN.appendChild(el('button', { 'class': 'listnote', style: 'display:flex;gap:10px;width:100%;text-align:left', onclick: function(){ openNoteModal({ note: n, shift: s, worker: w }); } }, [
        el('span', { style: 'color:var(--acc);display:flex;margin-top:2px' }, svgIcon(IC.note)),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { style: 'display:flex;gap:8px;align-items:baseline;flex-wrap:wrap' }, [
            el('b', { style: 'font-size:13.5px' }, n.note_type),
            c ? el('span', { style: 'font-size:12.5px;font-weight:700;color:' + c.colour }, c.name) : null,
            w ? el('span', { 'class': 't-cap' }, w.name) : null,
            el('span', { 'class': 't-cap t-num' }, fmtDT(n.created_at))
          ]),
          el('div', { 'class': 't-cap', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px' }, notePreview(n.body))
        ]),
        el('span', { 'class': 't-cap', style: 'flex:none' }, 'Read / edit')
      ]));
    });
    secN.appendChild(listN);
  }
  main.appendChild(secN);

  /* latest incidents */
  var secI = el('div', { 'class': 'section' });
  secI.appendChild(el('div', { 'class': 't-label', style: 'margin-bottom:10px' }, 'Incident reports'));
  var irs = state.data.incidents.slice(0, 8);
  if (!irs.length) secI.appendChild(el('div', { 'class': 'notice' }, 'No incident reports.'));
  else {
    var listI = el('div', { style: 'display:flex;flex-direction:column;gap:8px' });
    irs.forEach(function(ir){
      var w = workerById(ir.worker_id), c = clientById(ir.participant_id), s = ir.shift_id ? shiftById(ir.shift_id) : null;
      listI.appendChild(el('button', { 'class': 'listnote', style: 'display:flex;gap:10px;width:100%;text-align:left', onclick: function(){ openIncidentModal({ incident: ir, shift: s, worker: w }); } }, [
        el('span', { style: 'color:var(--warnc);display:flex;margin-top:2px' }, svgIcon(IC.alert)),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { style: 'display:flex;gap:8px;align-items:baseline;flex-wrap:wrap' }, [
            el('b', { style: 'font-size:13.5px' }, (ir.incident_types || []).join(', ') || 'Incident'),
            c ? el('span', { style: 'font-size:12.5px;font-weight:700;color:' + c.colour }, c.name) : null,
            el('span', { 'class': 't-cap t-num' }, ir.incident_date ? fmtDate(ir.incident_date) : fmtDT(ir.created_at))
          ]),
          el('div', { 'class': 't-cap', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px' }, ir.ticket_desc)
        ]),
        el('span', { 'class': 't-cap', style: 'flex:none' }, 'Read / edit')
      ]));
    });
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
          !a ? el('span', { 'class': 'tag tag-warn', style: 'margin-left:auto' }, 'Not in') : null
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
    sec.appendChild(el('div', { 'class': 't-label', style: 'margin-bottom:10px' }, "Haven't submitted"));
    var box = el('div', { 'class': 'card', style: 'padding:4px 16px' });
    missing.forEach(function(w){
      box.appendChild(el('div', { 'class': 'rowline' }, [
        el('span', { 'class': 'avatar', style: 'background:' + w.colour }, initials(w.name)),
        el('div', { style: 'flex:1' }, [ el('b', { style: 'font-size:14px' }, w.name), el('div', { 'class': 't-cap' }, w.email) ]),
        el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(e){
          var b = e.currentTarget;
          var nmsg = firstName(w.name) + ', could you submit your availability for next week (' + fmtDate(nextMon) + ' onwards)? It’s due Saturday. Thanks!';
          sbIns('ac_reminders', [{ shift_id: null, worker_id: w.id, sent_by: 'Ash', message: nmsg, emailed: false }])
            .then(function(){
              sendPush([w.id], 'Availability reminder', nmsg);
              b.textContent = 'Nudged ✓'; b.disabled = true; toast('Nudge sent to ' + w.name); refresh();
            })
            ["catch"](function(err){ toast(err.message, true); });
        } }, 'Nudge')
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
  var anyRates = workers.some(function(w){ var r = w.rates || {}; return (r.weekday || r.saturday || r.sunday || r.sleepover); });
  if (!anyRates) {
    main.appendChild(el('div', { 'class': 'banner warn', style: 'margin-bottom:14px' }, [
      el('div', { style: 'color:var(--warnc);display:flex' }, svgIcon(IC.alert)),
      el('div', { style: 'font-size:13.5px' }, 'All pay rates are still $0 — set each worker’s rates under Team → Rates and the totals here fill in.')
    ]));
  }

  workers.forEach(function(w){
    var mine = state.data.shifts.filter(function(s){ return s.worker_id === w.id && s.date >= fs && s.date <= fe; });
    var hWd = 0, hSat = 0, hSun = 0, sleeps = 0, kmSum = 0;
    mine.forEach(function(s){
      if (s.type === 'sleepover') { sleeps++; return; }
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
    var total = hWd * (+r.weekday || 0) + hSat * (+r.saturday || 0) + hSun * (+r.sunday || 0) + sleeps * (+r.sleepover || 0) + kmSum * kmRate;
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
     ['Sunday', hrsFmt(hSun) + ' h', money(hSun * (+r.sunday || 0))],
     ['Sleepovers', String(sleeps), money(sleeps * (+r.sleepover || 0))],
     ['Kilometres', hrsFmt(kmSum) + ' km', money(kmSum * kmRate)]
    ].forEach(function(p){
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
        !w.is_admin ? el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ openRates(w); } }, 'Rates') : null
      ])
    ]));
  });
  main.appendChild(card);

  /* clients */
  var sec = el('div', { 'class': 'section' });
  sec.appendChild(el('div', { 'class': 't-label', style: 'margin-bottom:10px' }, 'Clients'));
  state.data.clients.forEach(function(c){
    var reqs = state.data.reqs.filter(function(r){ return r.client_id === c.id; });
    sec.appendChild(el('div', { 'class': 'card card-pad', style: 'margin-bottom:12px;border-left:4px solid ' + c.colour }, [
      el('div', { 'class': 't-sub', style: 'color:' + c.colour }, c.name),
      el('div', { 'class': 't-cap', style: 'display:flex;align-items:center;gap:4px;margin:4px 0 10px' }, [svgIcon(IC.pin), c.address + ' · geofence ' + (c.radius_m || 200) + ' m']),
      el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, reqs.map(function(r){
        return el('div', { style: 'display:flex;gap:10px;align-items:center;font-size:13.5px' }, [
          el('span', { 'class': 'tag ' + (r.type === 'sleepover' ? 'tag-sleep' : 'tag-day') }, r.type === 'sleepover' ? 'Sleepover' : 'Day'),
          el('b', null, r.label),
          el('span', { 'class': 't-mut t-num' }, fmtRange(r.start_t, r.end_t)),
          el('span', { 'class': 't-cap' }, r.days.length === 7 ? 'Every day' : r.days.slice().sort().map(function(d){ return DOW3[d]; }).join(' '))
        ]);
      }))
    ]));
  });
  main.appendChild(sec);
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
  ['weekday','saturday','sunday','sleepover'].forEach(function(k){ r[k] = cur[k] != null ? cur[k] : 0; });
  function rateField(label, key, hint){
    return el('div', { 'class': 'field' }, [
      el('label', null, label),
      el('input', { 'class': 'inp t-num', type: 'number', step: '0.01', min: '0', value: String(r[key]), oninput: function(e){ r[key] = parseFloat(e.target.value) || 0; } }),
      hint ? el('div', { 'class': 'hint' }, hint) : null
    ]);
  }
  var m = el('div', { 'class': 'modal', style: 'max-width:420px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [ el('div', { 'class': 't-title' }, w.name + ' — rates'), el('div', { 'class': 't-cap' }, 'Per hour, except sleepover (per night)') ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, [
      rateField('Weekday ($/h)', 'weekday'),
      rateField('Saturday ($/h)', 'saturday'),
      rateField('Sunday ($/h)', 'sunday'),
      rateField('Sleepover ($/night)', 'sleepover')
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
  // only restore a session that belongs to THIS portal
  if (saved && ((PORTAL === 'admin' && saved.mode === 'admin') || (PORTAL === 'worker' && saved.mode === 'worker'))) {
    state.auth = saved;
  }
  render();
  if (state.auth) loadAll().then(render);
})();
