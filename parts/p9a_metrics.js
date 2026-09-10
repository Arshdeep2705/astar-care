/* ================= Summary metrics — pure functions, no DOM, no network =================
   Everything the Summary tab and its export show is computed here from plain records, so the
   same code runs in the browser and in node (tests/metrics.test.js). Version: metrics-v3.

   Model
   - One real EVENT can have several SOURCE RECORDS (an incident report, a sentence in a shift
     note, a page of an uploaded PDF). It is counted once: the structured record is the counted
     instance; a reviewed observation that repeats it is LINKED (duplicate_of / duplicate_of_record)
     and kept only as a reference. Unlinked look-alikes are flagged for a person, never merged.
   - Only observations with status 'accepted' and no duplicate link enter any figure.
   - Missing is not zero. A blank field, a shift without a form, a night without a summary are
     "not recorded" and leave both numerator and denominator.
   - Overnight events are keyed by the NIGHT THE SHIFT STARTED: an event at 03:30 on the 2nd is
     the night of the 1st. Durations are elapsed time inside the recorded interval(s); overlapping
     intervals are merged before summing, never added. */
var EV_CALC_VERSION = 'metrics-v3';
var EV_SLEEP_BLOCK = { from: '23:00', to: '07:00' };
var EV_BLANK_ZERO_CUTOFF = '2026-09-07';   // structured logs saved before this stored blank answers as 0
var EV_TRANSFER_LOCS = ['Bed', 'Shower', 'Toilet', 'Couch to wheelchair', 'Wheelchair to bed', 'Vehicle'];  // legacy fallback only

var EV_DEFINITIONS = [
  ['Period and timezone', 'Dates and times are the participant’s service-local time (Australia/Melbourne) as entered by the worker. A night is labelled by the date its sleepover shift started and runs to 07:00 the next morning. Events after midnight belong to the night that started the evening before.'],
  ['Scope', 'A shift is in scope when its rostered end time has passed. Shifts still running or not yet started are shown separately and never counted as “not recorded”.'],
  ['Recorded, partial, not recorded', 'Recorded = a structured record exists with the measure filled in. Partial = a record exists but the measure is blank, or only reviewed observations exist for that night. Not recorded = no record. Partial and not-recorded items are excluded from averages and never shown as 0.'],
  ['Counted once', 'A fall or near miss that appears in an incident report and again in a note or document is one event: the structured record is counted; the review links the repeat to it. Reviewed observations with no structured record are counted as their own event. Look-alikes on the same date within 30 minutes are listed for review, not merged.'],
  ['Overnight assistance duration', 'From the overnight summary: the X-coded 15-minute blocks of the paper sleep log inside 23:00–07:00 (elapsed time the worker was assisting). Where a night has no summary but has reviewed observations with start and end times, the merged elapsed time of those intervals is shown and the night is marked partial. Overlapping intervals are merged. Awake-without-assistance is shown only when the whole 23:00–07:00 window is accounted for (asleep + assistance recorded), and the window length is taken from the actual clock times, so a daylight-saving night is 7 or 9 hours, not 8.'],
  ['Wakes', 'The overnight summary’s wake count is the number of times the participant woke needing support BEFORE the wake they got up for the day. The final wake is not included. A wake is not the same as an assistance episode; one wake can involve several activities.'],
  ['Assisted transfers', 'From the personal care log’s structured count. On a day with no care log, individually reviewed transfer observations are counted instead; the same day is never counted from both. Mentions of a wheelchair in prose are not transfers.'],
  ['Care measures', 'Total and per-day are computed only over the logs that answered that measure; per-day divides by the number of days with that measure recorded. Logs saved before 7 September 2026 stored blank answers as 0 and are listed under checks.'],
  ['Showers', '“Offered” is what the worker recorded. “Done” and “declined” are recorded answers; a shower recorded as offered with no completion answer is shown as “outcome not recorded”, not as declined.'],
  ['Incidents', 'Falls are incidents the worker recorded as a fall. “Involving an emergency call” counts incidents where any emergency service was recorded as called; the form does not record how many calls or whether the service attended. Injuries: the worker’s answer; no answer = unknown. Minutes on the floor are only summed where recorded and are the time before being helped up, not a waiting time.'],
  ['Locations and activities', 'Location is where the record says it happened. Whether a transfer was in progress is the worker’s answer to that question; for records made before the question existed (before 9 September 2026) a transfer is inferred only when the recorded location itself names a transfer, and those rows are marked as inferred.'],
  ['Excluded material', 'Sources marked excluded (training samples, generated examples) and observations that are proposed or rejected never enter any figure. Demonstration mode uses an entirely synthetic participant.']
];

/* ---------- small helpers ---------- */
function evAddDays(d, n){ var p = d.split('-'); var dt = new Date(+p[0], +p[1] - 1, +p[2] + n); return dt.getFullYear() + '-' + (dt.getMonth() < 9 ? '0' : '') + (dt.getMonth() + 1) + '-' + (dt.getDate() < 10 ? '0' : '') + dt.getDate(); }
function evMondayOf(d){ var p = d.split('-'); var dt = new Date(+p[0], +p[1] - 1, +p[2]); var off = (dt.getDay() + 6) % 7; return evAddDays(d, -off); }
function evTMin(t){ if (!t) return null; var p = String(t).split(':'); return (+p[0]) * 60 + (+p[1]); }
function evNum(v){ if (v === null || v === undefined || v === '') return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
function evSum(a){ return a.reduce(function(x, y){ return x + y; }, 0); }
function evAvg(a){ return a.length ? evSum(a) / a.length : null; }
function evRound(n, d){ if (n == null) return null; var f = Math.pow(10, d == null ? 2 : d); return Math.round(n * f) / f; }
function evDaysBetween(a, b){ var pa = a.split('-'), pb = b.split('-'); return Math.round((new Date(+pb[0], +pb[1] - 1, +pb[2]) - new Date(+pa[0], +pa[1] - 1, +pa[2])) / 86400000); }
function evIsPreNullRow(r){ return !!(r && r.created_at && String(r.created_at).slice(0, 10) < EV_BLANK_ZERO_CUTOFF); }
/* absolute start/end of a shift as Date objects in the running timezone */
function evShiftStart(s){ var p = s.date.split('-'), t = s.start_t.split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1], 0, 0); }
function evShiftEnd(s){ var cross = evTMin(s.end_t) <= evTMin(s.start_t); var d = cross ? evAddDays(s.date, 1) : s.date; var p = d.split('-'), t = s.end_t.split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1], 0, 0); }
/* length in hours of the 23:00→07:00 window for the night starting on `date`, by real clock time
   (7 h on the spring-forward night, 9 h on the fall-back night in the running timezone) */
