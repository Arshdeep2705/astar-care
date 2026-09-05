/* ================= attachments ================= */
function fileKindOk(f){
  return /^image\//.test(f.type) || f.type === 'application/pdf' || f.type === 'text/plain' ||
    f.type === 'application/msword' ||
    f.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}
function sanitizeName(n){ return n.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80); }
function randId(){ return Math.random().toString(36).slice(2, 10); }

/* attachment picker widget.
   pending: array shared with caller; existing: array of {path,name,type,size} */
function attachWidget(existing, pending, onRemoveExisting){
  var box = el('div');
  var list = el('div', { 'class': 'filelist' });
  function renderList(){
    list.innerHTML = '';
    existing.forEach(function(a, i){
      list.appendChild(el('div', { 'class': 'filerow' }, [
        el('span', { style: 'display:flex;color:var(--dim)' }, svgIcon(IC.file)),
        el('span', { 'class': 'fname', onclick: function(){
          storageSignedUrl(a.path).then(function(url){ window.open(url, '_blank'); })["catch"](function(){ toast('Could not open the file.', true); });
        } }, a.name),
        el('span', { 'class': 't-cap t-num' }, Math.round((a.size || 0) / 1024) + ' KB'),
        el('button', { 'class': 'btn btn-sm btn-danger', onclick: function(){ onRemoveExisting(i); renderList(); } }, 'Remove')
      ]));
    });
    pending.forEach(function(f, i){
      list.appendChild(el('div', { 'class': 'filerow' }, [
        el('span', { style: 'display:flex;color:var(--acc)' }, svgIcon(IC.file)),
        el('span', { 'class': 'fname', style: 'cursor:default' }, f.name),
        el('span', { 'class': 't-cap t-num' }, Math.round(f.size / 1024) + ' KB'),
        el('button', { 'class': 'btn btn-sm btn-danger', onclick: function(){ pending.splice(i, 1); renderList(); } }, 'Remove')
      ]));
    });
  }
  var input = el('input', { type: 'file', multiple: 'multiple', style: 'display:none',
    accept: 'image/*,.pdf,.doc,.docx,.txt',
    onchange: function(e){
      Array.prototype.forEach.call(e.target.files, function(f){
        if (f.size > MAX_FILE) { toast(f.name + ' is over 15 MB.', true); return; }
        if (!fileKindOk(f)) { toast(f.name + ': only images, PDF, Word or text files.', true); return; }
        pending.push(f);
      });
      input.value = '';
      renderList();
    } });
  box.appendChild(el('button', { 'class': 'btn btn-sec btn-sm', type: 'button', onclick: function(){ input.click(); } }, [svgIcon(IC.plus), 'Attach document']));
  box.appendChild(input);
  box.appendChild(list);
  renderList();
  return box;
}
function uploadPending(prefix, pending){
  var metas = [];
  var chain = Promise.resolve();
  pending.forEach(function(f){
    chain = chain.then(function(){
      var path = prefix + '/' + randId() + '_' + sanitizeName(f.name);
      return storageUpload(path, f).then(function(){
        metas.push({ path: path, name: f.name, type: f.type, size: f.size });
      });
    });
  });
  return chain.then(function(){ return metas; });
}

/* ================= THE SHIFT NOTE ================= */
/* an existing note opens as a clean formatted page first (bold headings, no
   asterisks); Edit switches to the plain one-box editor */
