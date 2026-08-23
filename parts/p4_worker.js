/* ================= worker home ================= */
function myShifts(w){
  return state.data.shifts.filter(function(s){ return s.worker_id === w.id; });
}
function missingNoteShifts(w){
  var t = todayYmd();
  return myShifts(w).filter(function(s){
    return s.date >= addDays(t, -14) && shiftEnded(s) && notesForShift(s.id).length === 0;
  }).sort(function(a,b){ return a.date < b.date ? 1 : -1; });
}

function viewWorkerHome(main, w){
  var t = todayYmd();
  main.appendChild(el('div', { style: 'margin:6px 0 22px' }, [
    el('div', { 'class': 't-display' }, "G'day, " + firstName(w.name)),
    el('div', { 'class': 't-mut', style: 'margin-top:4px;font-size:15px' }, fmtDateFull(t))
  ]));

  /* quick actions */
  main.appendChild(el('div', { 'class': 'quickgrid' }, [
    el('button', { 'class': 'quickbtn', onclick: function(){ pickShiftThen(w, 'note'); } }, [
      el('span', { 'class': 'qb-ic', style: 'background:var(--acc-soft);color:var(--acc)' }, svgIcon(IC.note)),
      el('b', null, 'Add a shift note'),
      el('span', { 'class': 't-cap' }, 'Write up a shift')
    ]),
    el('button', { 'class': 'quickbtn', onclick: function(){ pickShiftThen(w, 'incident'); } }, [
      el('span', { 'class': 'qb-ic', style: 'background:var(--warn-soft);color:var(--warnc)' }, svgIcon(IC.alert)),
      el('b', null, 'Report an incident'),
      el('span', { 'class': 't-cap' }, 'File an incident report')
    ])
  ]));

  /* reminders */
  var rems = state.data.reminders.filter(function(r){ return r.worker_id === w.id && !r.acknowledged_at; });
  if (rems.length) {
    var sec = el('div', { 'class': 'section' });
    sec.appendChild(el('div', { 'class': 't-label', style: 'margin-bottom:10px' }, 'From Ash'));
    rems.forEach(function(r){
      var shift = r.shift_id ? shiftById(r.shift_id) : null;
      sec.appendChild(el('div', { 'class': 'banner acc', style: 'margin-bottom:10px' }, [
        el('div', { style: 'color:var(--acc);flex:none;margin-top:2px' }, svgIcon(IC.bell)),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('div', { style: 'font-size:14px;white-space:pre-wrap' }, r.message),
          el('div', { 'class': 't-cap', style: 'margin-top:2px' }, fmtDT(r.created_at)),
          el('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap' }, [
            shift ? el('button', { 'class': 'btn btn-sm btn-pri', onclick: function(){ openNoteModal({ shift: shift, worker: w }); } }, 'Add the note') : null,
            el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){
              sbUpd('ac_reminders', 'id=eq.' + r.id, { acknowledged_at: new Date().toISOString() }).then(function(){ toast('Marked as read'); refresh(); })["catch"](function(e){ toast(e.message, true); });
            } }, 'Got it')
          ])
        ])
      ]));
    });
    main.appendChild(sec);
  }

  /* missing notes banner */
  var missing = missingNoteShifts(w);
  if (missing.length) {
    var mb = el('div', { 'class': 'section' });
    mb.appendChild(el('div', { 'class': 'banner warn' }, [
      el('div', { style: 'color:var(--warnc);flex:none;margin-top:2px' }, svgIcon(IC.note)),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('b', { style: 'font-size:14px' }, missing.length === 1 ? '1 shift is still missing its note' : missing.length + ' shifts are still missing notes'),
        el('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:10px' }, missing.slice(0, 5).map(function(s){
          var c = clientById(s.client_id);
          return el('button', { 'class': 'btn btn-sm btn-sec', style: 'justify-content:flex-start', onclick: function(){ openNoteModal({ shift: s, worker: w }); } }, [
            el('span', { 'class': 'dot', style: 'background:' + (c ? c.colour : '#999') }),
            (c ? c.name : '?') + ' — ' + fmtDate(s.date) + ', ' + fmtRange(s.start_t, s.end_t)
          ]);
        })),
        missing.length > 5 ? el('div', { 'class': 't-cap', style: 'margin-top:6px' }, '…and ' + (missing.length - 5) + ' more under My notes') : null
      ])
    ]));
    main.appendChild(mb);
  }

  /* today's shifts */
  var todays = myShifts(w).filter(shiftIsToday).sort(function(a,b){ return tMin(a.start_t) - tMin(b.start_t); });
  var secT = el('div', { 'class': 'section' });
  secT.appendChild(el('div', { 'class': 'section-head' }, el('div', { 'class': 't-title' }, 'Today')));
  if (!todays.length) {
    secT.appendChild(el('div', { 'class': 'card empty' }, [
      el('div', { 'class': 'e-art' }, '☕'),
      el('b', null, 'Nothing on today'),
      'Enjoy the day off — your next shifts are below.'
    ]));
  } else {
    todays.forEach(function(s){ secT.appendChild(shiftCard(s, w, { clock: true })); });
  }
  main.appendChild(secT);

  /* coming up */
  var upcoming = myShifts(w).filter(function(s){ return s.date > t; }).sort(function(a,b){
    return a.date === b.date ? tMin(a.start_t) - tMin(b.start_t) : (a.date < b.date ? -1 : 1);
  }).slice(0, 5);
  var secU = el('div', { 'class': 'section' });
  secU.appendChild(el('div', { 'class': 'section-head' }, el('div', { 'class': 't-title' }, 'Coming up')));
  if (!upcoming.length) {
    secU.appendChild(el('div', { 'class': 'card empty' }, [
      el('div', { 'class': 'e-art' }, '—'),
      el('b', null, 'No upcoming shifts yet'),
      'Ash is still building next week’s roster.'
    ]));
  } else {
    var list = el('div', { 'class': 'card', style: 'padding:4px 16px' });
    upcoming.forEach(function(s){
      var c = clientById(s.client_id);
      list.appendChild(el('div', { 'class': 'rowline', style: 'cursor:pointer', onclick: function(){ openShiftSheet(s, w); } }, [
        el('span', { 'class': 'dot', style: 'background:' + (c ? c.colour : '#999') }),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('b', { style: 'font-size:14px' }, c ? c.name : '?'),
          el('div', { 'class': 't-cap t-num' }, fmtDate(s.date) + ' · ' + fmtRange(s.start_t, s.end_t))
        ]),
        el('span', { 'class': 'tag ' + (s.type === 'sleepover' ? 'tag-sleep' : 'tag-day') }, s.type === 'sleepover' ? 'Sleepover' : 'Day')
      ]));
    });
    secU.appendChild(list);
  }
  main.appendChild(secU);
}