function evBlockHours(date){ var p = date.split('-'); var a = new Date(+p[0], +p[1] - 1, +p[2], 23, 0, 0, 0); var b = new Date(+p[0], +p[1] - 1, +p[2] + 1, 7, 0, 0, 0); return evRound((b - a) / 3600000, 2); }
/* minutes on the night axis: 18:00 of the start date = 0, so 03:30 the next morning = 570 */
function evNightAxis(t){ var m = evTMin(t); if (m == null) return null; return m < 720 ? m + 1440 - 1080 : m - 1080; }
/* the night an overnight-category observation belongs to: after-midnight times → the day before */
function evNightOf(o){ if (!o || !o.obs_date) return null; var m = evTMin(o.start_time); if (/^overnight_/.test(o.category || '') && m != null && m < 720) return evAddDays(o.obs_date, -1); return o.obs_date; }
function evIsLinked(o){ return !!(o.duplicate_of || o.duplicate_of_record || (o.review_note && /^Duplicate of structured record/.test(o.review_note))); }
/* merge [start,end] minute intervals and return the total elapsed minutes */
function evMergeIntervals(ivs){
  var xs = ivs.filter(function(v){ return v[0] != null && v[1] != null && v[1] > v[0]; }).sort(function(a, b){ return a[0] - b[0]; });
  var out = [], cur = null;
  xs.forEach(function(v){ if (!cur || v[0] > cur[1]) { if (cur) out.push(cur); cur = [v[0], v[1]]; } else if (v[1] > cur[1]) cur[1] = v[1]; });
  if (cur) out.push(cur);
  return out;
}
function evMergeMinutes(ivs){ return evSum(evMergeIntervals(ivs).map(function(v){ return v[1] - v[0]; })); }
/* the date of the SECOND segment when a shift is split at `split`: after-midnight splits of an
   overnight shift land on the next calendar day (Mon 18:00–09:00 split 03:00 → Tue 03:00–09:00) */
function evSplitSegmentDate(date, start_t, end_t, split_t){
  var st = evTMin(start_t), en = evTMin(end_t), sp = evTMin(split_t), cross = en <= st;
  var inside = cross ? (sp > st || sp < en) : (sp > st && sp < en);
  if (!inside) return null;
  return (cross && sp < st) ? evAddDays(date, 1) : date;
}