function openNoteRead(opts){
  var note = opts.note;
  var shift = opts.shift || (note.shift_id ? shiftById(note.shift_id) : null);
  var client = clientById(note.participant_id);
  var author = workerById(note.worker_id);
  var atts = note.attachments || [];
  var body = el('div', { 'class': 'modal-body' });
  body.appendChild(renderNoteBody(note.body));
  if (atts.length) {
    body.appendChild(el('div', { 'class': 't-label', style: 'margin:18px 0 6px' }, 'Attachments'));
    var list = el('div', { 'class': 'filelist' });
    atts.forEach(function(a){
      list.appendChild(el('div', { 'class': 'filerow' }, [
        el('span', { style: 'display:flex;color:var(--dim)' }, svgIcon(IC.file)),
        el('span', { 'class': 'fname', onclick: function(){
          storageSignedUrl(a.path).then(function(url){ window.open(url, '_blank'); })["catch"](function(){ toast('Could not open the file.', true); });
        } }, a.name),
        el('span', { 'class': 't-cap t-num' }, Math.round((a.size || 0) / 1024) + ' KB')
      ]));
    });
    body.appendChild(list);
  }
  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, note.note_type),
        el('div', { 'class': 't-cap' }, [
          client ? client.name : '', author ? ' · ' + author.name : '',
          shift ? ' · ' + fmtDate(shift.date) : ' · ' + fmtDT(note.created_at)
        ].join(''))
      ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    body,
    el('div', { 'class': 'modal-foot' }, [
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Close'),
      el('button', { 'class': 'btn btn-pri', onclick: function(){
        var o = { note: opts.note, shift: shift, worker: opts.worker, edit: true };
        openNoteModal(o);
      } }, [svgIcon(IC.edit), 'Edit'])
    ])
  ]);
  openModal(m);
}

