/* ================= evidence metrics — pure functions, no DOM, no network =================
   Everything the Summary tab and the report show is computed here from plain records, so the
   same code runs in the browser and in node tests (tests/metrics.test.js). Definitions are in
   EVIDENCE_METRICS.md and mirrored in EV_METHOD below. Version: metrics-v2. */
var EV_CALC_VERSION = 'metrics-v2';
var EV_SLEEP_BLOCK = { from: '23:00', to: '07:00', hours: 8 };
var EV_SLEEPOVER_INCLUDED_HOURS = 2;   // NDIS PAPL: up to 2 h of active support inside an 8 h sleepover
var EV_TRANSFER_LOCS = ['Bed', 'Shower', 'Toilet', 'Couch to wheelchair', 'Wheelchair to bed', 'Vehicle'];
var EV_BLANK_ZERO_CUTOFF = '2026-09-07';  // rows created before this stored blank answers as 0

var EV_METHOD = [
  ['Timezone', 'All dates and times are the participant’s service-local time (Australia/Melbourne) as entered by the worker. Overnight intervals are counted as 15-minute blocks from the paper sleep log, never by subtracting clock times across midnight or a daylight-saving change.'],
  ['Event time, not record time', 'Every figure uses the event date and time recorded on the form. When a record was created, uploaded or edited is never used in a calculation and never printed.'],
  ['Overnight nights', 'A sleepover shift is labelled by its start and end dates and counted under the night it started. Figures are for the 11:00 pm to 7:00 am block only.'],
  ['Rostered vs documented', 'Rostered = a shift exists. Documented = a record of that type exists for the shift. Rostered does not mean delivered or documented. Coverage is shown as n of N with the percentage beside it.'],
  ['Missing vs zero', 'No record = not recorded, excluded from numerators and denominators. A blank field = not recorded. A recorded 0 = 0. Rows saved before 7 Sep 2026 stored blank numeric answers as 0 and are listed under Sources and checks.'],
  ['Partial records', 'A record counts only for the measures it actually contains. It never counts as a complete day or night.'],
  ['One event, counted once', 'An event described in a note, an incident report and an uploaded document counts once. The structured record is the counted instance; reviewed observations that duplicate it are linked and excluded from totals. Uncertain duplicates are flagged for a person to decide.'],
  ['Excluded material', 'Sources marked excluded (training samples, generated examples, demonstrations) and observations still proposed or rejected never enter any figure.'],
  ['The 2-hour line', 'The NDIS Pricing Arrangements and Price Limits provide for up to 2 hours of active support inside an 8-hour sleepover; support beyond that is claimable separately (NDIS Quality and Safeguards Commission, “Sleepover shifts”, worker alert dated August 2026). The line is drawn against direct worker assistance only. Crossing it is a pricing fact, not an eligibility finding.'],
  ['Transfers', 'A fall or near miss is transfer-related only when its recorded location names a transfer. Being in bed, a bathroom or a vehicle does not by itself establish that a transfer was happening.'],
  ['Staffing', 'Four facts are kept apart: two workers actually assisted; one worker reported difficulty; a clinician recommended two; the provider is requesting two. Nothing here infers a staffing requirement from a fall, weight, an emergency recovery or a neighbour helping.']
];