/* ---------- the dataset ---------- */
function evBuildDataset(inp){
  var cid = inp.client.id, from = inp.from, to = inp.to;
  var now = inp.now ? new Date(inp.now) : new Date();
  function inRange(d){ return d && d >= from && d <= to; }
  var excludedSrc = {}; (inp.sources || []).forEach(function(s){ if (s.excluded) excludedSrc[s.id] = true; });
  var srcById = {}; (inp.sources || []).forEach(function(s){ srcById[s.id] = s; });
  var allObs = (inp.observations || []).filter(function(o){ return o.participant_id === cid; });
  /* an observation is in the period by the NIGHT/DAY it belongs to, so a 03:30 event on to+1 counts for the night of `to` */
  var obs = allObs.filter(function(o){ return o.status === 'accepted' && !evIsLinked(o) && !excludedSrc[o.source_id] && inRange(evNightOf(o)); });
  var proposed = allObs.filter(function(o){ return o.status === 'proposed' && inRange(evNightOf(o)); });
  var shifts = (inp.shifts || []).filter(function(s){ return s.client_id === cid && inRange(s.date); }).sort(function(a, b){ return a.date === b.date ? evTMin(a.start_t) - evTMin(b.start_t) : (a.date < b.date ? -1 : 1); });
  var byId = {}; shifts.forEach(function(s){ byId[s.id] = s; });
  function scope(s){ var st = evShiftStart(s), en = evShiftEnd(s); return en <= now ? 'completed' : (st <= now ? 'inProgress' : 'future'); }
  shifts.forEach(function(s){ s._scope = scope(s); });
  var incs = (inp.incidents || []).filter(function(i){ return i.participant_id === cid && inRange(i.incident_date); });
  var nms = (inp.nearMisses || []).filter(function(n){ return n.participant_id === cid && inRange(n.nm_date); });
  var care = (inp.careLogs || []).filter(function(l){ return byId[l.shift_id]; });
  var onl = (inp.overnightLogs || []).filter(function(l){ return byId[l.shift_id]; });
  var notes = (inp.notes || []).filter(function(n){ return byId[n.shift_id] && n.note_type !== 'Mileage'; });

  /* ---- coverage ---- */
  var completed = shifts.filter(function(s){ return s._scope === 'completed'; });
  var nightsAll = shifts.filter(function(s){ return s.type === 'sleepover'; });
  var nightsInScope = nightsAll.filter(function(s){ return s._scope === 'completed'; });
  var noteIds = {}; notes.forEach(function(n){ noteIds[n.shift_id] = 1; });
  var careIds = {}; care.forEach(function(l){ careIds[l.shift_id] = 1; });
  var onByShift = {}; onl.forEach(function(l){ onByShift[l.shift_id] = l; });
  var days = {}; shifts.forEach(function(s){ days[s.date] = 1; });
  var coverage = {
    periodDays: evDaysBetween(from, to) + 1, daysWithShifts: Object.keys(days).length,
    shifts: { rostered: shifts.length, completed: completed.length, inProgress: shifts.filter(function(s){ return s._scope === 'inProgress'; }).length, future: shifts.filter(function(s){ return s._scope === 'future'; }).length,
      withNote: completed.filter(function(s){ return noteIds[s.id]; }).length, withCareLog: completed.filter(function(s){ return careIds[s.id]; }).length },
    nights: { rostered: nightsAll.length, inScope: nightsInScope.length, inProgress: nightsAll.filter(function(s){ return s._scope === 'inProgress'; }).length, future: nightsAll.filter(function(s){ return s._scope === 'future'; }).length },
    records: { incidents: incs.length, nearMisses: nms.length, careLogs: care.length, overnightLogs: onl.length, notes: notes.length,
      sources: (inp.sources || []).filter(function(s){ return s.participant_id === cid && !s.excluded; }).length,
      observationsAccepted: obs.length, observationsProposed: proposed.length,
      observationsLinked: allObs.filter(function(o){ return evIsLinked(o) && inRange(evNightOf(o)); }).length }
  };

  /* ---- incidents: structured reports + accepted observations of category incident (counted once) ---- */
  function srcRef(o){ var s = srcById[o.source_id]; return { kind: 'observation', id: o.id, title: s ? (s.title || s.file_name || s.kind) : 'reviewed observation', ref: o.source_ref || '' }; }
  function injuryState(v){ if (v === null || v === undefined || v === '') return 'unknown'; return v === 'No' ? 'no' : 'yes'; }
  function transferState(rec, loc){ if (rec.during_transfer === true) return 'yes'; if (rec.during_transfer === false) return 'no'; return EV_TRANSFER_LOCS.indexOf(loc) >= 0 ? 'inferred' : 'unknown'; }
  function locName(rec, base){ if (base === 'Other') return rec.fall_location_other || rec.location_other || 'Other'; return base || ''; }
  var incidentList = incs.map(function(i){
    var emerg = (i.emergency || []).filter(function(x){ return x && x !== 'No'; });
    return { id: i.id, kind: 'report', date: i.incident_date, time: i.incident_time || '', types: (i.incident_types || []).slice(), isFall: !!i.is_fall,
      location: locName(i, i.fall_location), transfer: i.is_fall ? transferState(i, i.fall_location) : 'n/a', description: i.ticket_desc || '', response: i.response || '', outcome: i.outcome || '',
      emergency: emerg, injuries: injuryState(i.injuries), injuryKind: i.injury_kind || '', minutesOnFloor: i.minutes_on_floor == null ? null : +i.minutes_on_floor,
      equipment: !!(i.equipment_involved || (i.incident_types || []).indexOf('Equipment failure') >= 0), shiftId: i.shift_id, sources: [{ kind: 'report', id: i.id, title: 'Incident report' }] };
  }).concat(obs.filter(function(o){ return o.category === 'incident'; }).map(function(o){
    var t = (o.assist_type || 'Incident').trim();
    return { id: o.id, kind: 'observation', date: o.obs_date, time: o.start_time || '', types: [t], isFall: /\bfall\b|\bfell\b/i.test(t) || /\bfall\b|\bfell\b/i.test(o.reason || ''),
      location: '', transfer: 'unknown', description: o.reason || '', response: '', outcome: o.outcome || '', emergency: [], injuries: /no injur/i.test(o.outcome || '') ? 'no' : 'unknown', injuryKind: '', minutesOnFloor: null, equipment: false, shiftId: null, sources: [srcRef(o)] };
  })).sort(function(a, b){ return a.date === b.date ? (a.time < b.time ? -1 : 1) : (a.date < b.date ? -1 : 1); });
  /* linked observations are attached to the record they repeat, as extra sources */
  allObs.filter(function(o){ return evIsLinked(o) && o.status !== 'rejected'; }).forEach(function(o){
    var target = o.duplicate_of_record || (o.review_note && (o.review_note.match(/^Duplicate of structured record (\S+)/) || [])[1]);
    var host = incidentList.filter(function(e){ return e.id === target || e.id === o.duplicate_of; })[0];
    if (host) host.sources.push(srcRef(o));
  });
  var falls = incidentList.filter(function(e){ return e.isFall; });
  var floor = falls.filter(function(e){ return e.minutesOnFloor != null; });
  function countBy(list, fn){ var m = {}; list.forEach(function(e){ (fn(e) || []).forEach(function(k){ if (k) m[k] = (m[k] || 0) + 1; }); }); return Object.keys(m).map(function(k){ return { key: k, n: m[k] }; }).sort(function(a, b){ return b.n - a.n || (a.key < b.key ? -1 : 1); }); }
  var incidents = {
    list: incidentList, n: incidentList.length, falls: falls.length,
    emergencyInvolved: incidentList.filter(function(e){ return e.emergency.length; }).length,
    injuriesYes: incidentList.filter(function(e){ return e.injuries === 'yes'; }).length,
    injuriesNo: incidentList.filter(function(e){ return e.injuries === 'no'; }).length,
    injuriesUnknown: incidentList.filter(function(e){ return e.injuries === 'unknown'; }).length,
    floor: { minutes: evSum(floor.map(function(e){ return e.minutesOnFloor; })), n: floor.length, ofFalls: falls.length },
    equipment: incidentList.filter(function(e){ return e.equipment; }).length,
    transfers: { yes: falls.filter(function(e){ return e.transfer === 'yes'; }).length, inferred: falls.filter(function(e){ return e.transfer === 'inferred'; }).length, no: falls.filter(function(e){ return e.transfer === 'no'; }).length, unknown: falls.filter(function(e){ return e.transfer === 'unknown'; }).length },
    byType: countBy(incidentList, function(e){ return e.types.length ? e.types : ['Not recorded']; }),
    byLocation: countBy(falls, function(e){ return [e.location || 'Not recorded']; }),
    byEmergency: countBy(incidentList, function(e){ return e.emergency; }),
    byInjury: [{ key: 'Injury recorded', n: 0 }, { key: 'No injury recorded', n: 0 }, { key: 'Not answered', n: 0 }].map(function(r){ r.n = incidentList.filter(function(e){ return (r.key === 'Injury recorded' && e.injuries === 'yes') || (r.key === 'No injury recorded' && e.injuries === 'no') || (r.key === 'Not answered' && e.injuries === 'unknown'); }).length; return r; })
  };

  /* ---- near misses: structured + accepted observations of category near_miss ---- */
  var nmList = nms.map(function(n){
    return { id: n.id, kind: 'report', date: n.nm_date, time: n.nm_time || '', location: locName(n, n.location), transfer: transferState(n, n.location), description: n.description || '', prevented: n.prevented_by || '', outcome: 'No injury (by definition)', equipment: !!n.equipment_factor, equipmentDesc: n.equipment_desc || '', shiftId: n.shift_id, sources: [{ kind: 'report', id: n.id, title: 'Near miss record' }] };
  }).concat(obs.filter(function(o){ return o.category === 'near_miss'; }).map(function(o){
    return { id: o.id, kind: 'observation', date: o.obs_date, time: o.start_time || '', location: '', transfer: 'unknown', description: o.reason || o.assist_type || '', prevented: o.outcome || '', outcome: '', equipment: false, equipmentDesc: '', shiftId: null, sources: [srcRef(o)] };
  })).sort(function(a, b){ return a.date === b.date ? (a.time < b.time ? -1 : 1) : (a.date < b.date ? -1 : 1); });
  var nmDays = {}; nmList.forEach(function(e){ nmDays[e.date] = 1; });
  var nearMisses = {
    list: nmList, n: nmList.length, days: Object.keys(nmDays).length,
    shiftsDocumented: completed.filter(function(s){ return noteIds[s.id] || careIds[s.id] || onByShift[s.id]; }).length,
    equipment: nmList.filter(function(e){ return e.equipment; }).length,
    transfers: { yes: nmList.filter(function(e){ return e.transfer === 'yes'; }).length, inferred: nmList.filter(function(e){ return e.transfer === 'inferred'; }).length, no: nmList.filter(function(e){ return e.transfer === 'no'; }).length, unknown: nmList.filter(function(e){ return e.transfer === 'unknown'; }).length },
    byLocation: countBy(nmList, function(e){ return [e.location || 'Not recorded']; }),
    byActivity: countBy(nmList, function(e){ return [e.transfer === 'yes' ? 'During a transfer (recorded)' : e.transfer === 'inferred' ? 'Transfer inferred from location' : e.transfer === 'no' ? 'Not during a transfer' : 'Activity not recorded']; }),
    byPrevention: countBy(nmList, function(e){ var p = (e.prevented || '').toLowerCase(); if (!p) return ['Not recorded']; if (/brace|held|caught|steadied|support/.test(p)) return ['Worker steadied / held']; if (/lower|sat|seated|guided down/.test(p)) return ['Lowered safely']; if (/rail|frame|chair|equipment|belt/.test(p)) return ['Equipment / rail used']; if (/second|two|another/.test(p)) return ['Another person helped']; return ['Other (see record)']; })
  };

  /* ---- overnight: one row per rostered night; assistance from the summary, else from reviewed intervals ---- */
  var onObs = obs.filter(function(o){ return /^overnight_/.test(o.category); });
  var nightRows = nightsAll.map(function(s){
    var l = onByShift[s.id];
    var asleep = l ? evNum(l.asleep_hours) : null, active = l ? evNum(l.active_hours) : null;
    var mine = onObs.filter(function(o){ return evNightOf(o) === s.date; });
    var assist = mine.filter(function(o){ return o.category === 'overnight_assist'; });
    var withDur = assist.filter(function(o){ return o.start_time && o.end_time; });
    var observedMin = evMergeMinutes(withDur.map(function(o){ return [evNightAxis(o.start_time), evNightAxis(o.end_time)]; }));
    /* an episode = one merged interval; an observation with no end time occupies its start block (15 min) */
    var episodes = evMergeIntervals(assist.map(function(o){ var a = evNightAxis(o.start_time); if (a == null) return [null, null]; var b = o.end_time ? evNightAxis(o.end_time) : a + 15; return [a, Math.max(b, a + 1)]; })).length;
    var status = s._scope !== 'completed' ? s._scope : (l && asleep != null && active != null ? 'complete' : (l || assist.length ? 'partial' : 'missing'));
    var block = evBlockHours(s.date);
    var assistHours = active != null ? active : (withDur.length ? evRound(observedMin / 60) : null);
    return { shiftId: s.id, date: s.date, endDate: evAddDays(s.date, 1), status: status, blockHours: block,
      asleep: asleep, assistHours: assistHours, assistBasis: active != null ? 'summary' : (withDur.length ? 'observations' : null),
      observed: { episodes: episodes, withDuration: withDur.length, hours: withDur.length ? evRound(observedMin / 60) : null },
      /* House rule (owner, 2026-09-10): whenever the participant is awake overnight a worker is awake
         with him and supporting him, so awake time IS support time. Anything left over is not a care
         category, it is an unaccounted gap in the two figures and should be zero. */
      awakeNoAssist: (asleep != null && active != null) ? evRound(Math.max(0, block - asleep - active)) : null,
      wakes: l ? evNum(l.wakes) : null, bed: l ? (l.bed_time || null) : null, up: l ? (l.wake_time || null) : null,
      preNullZero: !!(l && evIsPreNullRow(l) && l.wakes === 0), worker_id: s.worker_id, summaryId: l ? l.id : null, obsIds: mine.map(function(o){ return o.id; }) };
  });
  var inScopeRows = nightRows.filter(function(r){ return r.status === 'complete' || r.status === 'partial' || r.status === 'missing'; });
  var complete = inScopeRows.filter(function(r){ return r.status === 'complete'; });
  var withAssist = inScopeRows.filter(function(r){ return r.assistHours != null; });
  var byActivity = {};
  onObs.filter(function(o){ return o.category === 'overnight_assist'; }).forEach(function(o){
    var k = (o.assist_type || 'Not specified').trim() || 'Not specified'; byActivity[k] = byActivity[k] || { episodes: 0, minutes: 0, withDuration: 0 };
    byActivity[k].episodes++; if (o.start_time && o.end_time) { byActivity[k].withDuration++; byActivity[k].minutes += Math.max(0, evNightAxis(o.end_time) - evNightAxis(o.start_time)); }
  });
  var overnight = {
    rows: nightRows, inScope: inScopeRows.length, complete: complete.length, partial: inScopeRows.filter(function(r){ return r.status === 'partial'; }).length, missing: inScopeRows.filter(function(r){ return r.status === 'missing'; }).length,
    notYet: nightRows.length - inScopeRows.length,
    avgAssist: { hours: withAssist.length ? evRound(evAvg(withAssist.map(function(r){ return r.assistHours; }))) : null, n: withAssist.length, of: inScopeRows.length, fromSummary: withAssist.filter(function(r){ return r.assistBasis === 'summary'; }).length },
    avgAsleep: { hours: complete.length ? evRound(evAvg(complete.map(function(r){ return r.asleep; }))) : null, n: complete.length },
    episodes: { n: evSum(inScopeRows.map(function(r){ return r.observed.episodes; })), nights: inScopeRows.filter(function(r){ return r.observed.episodes; }).length },
    wakes: { n: evSum(inScopeRows.filter(function(r){ return r.wakes != null; }).map(function(r){ return r.wakes; })), nights: inScopeRows.filter(function(r){ return r.wakes != null; }).length },
    byActivity: Object.keys(byActivity).map(function(k){ return { activity: k, episodes: byActivity[k].episodes, hours: byActivity[k].withDuration ? evRound(byActivity[k].minutes / 60) : null, withDuration: byActivity[k].withDuration }; }).sort(function(a, b){ return b.episodes - a.episodes; }),
    timeline: onObs.map(function(o){ return { id: o.id, night: evNightOf(o), date: o.obs_date, start: o.start_time || null, end: o.end_time || null, category: o.category, activity: o.assist_type || '', reason: o.reason || '', timing: o.timing || 'estimated', sourceRef: o.source_ref || '', sourceTitle: srcRef(o).title }; })
      .sort(function(a, b){ return a.night === b.night ? ((evNightAxis(a.start) || 0) - (evNightAxis(b.start) || 0)) : (a.night < b.night ? -1 : 1); })
  };

  /* ---- personal care ---- */
  var careByDate = {}; care.forEach(function(l){ var d = byId[l.shift_id].date; (careByDate[d] = careByDate[d] || []).push(l); });
  function measure(key, label){
    var rec = care.filter(function(l){ return l[key] != null; });
    var recDays = {}; rec.forEach(function(l){ recDays[byId[l.shift_id].date] = 1; });
    var nd = Object.keys(recDays).length;
    return { key: key, label: label, total: rec.length ? evSum(rec.map(function(l){ return +l[key]; })) : null, recorded: rec.length, of: care.length, days: nd, perDay: nd ? evRound(evSum(rec.map(function(l){ return +l[key]; })) / nd) : null, preNullZero: rec.filter(function(l){ return evIsPreNullRow(l) && l[key] === 0; }).length };
  }
  var showers = care.filter(function(l){ return l.shower_offered === true; });
  var transferObs = obs.filter(function(o){ return o.category === 'daytime_task' && /transfer/i.test(o.assist_type || ''); });
  var tMeasure = measure('transfers', 'Assisted transfers');
  var transferDays = {}; care.filter(function(l){ return l.transfers != null; }).forEach(function(l){ transferDays[byId[l.shift_id].date] = 1; });
  var obsOnlyDays = {}; transferObs.forEach(function(o){ if (!transferDays[o.obs_date]) obsOnlyDays[o.obs_date] = (obsOnlyDays[o.obs_date] || 0) + 1; });
  var transfersFromObs = evSum(Object.keys(obsOnlyDays).map(function(d){ return obsOnlyDays[d]; }));
  var careData = {
    logs: care.length, days: Object.keys(careByDate).length,
    measures: [ measure('pad_wet', 'Pad changes (wet)'), measure('pad_bowel', 'Pad changes (bowel)'), measure('bed_wet', 'Found wet in bed'), measure('bedding_changes', 'Bedding changes'), measure('care_refusals', 'Care refusals needing prompting') ],
    transfers: { logged: tMeasure.total, loggedRecorded: tMeasure.recorded, loggedOf: tMeasure.of, loggedDays: tMeasure.days, perDay: tMeasure.perDay, fromObservations: transfersFromObs, observationDays: Object.keys(obsOnlyDays).length, observationEvents: transferObs.length,
      total: (tMeasure.total == null && !transfersFromObs) ? null : (tMeasure.total || 0) + transfersFromObs },
    showers: { offered: showers.length, done: showers.filter(function(l){ return l.shower_done === true; }).length, declined: showers.filter(function(l){ return l.shower_done === false && !evIsPreNullRow(l); }).length,
      outcomeNotRecorded: showers.filter(function(l){ return l.shower_done == null || (l.shower_done === false && evIsPreNullRow(l)); }).length,
      promptsAvg: (function(){ var a = showers.filter(function(l){ return l.shower_prompts != null; }).map(function(l){ return +l.shower_prompts; }); return a.length ? evRound(evAvg(a)) : null; })(), promptsN: showers.filter(function(l){ return l.shower_prompts != null; }).length },
    dailyTransfers: Object.keys(careByDate).sort().map(function(d){ var v = careByDate[d].filter(function(l){ return l.transfers != null; }); return { date: d, transfers: v.length ? evSum(v.map(function(l){ return +l.transfers; })) : null, logs: careByDate[d].length }; })
  };

  /* ---- time series: day buckets up to 35 days, else ISO weeks ---- */
  var bucketMode = coverage.periodDays <= 35 ? 'day' : 'week';
  var keys = [];
  if (bucketMode === 'day') { for (var d = from; d <= to; d = evAddDays(d, 1)) keys.push(d); } else { for (var w = evMondayOf(from); w <= to; w = evAddDays(w, 7)) keys.push(w); }
  function bkey(date){ return bucketMode === 'day' ? date : evMondayOf(date); }
  var series = { mode: bucketMode, buckets: keys.map(function(k){
    var tr = careData.dailyTransfers.filter(function(x){ return bkey(x.date) === k && x.transfers != null; });
    return { key: k, incidents: incidentList.filter(function(e){ return bkey(e.date) === k; }).length, falls: falls.filter(function(e){ return bkey(e.date) === k; }).length, nearMisses: nmList.filter(function(e){ return bkey(e.date) === k; }).length,
      transfers: tr.length ? evSum(tr.map(function(x){ return x.transfers; })) : null, transferDays: tr.length,
      shifts: completed.filter(function(s){ return bkey(s.date) === k; }).length, nights: inScopeRows.filter(function(r){ return bkey(r.date) === k; }).length, nightsLogged: inScopeRows.filter(function(r){ return bkey(r.date) === k && r.status !== 'missing'; }).length };
  }) };

  /* ---- overview metrics (value, unit, denominator / coverage note; null = not recorded) ---- */
  var metrics = {
    falls: { value: incidents.falls, unit: 'falls', of: incidents.n, note: incidents.n + ' incident report' + (incidents.n === 1 ? '' : 's') + ' in period' },
    nearMisses: { value: nearMisses.n, unit: 'near misses', note: nearMisses.days + ' day' + (nearMisses.days === 1 ? '' : 's') + ' with a record' },
    transfers: { value: careData.transfers.total, unit: 'assisted transfers', note: careData.transfers.loggedRecorded + ' of ' + careData.transfers.loggedOf + ' care logs answered' + (careData.transfers.fromObservations ? ' + ' + careData.transfers.fromObservations + ' reviewed on ' + careData.transfers.observationDays + ' unlogged day' + (careData.transfers.observationDays === 1 ? '' : 's') : '') },
    emergency: { value: incidents.emergencyInvolved, unit: 'incidents involving an emergency call', of: incidents.n, note: 'of ' + incidents.n + ' incident' + (incidents.n === 1 ? '' : 's') + '; attendance not recorded on the form' },
    overnightAvg: { value: overnight.avgAssist.hours, unit: 'h per night', note: overnight.avgAssist.n + ' of ' + overnight.avgAssist.of + ' nights in scope' + (overnight.avgAssist.n && overnight.avgAssist.fromSummary < overnight.avgAssist.n ? ' (' + (overnight.avgAssist.n - overnight.avgAssist.fromSummary) + ' from reviewed intervals)' : '') },
    nightsUsable: { value: overnight.inScope ? overnight.complete : null, unit: 'nights with complete data', of: overnight.inScope, note: overnight.partial + ' partial · ' + overnight.missing + ' not recorded' + (overnight.notYet ? ' · ' + overnight.notYet + ' not yet finished' : '') }
  };

  /* ---- checks for a reviewer ---- */
  var checks = [];
  care.forEach(function(l){ if (evIsPreNullRow(l)) checks.push({ kind: 'pre-null zero', date: byId[l.shift_id].date, detail: 'Care log saved before 7 Sep 2026: a 0 may be an unanswered box.', ref: l.id }); });
  nightRows.forEach(function(r){
    if (r.preNullZero) checks.push({ kind: 'pre-null zero', date: r.date, detail: 'Overnight summary saved before 7 Sep 2026 with 0 wakes: may be an unanswered box.', ref: r.summaryId });
    if (r.status === 'complete' && r.wakes != null && r.observed.episodes && r.observed.episodes !== r.wakes) checks.push({ kind: 'reconcile', date: r.date, detail: 'Night of ' + r.date + ': summary records ' + r.wakes + ' wake' + (r.wakes === 1 ? '' : 's') + ' before the final wake; ' + r.observed.episodes + ' reviewed assistance episode' + (r.observed.episodes === 1 ? '' : 's') + ' (a wake can involve several episodes). Nothing was changed.', ref: r.shiftId });
    if (r.status === 'partial' && r.assistBasis === 'observations') checks.push({ kind: 'partial night', date: r.date, detail: 'No overnight summary; ' + r.observed.withDuration + ' reviewed interval' + (r.observed.withDuration === 1 ? '' : 's') + ' give ' + r.assistHours + ' h recorded assistance. The rest of the night is unknown.', ref: r.shiftId });
  });
  var allEvents = incidentList.map(function(e){ return { id: e.id, date: e.date, time: e.time, label: (e.kind === 'report' ? 'Incident report' : 'Reviewed observation') + ' ' + (e.types[0] || '') }; }).concat(nmList.map(function(e){ return { id: e.id, date: e.date, time: e.time, label: (e.kind === 'report' ? 'Near miss record' : 'Reviewed observation') + ' near miss' }; }));
  for (var a = 0; a < allEvents.length; a++) for (var b = a + 1; b < allEvents.length; b++) {
    if (allEvents[a].date !== allEvents[b].date || !allEvents[a].time || !allEvents[b].time) continue;
    if (Math.abs(evTMin(allEvents[a].time) - evTMin(allEvents[b].time)) <= 30) checks.push({ kind: 'possible duplicate', date: allEvents[a].date, detail: allEvents[a].label + ' at ' + allEvents[a].time + ' and ' + allEvents[b].label + ' at ' + allEvents[b].time + ' may be one event. Both are counted until a reviewer links them.', ref: allEvents[a].id + ',' + allEvents[b].id });
  }
  proposed.forEach(function(o){ checks.push({ kind: 'unreviewed', date: o.obs_date, detail: 'Proposed observation awaiting review: excluded from every figure.', ref: o.id }); });
  (inp.sources || []).filter(function(s){ return s.participant_id === cid && s.kind === 'upload' && s.extraction === 'needs_ocr' && !s.excluded; }).forEach(function(s){ checks.push({ kind: 'needs manual entry', date: s.event_from || '', detail: (s.title || s.file_name || 'Upload') + ': no machine-readable text.', ref: s.id }); });
  incidentList.filter(function(e){ return e.injuries === 'unknown'; }).forEach(function(e){ checks.push({ kind: 'unknown', date: e.date, detail: 'Injury question not answered on this incident; shown as unknown, not as no injury.', ref: e.id }); });
  completed.filter(function(s){ return !noteIds[s.id] && !s.note_waived; }).forEach(function(s){ checks.push({ kind: 'not recorded', date: s.date, detail: (s.type === 'sleepover' ? 'Sleepover' : 'Day shift') + ' ' + s.start_t + '–' + s.end_t + ' has no shift note.', ref: s.id }); });

  /* ---- frozen source index and record ids (the export renders from these, never from live data) ---- */
  var sourceIndex = (inp.sources || []).filter(function(s){ return s.participant_id === cid && !s.excluded; }).map(function(s, i){ return { n: i + 1, id: s.id, title: s.title || s.file_name || s.kind, kind: s.kind, author: s.author || '', from: s.event_from || '', to: s.event_to || '', sha256: s.sha256 || '', updated_at: s.updated_at || s.created_at || '' }; });

  return { version: EV_CALC_VERSION, builtAt: now.toISOString(), client: { id: cid, name: inp.client.name }, from: from, to: to, tz: inp.tz || 'Australia/Melbourne', sleepBlock: EV_SLEEP_BLOCK,
    coverage: coverage, metrics: metrics, overnight: overnight, incidents: incidents, nearMisses: nearMisses, care: careData, series: series, checks: checks,
    sourceIndex: sourceIndex, recordIds: { incidents: incs.map(function(i){ return i.id; }), nearMisses: nms.map(function(n){ return n.id; }), careLogs: care.map(function(l){ return l.id; }), overnightLogs: onl.map(function(l){ return l.id; }), observations: obs.map(function(o){ return o.id; }) },
    definitions: EV_DEFINITIONS };
}