/* pick a shift then open note/incident */
function pickShiftThen(w, what){
  var t = todayYmd();
  var mine = myShifts(w).filter(function(s){ return s.date >= addDays(t, -30) && s.date <= addDays(t, 7); })
    .sort(function(a,b){
      // today first, then most recent past, then future
      var at = a.date === t ? 0 : (a.date < t ? 1 : 2);
      var bt = b.date === t ? 0 : (b.date < t ? 1 : 2);
      if (at !== bt) return at - bt;
      if (at === 1) return a.date < b.date ? 1 : -1;
      return a.date < b.date ? -1 : 1;
    });
  if (!mine.length) { toast('No shifts of yours in the last month.', true); return; }
  var m = el('div', { 'class': 'modal', style: 'max-width:440px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', { 'class': 't-title' }, what === 'note' ? 'Which shift is the note for?' : 'Which shift was the incident on?'),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, mine.slice(0, 21).map(function(s){
      var c = clientById(s.client_id);
      var has = notesForShift(s.id).length;
      return el('button', { 'class': 'listnote', style: 'display:flex;align-items:center;gap:10px;width:100%;margin-bottom:8px;text-align:left', onclick: function(){
        closeModal();
        if (what === 'note') openNoteModal({ shift: s, worker: w });
        else openIncidentModal({ shift: s, worker: w });
      } }, [
        el('span', { 'class': 'dot', style: 'background:' + (c ? c.colour : '#999') }),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('b', { style: 'font-size:14px' }, (c ? c.name : '?') + (s.date === t ? ' · today' : '')),
          el('div', { 'class': 't-cap t-num' }, fmtDate(s.date) + ' · ' + fmtRange(s.start_t, s.end_t))
        ]),
        (what === 'note' && has) ? el('span', { 'class': 'tag tag-ok' }, 'Noted') : null
      ]);
    }))
  ]);
  openModal(m);
}