/* opts: {shift, worker, note?, edit?} — note without edit = read view first */
function openNoteModal(opts){
  if (opts.note && !opts.edit) { openNoteRead(opts); return; }
  var shift = opts.shift || (opts.note && opts.note.shift_id ? shiftById(opts.note.shift_id) : null);
  var note = opts.note || null;
  var worker = opts.worker || me();
  var client = clientById(note ? note.participant_id : (shift ? shift.client_id : null));
  var editing = !!note;
  var pending = [];
  var existing = note ? (note.attachments || []).slice() : [];
  var removedPaths = [];
  var typed = false;

  var typeSel = el('select', { 'class': 'sel' });
  NOTE_TYPES.forEach(function(nt){
    typeSel.appendChild(el('option', { value: nt, selected: (note ? note.note_type : 'Progress Notes') === nt }, nt));
  });
  var ta = el('textarea', { 'class': 'ta', rows: '18', placeholder: 'Type to answer...' });
  ta.value = note ? note.body.replace(/\*\*/g, '') : (typeSel.value === 'Progress Notes' ? NOTE_TEMPLATE : '');
  ta.addEventListener('input', function(){ typed = true; });
  typeSel.addEventListener('change', function(){
    // only swap template if the worker hasn't typed anything yet
    var untouched = !typed && !editing;
    var isTemplate = ta.value === NOTE_TEMPLATE || ta.value.trim() === '';
    if (untouched || isTemplate) {
      ta.value = typeSel.value === 'Progress Notes' ? NOTE_TEMPLATE : '';
    }
  });

  var errBox = el('div', { 'class': 'err-line', style: 'display:none' });

  var body = el('div', { 'class': 'modal-body' }, [
    el('div', { 'class': 'field' }, [ el('label', null, 'Note type'), typeSel ]),
    el('div', { 'class': 'field' }, [ el('label', null, 'Note body'), ta ]),
    el('div', { 'class': 'field' }, [
      el('label', null, 'Client'),
      el('div', { 'class': 'inp', style: 'display:flex;align-items:center;gap:8px;background:var(--paper);cursor:default' }, [
        client ? el('span', { 'class': 'dot', style: 'background:' + client.colour }) : null,
        el('b', null, client ? client.name : '—'),
        shift ? el('span', { 'class': 't-cap t-num', style: 'margin-left:auto' }, fmtDate(shift.date) + ' · ' + fmtRange(shift.start_t, shift.end_t)) : null
      ])
    ]),
    el('div', { 'class': 'field' }, [
      el('label', null, 'Attach document'),
      attachWidget(existing, pending, function(i){ removedPaths.push(existing[i].path); existing.splice(i, 1); })
    ]),
    errBox
  ]);

  var saveBtn = el('button', { 'class': 'btn btn-pri', onclick: save }, editing ? 'Save changes' : 'Add note');
  var foot = el('div', { 'class': 'modal-foot' }, [
    editing ? el('button', { 'class': 'btn btn-danger', onclick: function(){
      confirmDlg('Delete this note?', 'The note and its attachments will be removed. This cannot be undone.', 'Delete', function(){
        var paths = (note.attachments || []).map(function(a){ return a.path; });
        sbDel('ac_note_entries', 'id=eq.' + note.id).then(function(){
          if (paths.length) storageDelete(paths);
          closeModal(); toast('Note deleted'); refresh();
        })["catch"](function(e){ toast(e.message, true); });
      }, true);
    } }, 'Delete') : null,
    el('div', { 'class': 'spacer' }),
    el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
    saveBtn
  ]);

  function save(){
    var bodyText = ta.value;
    if (!bodyText.trim()) {
      errBox.style.display = 'block'; errBox.textContent = 'The note is empty — write something first.';
      ta.classList.add('bad'); return;
    }
    busyBtn(saveBtn, true);
    var prefix = 'notes/' + (note ? note.id : randId());
    uploadPending(prefix, pending).then(function(metas){
      var atts = existing.concat(metas);
      if (editing) {
        var patch = {
          note_type: typeSel.value, body: bodyText, attachments: atts, updated_at: new Date().toISOString()
        };
        if (PORTAL !== 'admin') patch.seen = false;   // an edited note pops back up as new in the admin inbox
        return sbUpd('ac_note_entries', 'id=eq.' + note.id, patch);
      }
      return sbIns('ac_note_entries', [{
        shift_id: shift ? shift.id : null,
        participant_id: client ? client.id : null,
        worker_id: worker ? worker.id : null,
        note_type: typeSel.value, body: bodyText, attachments: atts
      }]);
    }).then(function(){
      if (removedPaths.length) storageDelete(removedPaths);
      if (!editing) {
        notifyAdmins('New note — ' + (client ? client.name : ''),
          (worker ? worker.name : 'A worker') + ' added a ' + typeSel.value + (shift ? ' for ' + fmtDate(shift.date) : '') + '.');
      }
      closeModal();
      toast(editing ? 'Note updated' : 'Note added');
      refresh();
    })["catch"](function(e){ busyBtn(saveBtn, false); toast(e.message, true); });
  }

  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, editing ? 'Edit shift note' : 'Add shift note'),
        worker ? el('div', { 'class': 't-cap' }, 'by ' + worker.name) : null
      ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    body, foot
  ]);
  openModal(m, { noDismiss: true });
}

/* ================= THE INCIDENT REPORT ================= */
function enumVals(name, fallback){ return state.data.enums[name] || fallback; }