/* ---------- export model: the figures the document prints, taken from the dataset only ---------- */
function evExportModel(ds){
  var m = ds.metrics;
  return { participant: ds.client.name, from: ds.from, to: ds.to, tz: ds.tz, version: ds.version,
    metrics: [
      { label: 'Falls recorded', value: m.falls.value, unit: m.falls.unit, note: m.falls.note },
      { label: 'Near misses recorded', value: m.nearMisses.value, unit: m.nearMisses.unit, note: m.nearMisses.note },
      { label: 'Assisted transfers recorded', value: m.transfers.value, unit: m.transfers.unit, note: m.transfers.note },
      { label: 'Incidents involving an emergency call', value: m.emergency.value, unit: m.emergency.unit, note: m.emergency.note },
      { label: 'Average recorded overnight assistance', value: m.overnightAvg.value, unit: m.overnightAvg.unit, note: m.overnightAvg.note },
      { label: 'Nights with complete overnight data', value: m.nightsUsable.value, unit: m.nightsUsable.of + ' in scope', note: m.nightsUsable.note }
    ],
    coverage: ds.coverage, sourceIndex: ds.sourceIndex, recordIds: ds.recordIds };
}

/* ---------- candidate finder: deterministic, quotes kept, nothing invented ----------
   ctx: { baseDate, overnight: true when the text is a SLEEPOVER narrative (times before noon are the
   next morning), noon: 'next'|'same' } */