/* ================= shift card ================= */
function shiftCard(s, w, opts){
  opts = opts || {};
  var c = clientById(s.client_id);
  var notes = notesForShift(s.id);
  var incidents = incidentsForShift(s.id);
  var clocks = clocksForShift(s.id);
  var cin = clocks.filter(function(x){ return x.kind === 'in'; }).slice(-1)[0];
  var cout = clocks.filter(function(x){ return x.kind === 'out'; }).slice(-1)[0];

  var card = el('div', { 'class': 'shiftcard', style: '--c:' + (c ? c.colour : 'var(--acc)') + ';margin-bottom:12px' });
  card.appendChild(el('div', { 'class': 'sc-top' }, [
    el('div', null, [
      el('div', { 'class': 'sc-time' }, fmtRange(s.start_t, s.end_t)),
      el('div', { style: 'font-weight:700;font-size:15px;color:' + (c ? c.colour : 'var(--ink)') }, c ? c.name : '?'),
      el('div', { 'class': 't-cap', style: 'display:flex;align-items:center;gap:4px;margin-top:2px' }, [
        svgIcon(IC.pin), c ? c.address : ''
      ])
    ]),
    el('div', { style: 'display:flex;flex-direction:column;align-items:flex-end;gap:6px' }, [
      el('span', { 'class': 'tag ' + (s.type === 'sleepover' ? 'tag-sleep' : 'tag-day') }, s.type === 'sleepover' ? 'Sleepover' : 'Day'),
      opts.showDate ? el('span', { 'class': 't-cap t-num' }, fmtDate(s.date)) : null
    ])
  ]));

  /* clock area — only for today's shifts */
  if (opts.clock && shiftIsToday(s)) {
    var clockRow = el('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' });
    if (cin) clockRow.appendChild(el('span', { 'class': 'tag tag-ok' }, ['In ', fmtTime(pad2(new Date(cin.at).getHours()) + ':' + pad2(new Date(cin.at).getMinutes()))]));
    if (cout) clockRow.appendChild(el('span', { 'class': 'tag tag-mut' }, ['Out ', fmtTime(pad2(new Date(cout.at).getHours()) + ':' + pad2(new Date(cout.at).getMinutes()))]));
    if (!cin) clockRow.appendChild(clockBtn(s, w, 'in'));
    else if (!cout) clockRow.appendChild(clockBtn(s, w, 'out'));
    card.appendChild(clockRow);
  }

  /* actions */
  card.appendChild(el('div', { 'class': 'sc-actions' }, [
    el('button', { 'class': 'btn btn-sm btn-pri', onclick: function(){ openNoteModal({ shift: s, worker: w }); } }, [svgIcon(IC.plus), 'Add note']),
    el('button', { 'class': 'btn btn-sm btn-sec', onclick: function(){ openIncidentModal({ shift: s, worker: w }); } }, 'Incident report')
  ]));

  /* attached notes & incident reports */
  if (notes.length || incidents.length) {
    var att = el('div', { style: 'display:flex;flex-direction:column;gap:6px' });
    notes.forEach(function(n){
      att.appendChild(el('button', { 'class': 'listnote', style: 'display:flex;align-items:center;gap:8px;width:100%;text-align:left', onclick: function(){ openNoteModal({ note: n, shift: s, worker: w }); } }, [
        el('span', { style: 'color:var(--acc);flex:none;display:flex' }, svgIcon(IC.note)),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('b', { style: 'font-size:13.5px' }, n.note_type),
          el('div', { 'class': 't-cap', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, notePreview(n.body))
        ]),
        el('span', { 'class': 't-cap', style: 'flex:none' }, 'Edit')
      ]));
    });
    incidents.forEach(function(ir){
      att.appendChild(el('button', { 'class': 'listnote', style: 'display:flex;align-items:center;gap:8px;width:100%;text-align:left', onclick: function(){ openIncidentModal({ incident: ir, shift: s, worker: w }); } }, [
        el('span', { style: 'color:var(--warnc);flex:none;display:flex' }, svgIcon(IC.alert)),
        el('div', { style: 'flex:1;min-width:0' }, [
          el('b', { style: 'font-size:13.5px' }, 'Incident report'),
          el('div', { 'class': 't-cap', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, ir.ticket_desc || '(no description)')
        ]),
        el('span', { 'class': 't-cap', style: 'flex:none' }, 'Edit')
      ]));
    });
    card.appendChild(att);
  }
  return card;
}

function notePreview(body){
  // first non-heading, non-empty line
  var lines = (body || '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var L = lines[i].trim();
    if (L && L.slice(0,2) !== '**') return L;
  }
  return (lines[0] || '').replace(/\*\*/g, '').slice(0, 80);
}