function openIncidentModal(opts){
  var shift = opts.shift || (opts.incident && opts.incident.shift_id ? shiftById(opts.incident.shift_id) : null);
  var ir = opts.incident || null;
  var worker = opts.worker || me();
  var client = clientById(ir ? ir.participant_id : (shift ? shift.client_id : null));
  var editing = !!ir;

  var INCIDENT_TYPES = enumVals('IR_INCIDENT_TYPE', ['Behaviour of Concern','Medication Error','Injury','Illness','Medical concern','Exposure to infectious or hazardous substance','Violence by participant (this includes physical and verbal violence)','Neglect or exploitation','Property damage','Sexual misconduct or sexual assault','Equipment failure','Absconding','Vehicle accident']);
  var INJURY_KINDS = enumVals('IR_INJURY_KIND', ['Head injury','Burn','Strain or sprain','Fracture','Soft tissue injury (bruising)','Laceration (cut to body or face)','Joint, muscle or ligament injury']);
  var RESTRICTIVE_TYPES = enumVals('IR_RESTRICTIVE_TYPE', ['Chemical restraint','Environmental restraint','Physical restraint','Mechanical restraint','Seclusion']);
  var EMERGENCY = enumVals('IR_EMERGENCY', ['No','Police','Ambulance','Fire Services']);
  var Q8_YES = 'Yes - provide details below (please note that if unauthorised restricted practice has occurred, a full investigation of the incident will take place including a report to the NDIS Commission)';
  var Q13_YES = 'Yes - please provide information and if possible include any photos.';
  var Q17_YES = 'Yes - please provide details below';

  var f = {
    staff_name: ir ? ir.staff_name : (worker ? worker.name : ''),
    other_staff: ir ? ir.other_staff : '',
    ticket_name: ir ? ir.ticket_name : (client ? client.name : ''),
    ticket_desc: ir ? ir.ticket_desc : '',
    incident_date: ir ? (ir.incident_date || '') : (shift ? shift.date : todayYmd()),
    incident_time: ir ? (ir.incident_time || '') : '',
    incident_types: ir ? (ir.incident_types || []).slice() : [],
    restrictive: ir ? ir.restrictive : 'No',
    restrictive_types: ir ? (ir.restrictive_types || []).slice() : [],
    triggers: ir ? ir.triggers : '',
    response: ir ? ir.response : '',
    outcome: ir ? ir.outcome : '',
    property_damage: ir ? ir.property_damage : 'No',
    property_info: ir ? ir.property_info : '',
    emergency: ir ? (ir.emergency || []).slice() : [],
    injuries: ir ? ir.injuries : 'No',
    injury_who: ir ? ir.injury_who : '',
    injury_kind: ir ? ir.injury_kind : '',
    is_fall: ir ? (ir.is_fall ? 'Yes' : 'No') : 'No',
    fall_location: ir ? (ir.fall_location || '') : '',
    second_person_needed: ir ? (ir.second_person_needed ? 'Yes' : 'No') : 'No',
    minutes_on_floor: ir && ir.minutes_on_floor != null ? String(ir.minutes_on_floor) : '',
    equipment_involved: ir ? (ir.equipment_involved ? 'Yes' : 'No') : 'No',
    equipment_desc: ir ? (ir.equipment_desc || '') : ''
  };
  var pendingPhotos = [];
  var existingPhotos = ir ? (ir.property_photos || []).slice() : [];
  var removedPaths = [];

  function qLabel(n, text){
    return el('label', { style: 'display:block;font-size:14px;font-weight:600;color:var(--ink);margin:0 0 6px' }, [
      el('span', { style: 'color:var(--dim);font-weight:700;margin-right:6px;font-size:12px' }, n + '.'), text
    ]);
  }
  function textQ(n, label, key, help){
    return el('div', { 'class': 'field' }, [
      help ? el('div', { 'class': 'q-help' }, help) : null,
      qLabel(n, label),
      el('input', { 'class': 'inp', value: f[key], oninput: function(e){ f[key] = e.target.value; } })
    ]);
  }
  function longQ(n, label, key, help){
    return el('div', { 'class': 'field' }, [
      help ? el('div', { 'class': 'q-help' }, help) : null,
      qLabel(n, label),
      el('textarea', { 'class': 'ta', rows: '3', placeholder: 'Type to answer...', oninput: function(e){ f[key] = e.target.value; } }, f[key])
    ]);
  }
  function choiceQ(n, label, key, options, onchg){
    var wrap = el('div', { 'class': 'field' }, qLabel(n, label));
    options.forEach(function(o){
      wrap.appendChild(el('label', { 'class': 'radiorow' }, [
        el('input', { type: 'radio', name: 'q' + n, checked: f[key] === o, onchange: function(){ f[key] = o; if (onchg) onchg(); } }),
        el('span', { style: 'font-size:14px' }, o)
      ]));
    });
    return wrap;
  }
  function multiQ(n, label, key, options){
    var wrap = el('div', { 'class': 'field' }, qLabel(n, label + ' (tick all that apply)'));
    options.forEach(function(o){
      wrap.appendChild(el('label', { 'class': 'checkrow' }, [
        el('input', { type: 'checkbox', checked: f[key].indexOf(o) >= 0, onchange: function(e){
          if (e.target.checked) f[key].push(o);
          else f[key].splice(f[key].indexOf(o), 1);
        } }),
        el('span', { style: 'font-size:14px' }, o)
      ]));
    });
    return wrap;
  }

  /* fall details — feed the admin Reports tab (falls, 2:1 need, equipment) */
  function fallBlock(){
    var det = el('div', { style: f.is_fall === 'No' ? 'display:none' : '' });
    var locSel = el('select', { 'class': 'sel', onchange: function(e){ f.fall_location = e.target.value; } },
      [el('option', { value: '' }, 'Choose…')].concat(NM_LOCATIONS.map(function(l){ return el('option', { value: l, selected: f.fall_location === l }, l); })));
    var eqDet = el('div', { style: f.equipment_involved === 'No' ? 'display:none' : '' },
      el('div', { 'class': 'field' }, [ el('label', null, 'Which equipment, and what happened to it'),
        el('input', { 'class': 'inp', value: f.equipment_desc, oninput: function(e){ f.equipment_desc = e.target.value; } }) ]));
    function yn(label, key, onchg){
      return el('div', { 'class': 'field' }, [ el('label', { style: 'display:block;font-size:14px;font-weight:600;margin:0 0 6px' }, label),
        el('div', { style: 'display:flex;gap:16px' }, ['No', 'Yes'].map(function(o){
          return el('label', { 'class': 'radiorow', style: 'margin:0' }, [
            el('input', { type: 'radio', name: 'fb_' + key, checked: f[key] === o, onchange: function(){ f[key] = o; if (onchg) onchg(); } }),
            el('span', { style: 'font-size:14px' }, o) ]);
        })) ]);
    }
    det.appendChild(el('div', { 'class': 'field' }, [ el('label', null, 'Where did the fall happen'), locSel ]));
    det.appendChild(yn('Was a second person needed to get the participant up?', 'second_person_needed'));
    det.appendChild(el('div', { 'class': 'field' }, [ el('label', null, 'Minutes on the floor before being helped up'),
      el('input', { 'class': 'inp', type: 'number', min: '0', inputmode: 'numeric', value: f.minutes_on_floor, oninput: function(e){ f.minutes_on_floor = e.target.value; } }) ]));
    det.appendChild(yn('Was equipment involved (wheelchair, shower chair, bed, hoist)?', 'equipment_involved', function(){ eqDet.style.display = f.equipment_involved === 'No' ? 'none' : ''; }));
    det.appendChild(eqDet);
    return el('div', { 'class': 'card', style: 'padding:12px 16px;margin-bottom:14px;background:var(--paper);box-shadow:none;border:0' }, [
      el('div', { 'class': 't-label', style: 'margin-bottom:8px' }, 'Fall details'),
      yn('Did this incident involve a fall?', 'is_fall', function(){ det.style.display = f.is_fall === 'No' ? 'none' : ''; }),
      det
    ]);
  }

  /* conditional sections */
  var secRestrictive = el('div', { style: f.restrictive === 'No' ? 'display:none' : '' },
    multiQ(9, 'Type of unauthorised restrictive practice', 'restrictive_types', RESTRICTIVE_TYPES));
  var secProperty = el('div', { style: f.property_damage === 'No' ? 'display:none' : '' }, [
    longQ(14, 'Please provide information', 'property_info'),
    el('div', { 'class': 'field' }, [
      qLabel(15, 'Include any photos of property damage'),
      attachWidget(existingPhotos, pendingPhotos, function(i){ removedPaths.push(existingPhotos[i].path); existingPhotos.splice(i, 1); })
    ])
  ]);
  var injuryKindSel = el('select', { 'class': 'sel', onchange: function(e){ f.injury_kind = e.target.value; } });
  injuryKindSel.appendChild(el('option', { value: '' }, 'Choose…'));
  INJURY_KINDS.forEach(function(k){ injuryKindSel.appendChild(el('option', { value: k, selected: f.injury_kind === k }, k)); });
  var secInjury = el('div', { style: f.injuries === 'No' ? 'display:none' : '' }, [
    longQ(18, 'Who was injured and how did this injury happen?', 'injury_who'),
    el('div', { 'class': 'field' }, [ qLabel(19, 'What kind of injury:'), injuryKindSel ])
  ]);

  var errBox = el('div', { 'class': 'err-line', style: 'display:none;margin-bottom:8px' });

  var body = el('div', { 'class': 'modal-body' }, [
    textQ(1, 'Name of the staff member filling in this form', 'staff_name'),
    textQ(2, 'Which other staff member was on shift during this incident', 'other_staff'),
    textQ(3, 'Ticket Name', 'ticket_name', "'Ticket name' means the name of the Participant. Please put the Participant's name here:"),
    longQ(4, 'Ticket Description', 'ticket_desc', 'Ticket Description means a description of the incident. Please keep this brief as possible and include approximate times that things happened. Please do not copy and paste shift notes — just provide a brief description and answer the questions below.'),
    el('div', { 'class': 'grid2' }, [
      el('div', { 'class': 'field' }, [ qLabel(5, 'Date this incident happened'),
        el('input', { 'class': 'inp', type: 'date', value: f.incident_date, onchange: function(e){ f.incident_date = e.target.value; } }) ]),
      el('div', { 'class': 'field' }, [ qLabel(6, 'Time that this incident started'),
        el('input', { 'class': 'inp', type: 'time', value: f.incident_time, onchange: function(e){ f.incident_time = e.target.value; } }) ])
    ]),
    multiQ(7, 'What type of incident is this', 'incident_types', INCIDENT_TYPES),
    fallBlock(),
    choiceQ(8, 'Was there any unauthorised use of restricted practice', 'restrictive', ['No', Q8_YES], function(){
      secRestrictive.style.display = f.restrictive === 'No' ? 'none' : '';
    }),
    secRestrictive,
    longQ(10, 'List any triggers that may have led to this incident:', 'triggers'),
    longQ(11, 'What response did you provide to the incident (what did you do):', 'response'),
    longQ(12, 'What was the outcome:', 'outcome'),
    choiceQ(13, 'In this incident, was there any property damage?', 'property_damage', ['No', Q13_YES], function(){
      secProperty.style.display = f.property_damage === 'No' ? 'none' : '';
    }),
    secProperty,
    multiQ(16, 'Were emergency services called at all during this incident?', 'emergency', EMERGENCY),
    choiceQ(17, 'Were there any injuries?', 'injuries', ['No', Q17_YES], function(){
      secInjury.style.display = f.injuries === 'No' ? 'none' : '';
    }),
    secInjury,
    errBox
  ]);

  var saveBtn = el('button', { 'class': 'btn btn-pri', onclick: save }, editing ? 'Save changes' : 'Submit report');
  function fail(msg){
    errBox.style.display = 'block'; errBox.textContent = msg;
    errBox.scrollIntoView({ block: 'center' });
    busyBtn(saveBtn, false);
  }
  function save(){
    if (!f.ticket_desc.trim()) return fail('Q4 — a ticket description is required.');
    if (!f.incident_types.length) return fail('Q7 — tick at least one incident type.');
    if (f.restrictive !== 'No' && !f.restrictive_types.length) return fail('Q9 — tick the type(s) of restrictive practice.');
    if (f.property_damage !== 'No' && !f.property_info.trim()) return fail('Q14 — describe the property damage.');
    if (f.injuries !== 'No' && !f.injury_who.trim()) return fail('Q18 — say who was injured and how.');
    if (f.injuries !== 'No' && !f.injury_kind) return fail('Q19 — choose the kind of injury.');
    errBox.style.display = 'none';
    busyBtn(saveBtn, true);
    var prefix = 'incidents/' + (ir ? ir.id : randId());
    uploadPending(prefix, pendingPhotos).then(function(metas){
      var rec = {
        staff_name: f.staff_name, other_staff: f.other_staff,
        ticket_name: f.ticket_name, ticket_desc: f.ticket_desc,
        incident_date: f.incident_date || null, incident_time: f.incident_time || null,
        incident_types: f.incident_types,
        restrictive: f.restrictive,
        restrictive_types: f.restrictive === 'No' ? [] : f.restrictive_types,
        triggers: f.triggers, response: f.response, outcome: f.outcome,
        property_damage: f.property_damage,
        property_info: f.property_damage === 'No' ? '' : f.property_info,
        property_photos: existingPhotos.concat(metas),
        emergency: f.emergency,
        injuries: f.injuries,
        injury_who: f.injuries === 'No' ? '' : f.injury_who,
        injury_kind: f.injuries === 'No' ? '' : f.injury_kind,
        is_fall: f.is_fall === 'Yes',
        fall_location: f.is_fall === 'Yes' ? f.fall_location : '',
        second_person_needed: f.is_fall === 'Yes' && f.second_person_needed === 'Yes',
        minutes_on_floor: f.is_fall === 'Yes' && f.minutes_on_floor !== '' ? parseInt(f.minutes_on_floor, 10) : null,
        equipment_involved: f.is_fall === 'Yes' && f.equipment_involved === 'Yes',
        equipment_desc: f.is_fall === 'Yes' && f.equipment_involved === 'Yes' ? f.equipment_desc : '',
        updated_at: new Date().toISOString()
      };
      if (editing) {
        if (PORTAL !== 'admin') rec.seen = false;   // an edited report pops back up as new in the admin inbox
        return sbUpd('ac_incident_forms', 'id=eq.' + ir.id, rec);
      }
      rec.shift_id = shift ? shift.id : null;
      rec.participant_id = client ? client.id : null;
      rec.worker_id = worker ? worker.id : null;
      delete rec.updated_at;
      return sbIns('ac_incident_forms', [rec]);
    }).then(function(){
      if (removedPaths.length) storageDelete(removedPaths);
      if (!editing) {
        notifyAdmins('Incident report — ' + (client ? client.name : ''),
          (worker ? worker.name : 'A worker') + ': ' + f.ticket_desc.slice(0, 150));
      }
      closeModal();
      toast(editing ? 'Incident report updated' : 'Incident report submitted');
      refresh();
    })["catch"](function(e){ fail(e.message); });
  }

  var m = el('div', { 'class': 'modal modal-wide' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, [
      el('div', null, [
        el('div', { 'class': 't-title' }, editing ? 'Edit incident report' : 'Incident report'),
        client ? el('div', { 'class': 't-cap' }, client.name + (shift ? ' · ' + fmtDate(shift.date) : '')) : null
      ]),
      el('button', { 'class': 'iconbtn', onclick: closeModal }, svgIcon(IC.x))
    ]),
    body,
    el('div', { 'class': 'modal-foot' }, [
      editing ? el('button', { 'class': 'btn btn-danger', onclick: function(){
        confirmDlg('Delete this incident report?', 'The report and its photos will be removed. This cannot be undone.', 'Delete', function(){
          var paths = (ir.property_photos || []).map(function(a){ return a.path; });
          sbDel('ac_incident_forms', 'id=eq.' + ir.id).then(function(){
            if (paths.length) storageDelete(paths);
            closeModal(); toast('Incident report deleted'); refresh();
          })["catch"](function(e){ toast(e.message, true); });
        }, true);
      } }, 'Delete') : null,
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeModal }, 'Cancel'),
      saveBtn
    ])
  ]);
  openModal(m, { noDismiss: true });
}
