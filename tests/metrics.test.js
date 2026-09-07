/* Metric tests on synthetic, clearly labelled fixtures. Run: node tests/metrics.test.js */
var M = require('../parts/p9a_metrics.js');
var fails = 0, n = 0;
function eq(name, got, want){ n++; var ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log('FAIL ' + name + '\n   got  ' + JSON.stringify(got) + '\n   want ' + JSON.stringify(want)); } else console.log('ok   ' + name); }
var C = { id: 'c-test', name: 'Test Participant (synthetic)' };
function shift(id, date, type, extra){ return Object.assign({ id: id, client_id: C.id, date: date, type: type, start_t: type === 'sleepover' ? '18:00' : '09:00', end_t: type === 'sleepover' ? '09:00' : '18:00', worker_id: 'w1' }, extra || {}); }

/* 1. one documented night among many rostered; quiet night kept; missing ≠ zero */
var shifts = []; for (var i = 1; i <= 7; i++) shifts.push(shift('n' + i, '2030-03-0' + i, 'sleepover'));
var overnight = [
  { shift_id: 'n2', bed_time: '20:45', wake_time: '03:30', wakes: 1, asleep_hours: 4.25, active_hours: 3.75, created_at: '2030-03-03T10:00:00Z' },   // active night
  { shift_id: 'n4', bed_time: '21:30', wake_time: '06:45', wakes: 0, asleep_hours: 7.5, active_hours: 0.25, created_at: '2030-03-05T10:00:00Z' },   // quiet night
  { shift_id: 'n6', bed_time: '22:00', wake_time: null, wakes: null, asleep_hours: null, active_hours: null, created_at: '2030-03-07T10:00:00Z' }  // partial
];
var ds = M.evBuildDataset({ client: C, from: '2030-03-01', to: '2030-03-07', shifts: shifts, overnightLogs: overnight, incidents: [], nearMisses: [], careLogs: [], notes: [], sources: [], observations: [] });
eq('nights rostered', ds.overnight.rostered, 7);
eq('nights documented / partial / missing', [ds.overnight.documented, ds.overnight.partial, ds.overnight.missing], [2, 1, 4]);
eq('avg active uses documented nights only (not 7)', ds.overnight.avgActive, 2);
eq('nights over 2 h = 1 of 2 documented', [ds.overnight.nightsOver, ds.overnight.documented], [1, 2]);
eq('hours over allowance', ds.overnight.hoursOver, 1.75);
eq('quiet night retained in rows', ds.overnight.rows[3].active, 0.25);
eq('missing night is status missing, not zero', [ds.overnight.rows[0].status, ds.overnight.rows[0].active], ['missing', null]);
eq('awake-without-assistance derived separately', ds.overnight.rows[1].awakeNoAssist, 0);
eq('night label shows both dates', ds.overnight.rows[1].label, '2030-03-02 → 2030-03-03');

/* 2. clock-time averaging across midnight */
eq('avg of 23:30 and 00:30 is 00:00', M.evAvgClock(['23:30', '00:30']), '00:00');
eq('avg of 20:45 and 21:15 is 21:00', M.evAvgClock(['20:45', '21:15']), '21:00');

/* 3. blank vs zero on care logs; per-day denominators = days with a log */
var dayShifts = [shift('d1', '2030-03-01', 'day'), shift('d2', '2030-03-02', 'day'), shift('d3', '2030-03-03', 'day')];
var care = [
  { shift_id: 'd1', pad_wet: 3, pad_bowel: null, transfers: 10, transfer_unsafe_alone: 1, created_at: '2030-03-01T20:00:00Z' },
  { shift_id: 'd2', pad_wet: 0, pad_bowel: 1, transfers: 8, transfer_unsafe_alone: 0, created_at: '2030-03-02T20:00:00Z' }
];
var ds2 = M.evBuildDataset({ client: C, from: '2030-03-01', to: '2030-03-07', shifts: dayShifts, careLogs: care, overnightLogs: [], incidents: [], nearMisses: [], notes: [], sources: [], observations: [] });
var padWet = ds2.daytime.measures[0], padBowel = ds2.daytime.measures[1];
eq('care logs 2 of 3 shifts', [ds2.coverage.shiftsWithCareLog, ds2.coverage.shiftsRostered], [2, 3]);
eq('pad_wet total 3, recorded 2 of 2, per day over 2 care days', [padWet.total, padWet.recorded, padWet.of, padWet.perDay], [3, 2, 2, 1.5]);
eq('pad_bowel: blank excluded (recorded 1 of 2), total 1', [padBowel.total, padBowel.recorded], [1, 1]);
eq('difficulty reported counts unsafe transfers', ds2.daytime.difficultyReported, 1);

/* 4. pre-cutoff rows flagged, not corrected */
var old = [{ shift_id: 'd1', pad_wet: 0, pad_bowel: 0, transfers: 0, created_at: '2026-08-31T20:00:00Z' }];
var ds3 = M.evBuildDataset({ client: C, from: '2030-03-01', to: '2030-03-07', shifts: dayShifts, careLogs: old, overnightLogs: [], incidents: [], nearMisses: [], notes: [], sources: [], observations: [] });
eq('pre-null-zero check raised', ds3.checks.filter(function(c){ return c.kind === 'pre-null zero'; }).length, 1);
eq('pre-null zeros still counted as recorded zeros (no silent change)', ds3.daytime.measures[0].total, 0);