function clockBtn(s, w, kind){
  var c = clientById(s.client_id);
  var btn = el('button', { 'class': 'btn btn-sm ' + (kind === 'in' ? 'btn-dark' : 'btn-sec'), onclick: doClock }, [
    svgIcon(IC.clock), kind === 'in' ? 'Clock in' : 'Clock out'
  ]);
  function doClock(){
    if (!c) { toast('This shift has no client attached — ask Ash to fix it.', true); return; }
    if (!navigator.geolocation) { toast('Location is not available on this device.', true); return; }
    btn.disabled = true; btn.textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition(function(pos){
      var noSite = (c.lat == null || c.lng == null);
      var d = noSite ? null : haversine(pos.coords.latitude, pos.coords.longitude, c.lat, c.lng);
      var radius = c.radius_m || 200;
      if (d != null && d > radius) {
        btn.disabled = false; btn.innerHTML = ''; appendKids(btn, [svgIcon(IC.clock), kind === 'in' ? 'Clock in' : 'Clock out']);
        toast("You're " + Math.round(d) + " m from " + c.name + "'s address — get within " + radius + " m to clock " + kind + ".", true);
        return;
      }
      sbIns('ac_clock', [{ shift_id: s.id, worker_id: w.id, kind: kind, at: new Date().toISOString(),
        lat: pos.coords.latitude, lng: pos.coords.longitude, distance_m: d == null ? null : Math.round(d) }])
        .then(function(){ toast('Clocked ' + kind + (d == null ? '' : ' · ' + Math.round(d) + ' m from site')); closeModal(); refresh(); })
        ["catch"](function(e){ btn.disabled = false; toast(e.message, true); });
    }, function(err){
      btn.disabled = false; btn.innerHTML = ''; appendKids(btn, [svgIcon(IC.clock), kind === 'in' ? 'Clock in' : 'Clock out']);
      toast(err.code === 1 ? 'Location permission was denied — allow it in your browser to clock ' + kind + '.' : 'Could not get your location. Try again.', true);
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }
  return btn;
}

/* shift sheet from calendar tap */
function openShiftSheet(s, w){
  var m = el('div', { 'class': 'modal', style: 'max-width:480px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', { 'class': 't-title' }, fmtDate(s.date)),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    el('div', { 'class': 'modal-body' }, shiftCard(s, w, { clock: true, showDate: false }))
  ]);
  openModal(m);
}

/* ================= my notes ================= */
function viewMyNotes(main, w){
  main.appendChild(el('div', { 'class': 'section-head', style: 'margin:6px 0 16px' }, [
    el('div', { 'class': 't-display' }, 'My notes')
  ]));
  var mine = state.data.notes.filter(function(n){ return n.worker_id === w.id; });
  var myIncidents = state.data.incidents.filter(function(n){ return n.worker_id === w.id; });
  if (!mine.length && !myIncidents.length) {
    main.appendChild(el('div', { 'class': 'card empty' }, [
      el('div', { 'class': 'e-art' }, '✎'),
      el('b', null, 'Nothing written yet'),
      'Notes and incident reports you write will appear here.'
    ]));
    return;
  }
  var all = mine.map(function(n){ return { kind: 'note', at: n.created_at, rec: n }; })
    .concat(myIncidents.map(function(n){ return { kind: 'ir', at: n.created_at, rec: n }; }))
    .sort(function(a,b){ return a.at < b.at ? 1 : -1; });
  var list = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
  all.forEach(function(item){
    var rec = item.rec;
    var c = clientById(rec.participant_id);
    var shift = rec.shift_id ? shiftById(rec.shift_id) : null;
    list.appendChild(el('button', { 'class': 'listnote', style: 'display:flex;gap:12px;align-items:flex-start;width:100%;text-align:left', onclick: function(){
      if (item.kind === 'note') openNoteModal({ note: rec, shift: shift, worker: w });
      else openIncidentModal({ incident: rec, shift: shift, worker: w });
    } }, [
      el('span', { style: 'flex:none;display:flex;margin-top:2px;color:' + (item.kind === 'note' ? 'var(--acc)' : 'var(--warnc)') }, svgIcon(item.kind === 'note' ? IC.note : IC.alert)),
      el('div', { style: 'flex:1;min-width:0' }, [
        el('div', { style: 'display:flex;gap:8px;align-items:baseline;flex-wrap:wrap' }, [
          el('b', { style: 'font-size:14px' }, item.kind === 'note' ? rec.note_type : 'Incident report'),
          c ? el('span', { style: 'font-size:13px;font-weight:700;color:' + c.colour }, c.name) : null,
          el('span', { 'class': 't-cap t-num' }, shift ? fmtDate(shift.date) : fmtDT(rec.created_at))
        ]),
        el('div', { 'class': 't-cap', style: 'margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' },
          item.kind === 'note' ? notePreview(rec.body) : (rec.ticket_desc || ''))
      ]),
      el('span', { 'class': 't-cap', style: 'flex:none;margin-top:3px' }, 'Edit')
    ]));
  });
  main.appendChild(list);
}

/* ================= availability ================= */
function viewAvailability(main, w){
  var nextMon = addDays(mondayOf(todayYmd()), 7);
  main.appendChild(el('div', { style: 'margin:6px 0 4px' }, el('div', { 'class': 't-display' }, 'Availability')));
  main.appendChild(el('p', { 'class': 't-mut', style: 'margin-bottom:20px' },
    'For the week of ' + fmtDate(nextMon) + ' – ' + fmtDate(addDays(nextMon, 6)) + '. Due each Saturday.'));

  var existing = state.data.avail.find(function(a){ return a.worker_id === w.id && a.week_start === nextMon; });
  var days = {};
  for (var i = 0; i < 7; i++) {
    var dnum = String(dow(addDays(nextMon, i)));
    days[dnum] = existing && existing.days ? !!existing.days[dnum] : false;
  }
  var card = el('div', { 'class': 'card card-pad' });
  var grid = el('div', { style: 'display:flex;flex-direction:column;gap:4px' });
  for (i = 0; i < 7; i++) (function(i){
    var d = addDays(nextMon, i);
    var dnum = String(dow(d));
    var row = el('label', { 'class': 'checkrow', style: 'padding:11px 8px;border-radius:10px' }, [
      el('input', { type: 'checkbox', checked: days[dnum], onchange: function(e){ days[dnum] = e.target.checked; } }),
      el('div', { style: 'flex:1' }, [
        el('b', { style: 'font-size:14.5px' }, DOW[pd(d).getDay()]),
        el('span', { 'class': 't-cap t-num', style: 'margin-left:8px' }, fmtDM(d))
      ])
    ]);
    grid.appendChild(row);
  })(i);
  card.appendChild(grid);
  var saveBtn = el('button', { 'class': 'btn btn-pri btn-big btn-block', style: 'margin-top:16px', onclick: function(){
    busyBtn(saveBtn, true);
    sbUpsert('ac_availability', [{ worker_id: w.id, week_start: nextMon, days: days, updated_at: new Date().toISOString() }], 'worker_id,week_start')
      .then(function(){ toast('Availability saved — thanks!'); refresh(); })
      ["catch"](function(e){ busyBtn(saveBtn, false); toast(e.message, true); });
  } }, existing ? 'Update availability' : 'Submit availability');
  card.appendChild(saveBtn);
  main.appendChild(card);

  /* urgent change */
  var sec = el('div', { 'class': 'section' });
  sec.appendChild(el('div', { 'class': 't-label', style: 'margin-bottom:10px' }, 'Something changed?'));
  var uc = el('div', { 'class': 'card card-pad' });
  uc.appendChild(el('p', { 'class': 't-mut', style: 'font-size:14px;margin-bottom:12px' },
    "If your availability has changed at short notice, send Ash an urgent message — it lands straight in the admin inbox."));
  var ta = el('textarea', { 'class': 'ta', rows: '3', placeholder: "e.g. I can't do Thursday any more — sorry!" });
  uc.appendChild(ta);
  var flagBtn = el('button', { 'class': 'btn btn-dark', style: 'margin-top:12px', onclick: function(){
    var msg = ta.value.trim();
    if (!msg) { toast('Write a quick message first.', true); return; }
    busyBtn(flagBtn, true);
    sbIns('ac_flags', [{ kind: 'availability', worker_id: w.id, urgent: true, msg: msg }])
      .then(function(){ ta.value = ''; busyBtn(flagBtn, false); toast('Sent to Ash as urgent'); refresh(); })
      ["catch"](function(e){ busyBtn(flagBtn, false); toast(e.message, true); });
  } }, [svgIcon(IC.send), 'Send urgent change']);
  uc.appendChild(flagBtn);
  sec.appendChild(uc);
  main.appendChild(sec);
}