var EV_TIME_RE = /\b(?:at |about |around |approximately |approx\.? )?((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s?(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d)\b/gi;
var EV_NEG = /\b(no|not|didn['’]?t|did not|never|without|denied|nil)\b/i;
function evNormTime(t){
  var m = t.toLowerCase().replace(/\s+/g, '').match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/); if (!m) return null;
  var h = +m[1], mi = m[2] ? +m[2] : 0;
  if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0;
  if (!m[3] && !m[2]) return null;
  return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
}
function evNegated(s, re){ var m = s.match(re); if (!m) return false; var before = s.slice(Math.max(0, m.index - 28), m.index); return EV_NEG.test(before); }
function evFindCandidates(text, ctx){
  if (typeof ctx === 'string' || ctx == null) ctx = { baseDate: ctx || null, overnight: false };
  var baseDate = ctx.baseDate || null, overnightCtx = !!ctx.overnight, endMin = evTMin(ctx.endT || '09:00');
  var out = [];
  var sentences = (text || '').replace(/\r/g, '').split(/(?<=[.!?])\s+|\n{2,}/);
  sentences.forEach(function(sent, idx){
    var s = sent.replace(/\s+/g, ' ').trim(); if (s.length < 12) return;
    var times = [], m; EV_TIME_RE.lastIndex = 0;
    while ((m = EV_TIME_RE.exec(s))) { var t = evNormTime(m[1]); if (t) times.push(t); }
    if (!times.length) return;
    var t0 = times[0], mins = evTMin(t0);
    /* on a sleepover narrative, times before the shift's morning end belong to the next calendar day;
       a time after the shift ended stays on the start date and is marked uncertain */
    var date = baseDate, afterEnd = overnightCtx && mins >= endMin && mins < 720;
    if (baseDate && overnightCtx && mins < endMin) date = evAddDays(baseDate, 1);
    var inNight = overnightCtx && (mins >= 22 * 60 || mins < 7 * 60);
    var fallRe = /\b(fell|fall|slipped to the floor|on the floor|found on the floor)\b/i, nmRe = /\b(near miss|nearly fell|almost fell|steadied|caught (him|her|them)|lowered (him|her|them))\b/i;
    var cat = null, act = '';
    if (nmRe.test(s) && !evNegated(s, nmRe)) { cat = 'near_miss'; act = 'Near miss'; }
    else if (fallRe.test(s) && !evNegated(s, fallRe)) { cat = 'incident'; act = 'Fall'; }
    else if (/\b(pad|wet|soiled|bedding|toilet|bathroom|urinal|continence|changed)\b/i.test(s) && !evNegated(s, /\b(pad|wet|soiled|toilet|bathroom)\b/i)) { cat = inNight ? 'overnight_assist' : 'daytime_task'; act = 'Continence / toileting'; }
    else if (/\btransfer|\bhoist|\bshower chair\b/i.test(s)) { cat = inNight ? 'overnight_assist' : 'daytime_task'; act = 'Transfer'; }
    else if (/\b(showered|shower)\b/i.test(s) && !evNegated(s, /\bshower/i)) { cat = 'daytime_task'; act = 'Shower'; }
    else if (/\b(reposition|repositioned|turned (him|her|them)|made comfortable)\b/i.test(s)) { cat = inNight ? 'overnight_assist' : 'daytime_task'; act = 'Repositioning'; }
    else if (/\b(resettl|prompt|redirect|reassur|calm)/i.test(s) && inNight) { cat = 'overnight_assist'; act = 'Prompting / resettling'; }
    else if (/\b(woke|awake|call bell|siren|called out)\b/i.test(s) && inNight) { cat = /\b(no (assistance|support|help)|needed nothing|settled (himself|herself|themselves))\b/i.test(s) ? 'overnight_awake_no_assist' : 'overnight_assist'; act = cat === 'overnight_assist' ? 'Attended after waking' : 'Awake, no assistance'; }
    else if (/\b(medication|meds|tablets)\b/i.test(s)) { cat = 'daytime_task'; act = 'Medication support'; }
    if (!cat) return;
    var outcome = /\b(no (visible )?injur(y|ies)|denied (any )?(pain|injury)|not injured|uninjured)\b/i.test(s) ? 'No injury (as stated)' : '';
    out.push({ obs_date: date, start_time: t0, end_time: times[1] || null, timing: /about|around|approx/i.test(s) ? 'estimated' : 'exact', category: cat, assist_type: act, reason: '', outcome: outcome, workers_involved: null,
      source_ref: 'Sentence ' + (idx + 1) + ': “' + s.slice(0, 220) + (s.length > 220 ? '…' : '') + '”', status: 'proposed', uncertain: afterEnd || (!overnightCtx && (mins >= 22 * 60 || mins < 7 * 60)) });
  });
  return out;
}

/* ---------- demonstration data: an entirely synthetic participant, shifts and records ---------- */
function evDemoDataset(from, to){
  var c = { id: 'demo-participant', name: 'Demo Participant (synthetic)', address: '1 Example Street, Sampleville (synthetic)', colour: '#6B7280' };
  var seed = 7; function rnd(){ seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  var shifts = [], incidents = [], nearMisses = [], careLogs = [], overnightLogs = [], notes = [], sources = [], observations = [];
  var nowIso = to + 'T12:00:00';
  var n = 0;
  for (var d = from; d <= to; d = evAddDays(d, 1)) {
    n++;
    var day = { id: 'demo-s-' + n + 'd', client_id: c.id, date: d, type: 'day', start_t: '09:00', end_t: '18:00', worker_id: 'demo-w1', created_at: d + 'T00:00:00Z' };
    var night = { id: 'demo-s-' + n + 'n', client_id: c.id, date: d, type: 'sleepover', start_t: '18:00', end_t: '09:00', worker_id: 'demo-w2', created_at: d + 'T00:00:00Z' };
    shifts.push(day, night);
    var r = rnd();
    if (r > 0.25) careLogs.push({ id: 'demo-c-' + n, shift_id: day.id, participant_id: c.id, pad_wet: Math.floor(rnd() * 3) + 1, pad_bowel: rnd() > 0.5 ? 1 : 0, bed_wet: rnd() > 0.7 ? 1 : 0, bedding_changes: rnd() > 0.7 ? 1 : 0, shower_offered: true, shower_done: rnd() > 0.3 ? true : (rnd() > 0.5 ? false : null), shower_prompts: Math.floor(rnd() * 4), care_refusals: Math.floor(rnd() * 2), transfers: 6 + Math.floor(rnd() * 8), created_at: d + 'T18:30:00Z' });
    var r2 = rnd();
    if (r2 > 0.3) { var active = evRound(Math.floor(rnd() * 16) * 0.25); overnightLogs.push({ id: 'demo-o-' + n, shift_id: night.id, participant_id: c.id, bed_time: rnd() > 0.5 ? '20:30' : '21:15', wake_time: rnd() > 0.5 ? '03:30' : '05:45', wakes: Math.floor(rnd() * 3), asleep_hours: evRound(Math.max(0, 8 - active - Math.floor(rnd() * 4) * 0.25)), active_hours: active, created_at: evAddDays(d, 1) + 'T09:30:00Z' }); }
    else if (r2 > 0.15) overnightLogs.push({ id: 'demo-o-' + n, shift_id: night.id, participant_id: c.id, bed_time: '21:00', wake_time: null, wakes: null, asleep_hours: null, active_hours: null, created_at: evAddDays(d, 1) + 'T09:30:00Z' });
    notes.push({ id: 'demo-n-' + n, shift_id: day.id, participant_id: c.id, worker_id: 'demo-w1', note_type: 'Progress Notes', body: 'SYNTHETIC NOTE ' + n, created_at: d + 'T19:00:00Z' });
    if (rnd() > 0.82) incidents.push({ id: 'demo-i-' + n, participant_id: c.id, shift_id: day.id, incident_date: d, incident_time: (9 + Math.floor(rnd() * 8)) + ':' + (rnd() > 0.5 ? '15' : '40'), incident_types: [rnd() > 0.5 ? 'Injury' : 'Medical concern'], is_fall: true, fall_location: ['Bathroom', 'Bedroom', 'Lounge or living room'][Math.floor(rnd() * 3)], during_transfer: rnd() > 0.4, minutes_on_floor: rnd() > 0.5 ? Math.floor(rnd() * 30) : null, emergency: rnd() > 0.7 ? ['Ambulance'] : ['No'], injuries: rnd() > 0.6 ? 'Yes - provide details below' : (rnd() > 0.5 ? 'No' : null), injury_kind: 'Soft tissue injury (bruising)', ticket_desc: 'Synthetic incident ' + n + ' for demonstration.', response: 'Synthetic response.', outcome: 'Synthetic outcome.', created_at: d + 'T20:00:00Z' });
    if (rnd() > 0.8) nearMisses.push({ id: 'demo-m-' + n, participant_id: c.id, shift_id: day.id, nm_date: d, nm_time: (10 + Math.floor(rnd() * 7)) + ':' + (rnd() > 0.5 ? '05' : '50'), location: ['Bathroom', 'Hallway or doorway', 'Vehicle'][Math.floor(rnd() * 3)], during_transfer: rnd() > 0.3, description: 'Synthetic near miss ' + n + '.', prevented_by: rnd() > 0.5 ? 'Worker steadied and lowered to the chair' : 'Grab rail used', equipment_factor: rnd() > 0.7, equipment_desc: '', created_at: d + 'T20:00:00Z' });
  }
  var nightForObs = evAddDays(from, 2);
  sources.push({ id: 'demo-src-1', participant_id: c.id, kind: 'upload', title: 'DEMO — typed-up paper sleep log (synthetic)', author: 'Synthetic author', event_from: nightForObs, event_to: evAddDays(nightForObs, 1), mime: 'text/plain', extraction: 'text', excluded: false, sha256: 'demo1', created_at: to + 'T00:00:00Z', text_content: 'SYNTHETIC. Went to bed at 8:45pm. Woke at about 1:00am and was changed after being found wet, settled by about 1:40am. Woke at about 3:30am and was assisted to the toilet, back in bed by 3:50am.' });
  sources.push({ id: 'demo-src-2', participant_id: c.id, kind: 'upload', title: 'DEMO — training sample (excluded)', author: 'Generated example', event_from: from, mime: 'text/plain', extraction: 'text', excluded: true, excluded_reason: 'training sample', sha256: 'demo2', created_at: to + 'T00:00:00Z', text_content: 'Generated example — excluded.' });
  observations.push(
    { id: 'demo-ob-1', participant_id: c.id, source_id: 'demo-src-1', obs_date: evAddDays(nightForObs, 1), start_time: '01:00', end_time: '01:40', timing: 'estimated', category: 'overnight_assist', assist_type: 'Continence / toileting', reason: 'Found wet (as recorded)', outcome: '', status: 'accepted', source_ref: 'Sentence 2', reviewer: 'Demo reviewer', reviewed_at: to + 'T00:00:00Z' },
    { id: 'demo-ob-2', participant_id: c.id, source_id: 'demo-src-1', obs_date: evAddDays(nightForObs, 1), start_time: '03:30', end_time: '03:50', timing: 'estimated', category: 'overnight_assist', assist_type: 'Transfer', reason: 'Assisted to the toilet (as recorded)', outcome: '', status: 'accepted', source_ref: 'Sentence 3', reviewer: 'Demo reviewer', reviewed_at: to + 'T00:00:00Z' },
    { id: 'demo-ob-3', participant_id: c.id, source_id: 'demo-src-1', obs_date: evAddDays(nightForObs, 1), start_time: '03:35', timing: 'estimated', category: 'overnight_assist', assist_type: 'Continence / toileting', reason: 'repeat account', outcome: '', status: 'proposed', source_ref: 'Sentence 3 (again)' }
  );
  return { client: c, now: nowIso, shifts: shifts, incidents: incidents, nearMisses: nearMisses, careLogs: careLogs, overnightLogs: overnightLogs, notes: notes, sources: sources, observations: observations, versions: [], workers: [{ id: 'demo-w1', name: 'Demo Worker A' }, { id: 'demo-w2', name: 'Demo Worker B' }] };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { evBuildDataset: evBuildDataset, evMergeIntervals: evMergeIntervals, evExportModel: evExportModel, evFindCandidates: evFindCandidates, evDemoDataset: evDemoDataset, evSplitSegmentDate: evSplitSegmentDate, evMergeMinutes: evMergeMinutes, evNightOf: evNightOf, evBlockHours: evBlockHours, EV_CALC_VERSION: EV_CALC_VERSION, EV_DEFINITIONS: EV_DEFINITIONS };