/* 5. duplicates and language: same-date events within 30 min are flagged, both still counted */
var incs = [{ id: 'i1', participant_id: C.id, incident_date: '2030-03-02', incident_time: '03:30', is_fall: true, fall_location: 'Bed', second_person_needed: false, minutes_on_floor: null, emergency: ['No'], injuries: 'No', incident_types: ['Medical concern'], shift_id: 'n2' }];
var nms = [{ id: 'm1', participant_id: C.id, nm_date: '2030-03-02', nm_time: '03:45', location: 'Bed', single_worker_capacity: true, equipment_factor: false, shift_id: 'n2' }];
var ds4 = M.evBuildDataset({ client: C, from: '2030-03-01', to: '2030-03-07', shifts: shifts, overnightLogs: overnight, incidents: incs, nearMisses: nms, careLogs: [], notes: [], sources: [], observations: [] });
eq('falls 1, near misses 1, both counted', [ds4.safety.falls, ds4.safety.nearMisses], [1, 1]);
eq('possible duplicate flagged', ds4.checks.filter(function(c){ return c.kind === 'possible duplicate'; }).length, 1);
eq('minutes on floor: not recorded → 0 recorded of 1 fall', [ds4.safety.floorMinutes, ds4.safety.floorRecorded], [0, 0]);
eq('bed location counts as transfer-related only via location list (documented rule)', ds4.safety.transferRelated, 2);
eq('weekly buckets cover the period', ds4.safety.weekly.length, 2);

/* 6. observations: only accepted, non-duplicate, non-excluded, in period */
var sources = [{ id: 's1', participant_id: C.id, kind: 'upload', excluded: false }, { id: 's2', participant_id: C.id, kind: 'upload', excluded: true, excluded_reason: 'training sample' }];
var obs = [
  { id: 'o1', participant_id: C.id, source_id: 's1', obs_date: '2030-03-02', start_time: '01:00', category: 'overnight_assist', status: 'accepted', timing: 'estimated', workers_involved: 1 },
  { id: 'o2', participant_id: C.id, source_id: 's1', obs_date: '2030-03-02', start_time: '03:30', category: 'overnight_assist', status: 'accepted', timing: 'estimated', workers_involved: 1 },
  { id: 'o3', participant_id: C.id, source_id: 's1', obs_date: '2030-03-02', start_time: '03:35', category: 'overnight_assist', status: 'accepted', duplicate_of: 'o2' },
  { id: 'o4', participant_id: C.id, source_id: 's2', obs_date: '2030-03-02', start_time: '02:00', category: 'overnight_assist', status: 'accepted' },
  { id: 'o5', participant_id: C.id, source_id: 's1', obs_date: '2030-03-02', start_time: '05:00', category: 'overnight_assist', status: 'proposed' },
  { id: 'o6', participant_id: C.id, source_id: 's1', obs_date: '2030-03-02', start_time: '04:00', category: 'overnight_assist', status: 'rejected' },
  { id: 'o7', participant_id: C.id, source_id: 's1', obs_date: '2030-03-02', start_time: '10:00', category: 'daytime_task', status: 'accepted', assist_type: 'Shower transfer', workers_involved: 2 }
];
var ds5 = M.evBuildDataset({ client: C, from: '2030-03-01', to: '2030-03-07', shifts: shifts, overnightLogs: overnight, incidents: [], nearMisses: [], careLogs: [], notes: [], sources: sources, observations: obs });
eq('accepted observations = 3 (o1, o2, o7); duplicate, excluded-source, proposed, rejected out', ds5.coverage.acceptedObservations, 3);
eq('timeline has 2 overnight events, in block', ds5.overnight.timeline.map(function(t){ return [t.start, t.inBlock]; }), [['01:00', true], ['03:30', true]]);
eq('reconcile check: summary says 1 wake, narrative shows 2 in-block events', ds5.checks.filter(function(c){ return c.kind === 'reconcile'; }).length, 1);
eq('unreviewed proposal listed as a check', ds5.checks.filter(function(c){ return c.kind === 'unreviewed'; }).length, 1);
eq('two-workers-actual counts observation with 2 workers', ds5.daytime.twoWorkersActual, 1);

/* 7. no records at all */
var ds6 = M.evBuildDataset({ client: C, from: '2030-04-01', to: '2030-04-30', shifts: [], overnightLogs: [], incidents: [], nearMisses: [], careLogs: [], notes: [], sources: [], observations: [] });
eq('empty period: nulls not zeros', [ds6.overnight.avgActive, ds6.overnight.rostered, ds6.daytime.measures[0].perDay], [null, 0, null]);

/* 8. candidate finder: deterministic, keeps quotes, shifts morning times to the next date on a sleepover narrative */
var cands = M.evFindCandidates('Tim went to bed at around 8:45pm. He woke at about 1:00am asking for wine and was resettled. He woke at about 3:30am wet and fell from the bed; the worker helped him up. Breakfast was at 6:00am.', '2030-03-02');
eq('two time-anchored support candidates found (breakfast has no support keyword; bed time has none)', cands.length, 2);
eq('1:00am overnight event dated the next morning', [cands[0].obs_date, cands[0].start_time, cands[0].category, cands[0].timing], ['2030-03-03', '01:00', 'overnight_assist', 'estimated']);
eq('fall sentence classified as incident, still proposed', [cands[1].category, cands[1].status], ['incident', 'proposed']);
eq('quote kept as source reference', /Sentence 2/.test(cands[0].source_ref), true);
eq('bare numbers are not times', M.evFindCandidates('He had 3 wines and 2 smokes and then fell asleep.', '2030-03-02').length, 0);

console.log(n - fails + '/' + n + ' passed');
process.exit(fails ? 1 : 0);