function evAddDays(d, n){ var p = d.split('-'); var dt = new Date(+p[0], +p[1] - 1, +p[2] + n); return dt.getFullYear() + '-' + (dt.getMonth() < 9 ? '0' : '') + (dt.getMonth() + 1) + '-' + (dt.getDate() < 10 ? '0' : '') + dt.getDate(); }
function evMondayOf(d){ var p = d.split('-'); var dt = new Date(+p[0], +p[1] - 1, +p[2]); var off = (dt.getDay() + 6) % 7; return evAddDays(d, -off); }
function evTMin(t){ if (!t) return null; var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); }
function evNum(v){ if (v === null || v === undefined || v === '') return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
function evSum(a){ return a.reduce(function(x, y){ return x + y; }, 0); }
function evAvg(a){ return a.length ? evSum(a) / a.length : null; }
function evRound(n, d){ var f = Math.pow(10, d == null ? 2 : d); return Math.round(n * f) / f; }
/* clock times averaged as minutes after noon of the start day, so 23:30 and 00:30 average to 00:00 */
function evAvgClock(times){
  var m = times.filter(Boolean).map(function(t){ var x = evTMin(t); return x < 720 ? x + 1440 : x; });
  if (!m.length) return null;
  var a = Math.round(evAvg(m)) % 1440;
  return (a < 600 ? '0' : '') + Math.floor(a / 60) + ':' + (a % 60 < 10 ? '0' : '') + (a % 60);
}
function evIsPreNullRow(r){ return !!(r && r.created_at && r.created_at.slice(0, 10) < EV_BLANK_ZERO_CUTOFF); }

/* ---- build the whole dataset for one participant and period ----
   input: { client:{id,name}, from, to, shifts, incidents, nearMisses, careLogs, overnightLogs,
            notes, sources, observations, tz }  (already filtered to the participant is fine;
   this function filters by id and date again anyway) */
function evBuildDataset(inp){
  var cid = inp.client.id, from = inp.from, to = inp.to;
  function inRange(d){ return d && d >= from && d <= to; }
  var excludedSrc = {};
  (inp.sources || []).forEach(function(s){ if (s.excluded) excludedSrc[s.id] = true; });
  var obs = (inp.observations || []).filter(function(o){ return o.participant_id === cid && o.status === 'accepted' && !o.duplicate_of && !excludedSrc[o.source_id] && inRange(o.obs_date); });
  var shifts = (inp.shifts || []).filter(function(s){ return s.client_id === cid && inRange(s.date); });
  var byId = {}; shifts.forEach(function(s){ byId[s.id] = s; });
  var incs = (inp.incidents || []).filter(function(i){ return i.participant_id === cid && inRange(i.incident_date); });
  var nms = (inp.nearMisses || []).filter(function(n){ return n.participant_id === cid && inRange(n.nm_date); });
  var care = (inp.careLogs || []).filter(function(l){ return byId[l.shift_id]; });
  var onl = (inp.overnightLogs || []).filter(function(l){ return byId[l.shift_id]; });
  var notes = (inp.notes || []).filter(function(n){ return byId[n.shift_id] && n.note_type !== 'Mileage'; });

  /* ---- coverage ---- */
  var days = {}, nights = shifts.filter(function(s){ return s.type === 'sleepover'; });
  shifts.forEach(function(s){ days[s.date] = 1; });
  var noteShiftIds = {}; notes.forEach(function(n){ noteShiftIds[n.shift_id] = 1; });
  var careShiftIds = {}; care.forEach(function(l){ careShiftIds[l.shift_id] = 1; });
  var onShiftIds = {}; onl.forEach(function(l){ onShiftIds[l.shift_id] = 1; });
  var periodDays = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
  var coverage = {
    periodDays: periodDays,
    daysWithShifts: Object.keys(days).length,
    shiftsRostered: shifts.length,
    shiftsWithNote: shifts.filter(function(s){ return noteShiftIds[s.id]; }).length,
    shiftsWithCareLog: shifts.filter(function(s){ return careShiftIds[s.id]; }).length,
    nightsRostered: nights.length,
    nightsWithSummary: nights.filter(function(s){ return onShiftIds[s.id]; }).length,
    incidentReports: incs.length, nearMisses: nms.length,
    uploads: (inp.sources || []).filter(function(s){ return s.participant_id === cid && s.kind === 'upload' && !s.excluded; }).length,
    acceptedObservations: obs.length,
    proposedObservations: (inp.observations || []).filter(function(o){ return o.participant_id === cid && o.status === 'proposed' && inRange(o.obs_date); }).length
  };

  /* ---- safety ---- */
  var falls = incs.filter(function(i){ return i.is_fall; });
  var secondPerson = falls.filter(function(i){ return i.second_person_needed; });
  var floorRecorded = falls.filter(function(i){ return i.minutes_on_floor != null; });
  var emerg = incs.filter(function(i){ return (i.emergency || []).some(function(x){ return x && x !== 'No'; }); });
  var injuries = incs.filter(function(i){ return i.injuries && i.injuries !== 'No'; });
  var equip = incs.filter(function(i){ return i.equipment_involved || (i.incident_types || []).indexOf('Equipment failure') >= 0; }).length + nms.filter(function(n){ return n.equipment_factor; }).length;
  function transferRelated(loc){ return EV_TRANSFER_LOCS.indexOf(loc) >= 0; }
  var transferEvents = falls.filter(function(i){ return transferRelated(i.fall_location); }).length + nms.filter(function(n){ return transferRelated(n.location); }).length;
  var weeks = []; for (var w = evMondayOf(from); w <= to; w = evAddDays(w, 7)) weeks.push(w);
  var weekly = weeks.map(function(w0){
    return { week: w0, falls: falls.filter(function(i){ return evMondayOf(i.incident_date) === w0; }).length, nearMisses: nms.filter(function(n){ return evMondayOf(n.nm_date) === w0; }).length };
  });
  var loc = {};
  falls.forEach(function(i){ var k = i.fall_location || 'Not recorded'; loc[k] = loc[k] || { falls: 0, nearMisses: 0 }; loc[k].falls++; });
  nms.forEach(function(n){ var k = n.location || 'Not recorded'; loc[k] = loc[k] || { falls: 0, nearMisses: 0 }; loc[k].nearMisses++; });
  var safety = {
    falls: falls.length, nearMisses: nms.length, secondPerson: secondPerson.length,
    floorMinutes: evSum(floorRecorded.map(function(i){ return i.minutes_on_floor; })), floorRecorded: floorRecorded.length,
    emergencyCalls: emerg.length, emergencyDates: emerg.map(function(i){ return i.incident_date; }),
    injuries: injuries.length, equipment: equip, transferRelated: transferEvents, events: falls.length + nms.length,
    nmBeyondCapacity: nms.filter(function(n){ return n.single_worker_capacity; }).length,
    weekly: weekly,
    locations: Object.keys(loc).map(function(k){ return { location: k, falls: loc[k].falls, nearMisses: loc[k].nearMisses, transfer: transferRelated(k) }; }).sort(function(a, b){ return (b.falls + b.nearMisses) - (a.falls + a.nearMisses); })
  };

  /* ---- overnight: one row per ROSTERED night ---- */
  var onByShift = {}; onl.forEach(function(l){ onByShift[l.shift_id] = l; });
  var nightRows = nights.sort(function(a, b){ return a.date < b.date ? -1 : 1; }).map(function(s){
    var l = onByShift[s.id];
    var asleep = l ? evNum(l.asleep_hours) : null, active = l ? evNum(l.active_hours) : null;
    var status = !l ? 'missing' : (asleep == null || active == null ? 'partial' : 'documented');
    var awake = (asleep != null && active != null) ? evRound(Math.max(0, EV_SLEEP_BLOCK.hours - asleep - active)) : null;
    return { shiftId: s.id, date: s.date, endDate: evAddDays(s.date, 1), label: s.date + ' → ' + evAddDays(s.date, 1),
      status: status, asleep: asleep, active: active, awakeNoAssist: awake,
      over: active != null ? evRound(Math.max(0, active - EV_SLEEPOVER_INCLUDED_HOURS)) : null,
      wakes: l ? evNum(l.wakes) : null, bed: l ? l.bed_time : null, up: l ? l.wake_time : null,
      preNullZero: l ? (evIsPreNullRow(l) && (l.wakes === 0)) : false, worker_id: s.worker_id };
  });
  var doc = nightRows.filter(function(r){ return r.status === 'documented'; });
  var overnight = {
    rows: nightRows, rostered: nightRows.length, documented: doc.length, partial: nightRows.filter(function(r){ return r.status === 'partial'; }).length,
    missing: nightRows.filter(function(r){ return r.status === 'missing'; }).length,
    avgAsleep: doc.length ? evRound(evAvg(doc.map(function(r){ return r.asleep; }))) : null,
    avgActive: doc.length ? evRound(evAvg(doc.map(function(r){ return r.active; }))) : null,
    avgAwake: doc.length ? evRound(evAvg(doc.map(function(r){ return r.awakeNoAssist; }))) : null,
    nightsOver: doc.filter(function(r){ return r.active > EV_SLEEPOVER_INCLUDED_HOURS; }).length,
    hoursOver: evRound(evSum(doc.map(function(r){ return r.over; }))),
    wakesRecorded: doc.filter(function(r){ return r.wakes != null; }).length,
    avgWakes: (function(){ var a = doc.filter(function(r){ return r.wakes != null; }).map(function(r){ return r.wakes; }); return a.length ? evRound(evAvg(a)) : null; })(),
    avgBed: evAvgClock(doc.map(function(r){ return r.bed; })), avgUp: evAvgClock(doc.map(function(r){ return r.up; })),
    upBuckets: (function(){ var b = {}; doc.forEach(function(r){ if (!r.up) return; var m = Math.floor(evTMin(r.up) / 30) * 30; var k = (m / 60 < 10 ? '0' : '') + Math.floor(m / 60) + ':' + (m % 60 ? '30' : '00'); b[k] = (b[k] || 0) + 1; }); return Object.keys(b).sort().map(function(k){ return { time: k, nights: b[k] }; }); })(),
    /* reviewed overnight observations give the time-of-night picture; in-block only */
    timeline: obs.filter(function(o){ return /^overnight_/.test(o.category) && o.start_time; }).map(function(o){
      var m = evTMin(o.start_time); var inBlock = m >= evTMin(EV_SLEEP_BLOCK.from) || m < evTMin(EV_SLEEP_BLOCK.to);
      return { date: o.obs_date, start: o.start_time, end: o.end_time || null, category: o.category, timing: o.timing, assist: o.assist_type || '', reason: o.reason || '', workers: o.workers_involved, inBlock: inBlock, sourceRef: o.source_ref || '', id: o.id };
    }).sort(function(a, b){ return a.date === b.date ? (evTMin(a.start) < 720 ? evTMin(a.start) + 1440 : evTMin(a.start)) - (evTMin(b.start) < 720 ? evTMin(b.start) + 1440 : evTMin(b.start)) : (a.date < b.date ? -1 : 1); })
  };

  /* ---- daytime / personal care ---- */
  var careDays = {}; care.forEach(function(l){ careDays[byId[l.shift_id].date] = 1; });
  var nCareDays = Object.keys(careDays).length;
  function measure(key, label){
    var rec = care.filter(function(l){ return l[key] != null; });
    return { key: key, label: label, total: evSum(rec.map(function(l){ return l[key]; })), recorded: rec.length, of: care.length,
      perDay: nCareDays ? evRound(evSum(rec.map(function(l){ return l[key]; })) / nCareDays) : null, preNullZero: rec.filter(function(l){ return evIsPreNullRow(l) && l[key] === 0; }).length };
  }
  var showers = care.filter(function(l){ return l.shower_offered; });
  var daytime = {
    careLogs: care.length, careDays: nCareDays,
    measures: [ measure('pad_wet', 'Pad changes (wet)'), measure('pad_bowel', 'Pad changes (bowel)'), measure('bed_wet', 'Found wet in bed'), measure('bedding_changes', 'Bedding changes'),
      measure('care_refusals', 'Care refusals needing prompting'), measure('transfers', 'Assisted transfers'), measure('transfer_unsafe_alone', 'Transfers one worker could not do safely alone') ],
    showers: { offered: showers.length, done: showers.filter(function(l){ return l.shower_done; }).length, declined: showers.filter(function(l){ return !l.shower_done; }).length,
      avgPrompts: (function(){ var a = showers.filter(function(l){ return l.shower_prompts != null; }).map(function(l){ return l.shower_prompts; }); return a.length ? evRound(evAvg(a)) : null; })() },
    /* task table: from reviewed daytime observations */
    tasks: obs.filter(function(o){ return o.category === 'daytime_task'; }).map(function(o){
      return { date: o.obs_date, time: o.start_time || '', task: o.assist_type || '', assistance: o.reason || '', workers: o.workers_involved, outcome: o.outcome || '', sourceRef: o.source_ref || '', timing: o.timing, id: o.id };
    }),
    twoWorkersActual: obs.filter(function(o){ return o.workers_involved != null && o.workers_involved >= 2; }).length + secondPerson.length,
    difficultyReported: evSum(care.filter(function(l){ return l.transfer_unsafe_alone != null; }).map(function(l){ return l.transfer_unsafe_alone; })) + safety.nmBeyondCapacity
  };

  /* ---- incidents chronology (structured records; reviewed observations that duplicate them are already excluded) ---- */
  var chron = incs.map(function(i){
    return { kind: 'incident', date: i.incident_date, time: i.incident_time || '', types: (i.incident_types || []).join(', '), fall: !!i.is_fall, location: i.fall_location || '', response: i.response || '', outcome: i.outcome || '', emergency: (i.emergency || []).filter(function(x){ return x && x !== 'No'; }).join(', '), injuries: i.injuries && i.injuries !== 'No' ? (i.injury_kind || 'Yes') : 'No', secondPerson: !!i.second_person_needed, minutesOnFloor: i.minutes_on_floor, id: i.id, shiftId: i.shift_id };
  }).concat(nms.map(function(n){
    return { kind: 'near_miss', date: n.nm_date, time: n.nm_time || '', types: 'Near miss', fall: false, location: n.location || '', response: n.prevented_by || '', outcome: 'No injury', emergency: '', injuries: 'No', secondPerson: false, beyondCapacity: !!n.single_worker_capacity, id: n.id, shiftId: n.shift_id };
  })).sort(function(a, b){ return a.date === b.date ? (a.time < b.time ? -1 : 1) : (a.date < b.date ? -1 : 1); });

  /* ---- checks: things a reviewer must look at ---- */
  var checks = [];
  care.forEach(function(l){ if (evIsPreNullRow(l)) checks.push({ kind: 'pre-null zero', date: byId[l.shift_id].date, detail: 'Care log saved before 7 Sep 2026: any 0 may be an unanswered box.', ref: l.id }); });
  onl.forEach(function(l){ if (evIsPreNullRow(l) && l.wakes === 0) checks.push({ kind: 'pre-null zero', date: byId[l.shift_id].date, detail: 'Overnight summary saved before 7 Sep 2026 with 0 wakes: may be an unanswered box.', ref: l.id }); });
  /* same-shift narrative vs structured: reviewed observations on a night with a summary are compared on the wake count */
  nightRows.forEach(function(r){
    if (r.status !== 'documented') return;
    var wakeObs = overnight.timeline.filter(function(t){ return t.date === r.date && t.category === 'overnight_assist' && t.inBlock; }).length;
    if (r.wakes != null && wakeObs && wakeObs !== r.wakes) checks.push({ kind: 'reconcile', date: r.date, detail: 'Overnight summary records ' + r.wakes + ' wake' + (r.wakes === 1 ? '' : 's') + ' before up-for-the-day; ' + wakeObs + ' reviewed in-block assistance event' + (wakeObs === 1 ? '' : 's') + ' from the narrative. Confirm which is right; nothing has been changed.', ref: r.shiftId });
  });
  /* possible duplicates: two incidents / near misses within 30 min on the same date */
  for (var a = 0; a < chron.length; a++) for (var b = a + 1; b < chron.length; b++) {
    if (chron[a].date !== chron[b].date || !chron[a].time || !chron[b].time) continue;
    if (Math.abs(evTMin(chron[a].time) - evTMin(chron[b].time)) <= 30) checks.push({ kind: 'possible duplicate', date: chron[a].date, detail: chron[a].types + ' at ' + chron[a].time + ' and ' + chron[b].types + ' at ' + chron[b].time + ' may describe one event. Both are counted until a reviewer links them.', ref: chron[a].id + ',' + chron[b].id });
  }
  (inp.observations || []).filter(function(o){ return o.participant_id === cid && o.status === 'proposed' && inRange(o.obs_date); }).forEach(function(o){ checks.push({ kind: 'unreviewed', date: o.obs_date, detail: 'Proposed observation not yet reviewed: excluded from all figures.', ref: o.id }); });
  (inp.sources || []).filter(function(s){ return s.participant_id === cid && s.kind === 'upload' && s.extraction === 'needs_ocr'; }).forEach(function(s){ checks.push({ kind: 'needs OCR / manual', date: s.event_from || '', detail: (s.title || s.file_name || 'Upload') + ': no machine-readable text; enter observations by hand from the document.', ref: s.id }); });

  return { version: EV_CALC_VERSION, client: { id: cid, name: inp.client.name }, from: from, to: to, tz: inp.tz || 'Australia/Melbourne',
    coverage: coverage, safety: safety, overnight: overnight, daytime: daytime, chronology: chron, checks: checks,
    method: EV_METHOD, sleepBlock: EV_SLEEP_BLOCK, includedHours: EV_SLEEPOVER_INCLUDED_HOURS };
}

/* deterministic candidate finder for uploaded / pasted text: sentences with a clock time and a
   support keyword become PROPOSED observations that a person must accept, edit or reject.
   Nothing here invents times or reasons; the quote is kept as the source reference. */
var EV_TIME_RE = /\b(?:at |about |around |approximately |approx\.? )?((?:[01]?\d|2[0-3])(?::[0-5]\d)?\s?(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d)\b/gi;
var EV_KEYWORDS = [
  [/\b(fell|fall|slipped|on the floor)\b/i, 'incident', 'fall'],
  [/\b(near miss|nearly fell|steadied|caught him|caught her|lowered)\b/i, 'near_miss', 'near miss'],
  [/\b(woke|awake|wet|pad change|changed (his|her|the) pad|bedding|toilet|bathroom|call bell|siren|urinal)\b/i, 'overnight_assist', 'overnight assistance'],
  [/\b(transfer|transferred|wheelchair|hoist|shower chair|showered|shower)\b/i, 'daytime_task', 'transfer / personal care'],
  [/\b(medication|meds|tablets)\b/i, 'daytime_task', 'medication support'],
  [/\b(second (worker|person)|two workers|2:1|neighbour|ambulance|000)\b/i, 'incident', 'additional person / emergency']
];
function evNormTime(t){
  var m = t.toLowerCase().replace(/\s+/g, '').match(/^(\d{1,2})(?::(\d{2}))?(am|pm)?$/); if (!m) return null;
  var h = +m[1], mi = m[2] ? +m[2] : 0;
  if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0;
  if (!m[3] && !m[2]) return null;   // a bare number with no am/pm and no minutes is not a time
  return (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi;
}
function evFindCandidates(text, baseDate){
  var out = [];
  var sentences = (text || '').replace(/\r/g, '').split(/(?<=[.!?])\s+|\n{2,}/);
  sentences.forEach(function(sent, idx){
    var s = sent.replace(/\s+/g, ' ').trim(); if (s.length < 12) return;
    var times = []; var m; EV_TIME_RE.lastIndex = 0;
    while ((m = EV_TIME_RE.exec(s))) { var t = evNormTime(m[1]); if (t) times.push(t); }
    if (!times.length) return;
    var hit = null; for (var k = 0; k < EV_KEYWORDS.length; k++) if (EV_KEYWORDS[k][0].test(s)) { hit = EV_KEYWORDS[k]; break; }
    if (!hit) return;
    var t0 = times[0], mins = evTMin(t0);
    /* narrative for a sleepover shift: times before 12:00 belong to the following morning */
    var date = baseDate; if (baseDate && /overnight/.test(hit[1]) && mins < 720) date = evAddDays(baseDate, 1);
    out.push({ obs_date: date || null, start_time: t0, end_time: times[1] || null, timing: /about|around|approx/i.test(s) ? 'estimated' : 'exact',
      category: hit[1], assist_type: hit[2], reason: '', workers_involved: /\b(second (worker|person)|two workers|neighbour|ambulance)\b/i.test(s) ? 2 : null,
      source_ref: 'Sentence ' + (idx + 1) + ': “' + s.slice(0, 220) + (s.length > 220 ? '…' : '') + '”', status: 'proposed' });
  });
  return out;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { evBuildDataset: evBuildDataset, evFindCandidates: evFindCandidates, evAvgClock: evAvgClock, EV_CALC_VERSION: EV_CALC_VERSION, EV_METHOD: EV_METHOD };
