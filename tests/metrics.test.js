/* Acceptance tests for the Summary analytics (metrics-v3) on SYNTHETIC fixtures only.
   Run: node tests/metrics.test.js   — numbering follows the brief's acceptance list. */
process.env.TZ = 'Australia/Melbourne';
var fs = require('fs'), path = require('path');
var M = require('../parts/p9a_metrics.js');
var fails = 0, n = 0;
function eq(name, got, want){ n++; var ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) { fails++; console.log('FAIL ' + name + '\n   got  ' + JSON.stringify(got) + '\n   want ' + JSON.stringify(want)); } else console.log('ok   ' + name); }
var C = { id: 'c-test', name: 'Test Participant (synthetic)' };
var NOW = '2030-03-20T12:00:00';
function shift(id, date, type){ return { id: id, client_id: C.id, date: date, type: type, start_t: type === 'sleepover' ? '18:00' : '09:00', end_t: type === 'sleepover' ? '09:00' : '18:00', worker_id: 'w1' }; }
function build(over){ var inp = { client: C, from: '2030-03-01', to: '2030-03-14', now: NOW, shifts: [], incidents: [], nearMisses: [], careLogs: [], overnightLogs: [], notes: [], sources: [], observations: [] }; Object.keys(over).forEach(function(k){ inp[k] = over[k]; }); return M.evBuildDataset(inp); }
var nights = []; for (var i = 1; i <= 14; i++) nights.push(shift('n' + i, '2030-03-' + (i < 10 ? '0' : '') + i, 'sleepover'));
var daysS = []; for (i = 1; i <= 14; i++) daysS.push(shift('d' + i, '2030-03-' + (i < 10 ? '0' : '') + i, 'day'));
var src = [{ id: 's1', participant_id: C.id, kind: 'upload', title: 'Synthetic PDF', excluded: false, sha256: 'aaa', created_at: '2030-03-15T00:00:00Z' }];

/* 1. an accepted imported fall appears once in the incident total and chronology */
var ds1 = build({ shifts: daysS, sources: src, observations: [{ id: 'o1', participant_id: C.id, source_id: 's1', obs_date: '2030-03-03', start_time: '10:00', category: 'incident', assist_type: 'Fall', outcome: 'no injury stated', status: 'accepted', timing: 'estimated' }] });
eq('1 accepted imported fall counts once', [ds1.incidents.n, ds1.incidents.falls, ds1.incidents.list.length, ds1.incidents.list[0].kind, ds1.metrics.falls.value], [1, 1, 1, 'observation', 1]);

/* 2. the same fall in a note, a PDF and an incident form counts once when linked; look-alikes are flagged, not merged */
var fallReport = { id: 'i1', participant_id: C.id, incident_date: '2030-03-03', incident_time: '10:00', is_fall: true, fall_location: 'Bathroom', during_transfer: true, incident_types: ['Injury'], emergency: ['No'], injuries: 'No', shift_id: 'd3' };
var ds2 = build({ shifts: daysS, incidents: [fallReport], sources: src, observations: [
  { id: 'o-note', participant_id: C.id, source_id: 's1', obs_date: '2030-03-03', start_time: '10:05', category: 'incident', assist_type: 'Fall', status: 'accepted', duplicate_of_record: 'i1' },
  { id: 'o-pdf', participant_id: C.id, source_id: 's1', obs_date: '2030-03-03', start_time: '10:00', category: 'incident', assist_type: 'Fall', status: 'accepted', duplicate_of: 'o-note' } ] });
eq('2a linked repeats: one incident, three sources on it', [ds2.incidents.n, ds2.incidents.falls, ds2.incidents.list[0].sources.length], [1, 1, 2]);
var ds2b = build({ shifts: daysS, incidents: [fallReport], sources: src, observations: [{ id: 'o-x', participant_id: C.id, source_id: 's1', obs_date: '2030-03-03', start_time: '10:10', category: 'incident', assist_type: 'Fall', status: 'accepted' }] });
eq('2b unlinked look-alike: both counted, flagged for review, never merged', [ds2b.incidents.n, ds2b.checks.filter(function(c){ return c.kind === 'possible duplicate'; }).length], [2, 1]);

/* 3 + 4. accepted overnight intervals contribute to the duration measure; overlaps are merged, not added */
var ds3 = build({ shifts: nights, sources: src, observations: [
  { id: 'a', participant_id: C.id, source_id: 's1', obs_date: '2030-03-04', start_time: '01:00', end_time: '02:00', category: 'overnight_assist', assist_type: 'Continence', status: 'accepted' },
  { id: 'b', participant_id: C.id, source_id: 's1', obs_date: '2030-03-04', start_time: '01:30', end_time: '02:30', category: 'overnight_assist', assist_type: 'Transfer', status: 'accepted' },
  { id: 'c', participant_id: C.id, source_id: 's1', obs_date: '2030-03-04', start_time: '04:00', end_time: '05:00', category: 'overnight_assist', assist_type: 'Continence', status: 'accepted' } ] });
var r3 = ds3.overnight.rows.filter(function(r){ return r.date === '2030-03-03'; })[0];
eq('3 intervals after midnight join the night of the 3rd and give a duration', [r3.status, r3.assistBasis, r3.assistHours], ['partial', 'observations', 2.5]);
eq('4 overlapping 01:00–02:00 and 01:30–02:30 merge to 1.5 h, not 2 h', M.evMergeMinutes([[60, 120], [90, 150]]), 90);
eq('4b episodes: overlapping starts collapse, separate ones count', r3.observed.episodes, 2);
eq('3b partial night counted in the average with its recorded hours, summary nights preferred', [ds3.overnight.avgAssist.n, ds3.overnight.avgAssist.hours, ds3.overnight.avgAssist.fromSummary], [1, 2.5, 0]);

/* 5 + 6. partial stays partial; a missing night is not zero assistance */
var ds5 = build({ shifts: nights, overnightLogs: [
  { id: 'l1', shift_id: 'n2', bed_time: '21:00', wake_time: '05:00', wakes: 1, asleep_hours: 6, active_hours: 1.5, created_at: '2030-03-03T10:00:00Z' },
  { id: 'l2', shift_id: 'n5', bed_time: '21:00', wake_time: null, wakes: null, asleep_hours: null, active_hours: null, created_at: '2030-03-06T10:00:00Z' } ] });
eq('5 a summary without hours is partial and excluded from the average', [ds5.overnight.rows[4].status, ds5.overnight.rows[4].assistHours, ds5.overnight.avgAssist.n], ['partial', null, 1]);
eq('6 a missing night is status missing with null assistance, and the average ignores it', [ds5.overnight.rows[0].status, ds5.overnight.rows[0].assistHours, ds5.overnight.avgAssist.hours, ds5.overnight.missing], ['missing', null, 1.5, 12]);
eq('6b nights not yet finished are not "not recorded"', build({ shifts: nights.concat([shift('n99', '2030-03-14', 'sleepover')]), now: '2030-03-14T20:00:00' }).overnight.notYet >= 1, true);

/* 7. an unanswered care measure is not zero */
var ds7 = build({ shifts: daysS, careLogs: [{ id: 'c1', shift_id: 'd1', pad_wet: 3, pad_bowel: null, transfers: null, shower_offered: true, shower_done: true, created_at: '2030-03-01T20:00:00Z' }, { id: 'c2', shift_id: 'd2', pad_wet: null, pad_bowel: null, transfers: null, shower_offered: false, created_at: '2030-03-02T20:00:00Z' }] });
eq('7 blank pad_bowel: total null (not 0), recorded 0 of 2', [ds7.care.measures[1].total, ds7.care.measures[1].recorded, ds7.care.measures[1].perDay], [null, 0, null]);
eq('7b transfers unanswered everywhere → metric is not recorded', ds7.metrics.transfers.value, null);
eq('7c per-day divides by days with the measure recorded (1), not days with a log (2)', [ds7.care.measures[0].perDay, ds7.care.measures[0].days], [3, 1]);

/* 8. an incomplete shower record is not a refusal */
var ds8 = build({ shifts: daysS, careLogs: [{ id: 'c3', shift_id: 'd3', shower_offered: true, shower_done: null, pad_wet: 1, transfers: 4, created_at: '2030-03-03T20:00:00Z' }, { id: 'c4', shift_id: 'd4', shower_offered: true, shower_done: false, pad_wet: 1, transfers: 4, created_at: '2030-03-04T20:00:00Z' }] });
eq('8 offered + unanswered = outcome not recorded; offered + false = declined', [ds8.care.showers.offered, ds8.care.showers.done, ds8.care.showers.declined, ds8.care.showers.outcomeNotRecorded], [2, 0, 1, 1]);

/* 9 + 10. daytime activities stay on their date; after-midnight overnight events join the previous night */
var cands = M.evFindCandidates('At 10:30am the worker assisted the participant to the toilet. At about 1:00am he woke wet and was changed. At 3:15pm he did not fall while transferring to the car.', { baseDate: '2030-03-03', overnight: true });
eq('9 daytime toilet assistance on a sleepover narrative is a daytime task on the same date', [cands[0].category, cands[0].obs_date, cands[0].start_time], ['daytime_task', '2030-03-03', '10:30']);
eq('10 the 1:00am wet change is overnight assistance dated the next morning (night of the 3rd)', [cands[1].category, cands[1].obs_date, M.evNightOf({ category: 'overnight_assist', obs_date: cands[1].obs_date, start_time: cands[1].start_time })], ['overnight_assist', '2030-03-04', '2030-03-03']);
eq('12 explicit negation is not inverted: "did not fall" is not a fall', cands.filter(function(c){ return c.category === 'incident'; }).length, 0);
eq('12b the negated sentence still yields its real activity (transfer)', [cands[2].category, cands[2].assist_type], ['daytime_task', 'Transfer']);
var cd = M.evFindCandidates('At 10:30am the worker assisted the participant to the toilet. At 2:00am he woke.', { baseDate: '2030-03-03', overnight: false });
eq('9b on a day-shift narrative nothing is overnight and no date shifts', cd.map(function(c){ return [c.category, c.obs_date]; }), [['daytime_task', '2030-03-03']]);
eq('9c no staffing is ever inferred from prose', M.evFindCandidates('At 4:30pm he fell and the ambulance came; no second worker attended.', { baseDate: '2030-03-03' })[0].workers_involved, null);

/* 11. reporting boundary: a 03:30 event on to+1 belongs to the last night of the period */
var ds11 = build({ shifts: nights, sources: src, observations: [{ id: 'e', participant_id: C.id, source_id: 's1', obs_date: '2030-03-15', start_time: '03:30', end_time: '04:00', category: 'overnight_assist', assist_type: 'Continence', status: 'accepted' }] });
eq('11 next-morning event counted for the night of the 14th', [ds11.overnight.rows[13].assistHours, ds11.overnight.timeline[0].night], [0.5, '2030-03-14']);

/* 13. unknown injury status remains unknown */
var ds13 = build({ shifts: daysS, incidents: [
  { id: 'i2', participant_id: C.id, incident_date: '2030-03-05', incident_time: '11:00', is_fall: false, incident_types: ['Medical concern'], emergency: ['Ambulance'], injuries: null, shift_id: 'd5' },
  { id: 'i3', participant_id: C.id, incident_date: '2030-03-06', incident_time: '11:00', is_fall: true, fall_location: 'Bed', incident_types: ['Injury'], emergency: ['No'], injuries: 'No', shift_id: 'd6' } ] });
eq('13 null injuries → unknown; "No" → no; neither becomes the other', [ds13.incidents.injuriesUnknown, ds13.incidents.injuriesNo, ds13.incidents.injuriesYes, ds13.incidents.list[0].injuries], [1, 1, 0, 'unknown']);
eq('13b emergency metric counts incidents involving a call, not calls', [ds13.incidents.emergencyInvolved, ds13.metrics.emergency.unit], [1, 'incidents involving an emergency call']);
eq('13c a fall in bed with no transfer answer is "inferred", never "yes"', ds13.incidents.list[1].transfer, 'inferred');

/* 14. counts, units and denominators match between dashboard and export */
var ex = M.evExportModel(ds13);
eq('14 export metrics come from the same dataset values', [ex.metrics[0].value, ex.metrics[0].note, ex.metrics[3].value], [ds13.metrics.falls.value, ds13.metrics.falls.note, ds13.metrics.emergency.value]);

/* 15. long periods: weekly buckets cover the whole range, nothing dropped */
var longShifts = []; for (i = 0; i < 120; i++) longShifts.push(shift('L' + i, M.evNightOf({ obs_date: '2029-11-01' }) && require('../parts/p9a_metrics.js') && addD('2029-11-01', i), 'day'));
function addD(d, k){ var p = d.split('-'); var dt = new Date(+p[0], +p[1] - 1, +p[2] + k); return dt.getFullYear() + '-' + (dt.getMonth() < 9 ? '0' : '') + (dt.getMonth() + 1) + '-' + (dt.getDate() < 10 ? '0' : '') + dt.getDate(); }
var ds15 = M.evBuildDataset({ client: C, from: '2029-11-01', to: '2030-02-28', now: NOW, shifts: longShifts, incidents: [], nearMisses: [], careLogs: [], overnightLogs: [], notes: [], sources: [], observations: [] });
eq('15 120 shifts over 4 months: all in scope, weekly buckets span the period', [ds15.coverage.shifts.rostered, ds15.series.mode, ds15.series.buckets.length >= 17, ds15.series.buckets.reduce(function(a, b){ return a + b.shifts; }, 0)], [120, 'week', true, 120]);

/* 16. a finalised dataset does not change when sources are added later (the export reads only the dataset) */
var inp16 = { client: C, from: '2030-03-01', to: '2030-03-14', now: NOW, shifts: daysS, incidents: [fallReport], nearMisses: [], careLogs: [], overnightLogs: [], notes: [], sources: src.slice(), observations: [] };
var frozen = JSON.stringify(M.evBuildDataset(inp16));
inp16.sources.push({ id: 's2', participant_id: C.id, kind: 'upload', title: 'Later upload', excluded: false, sha256: 'bbb' });
inp16.observations.push({ id: 'late', participant_id: C.id, source_id: 's2', obs_date: '2030-03-07', start_time: '10:00', category: 'incident', assist_type: 'Fall', status: 'accepted' });
var later = M.evBuildDataset(inp16);
var frozenObj = JSON.parse(frozen);
eq('16 frozen source index has 1 source and 1 fall; live now has 2 and 2; export of the frozen model is unchanged', [frozenObj.sourceIndex.length, frozenObj.incidents.falls, later.sourceIndex.length, later.incidents.falls, M.evExportModel(frozenObj).metrics[0].value], [1, 1, 2, 2, 1]);

/* 17. nothing in the current Summary / export / roster code recommends two-worker care */
var banned = /\b2:1\b|two workers|second worker|2nd person|twoWorkers|secondPerson|single_worker_capacity|proposed staffing|clinician recommend/i;
['parts/p9a_metrics.js', 'parts/p9b_summary.js', 'parts/p10_export.js', 'parts/p7_roster.js'].forEach(function(f){
  var t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8').split('\n').filter(function(l){ return !/^\s*(\/\*|\*|\/\/)/.test(l); }).join('\n');
  eq('17 no two-worker wording in ' + f, (t.match(banned) || [null])[0], null);
});

/* 18. the shift-note template is unchanged (independent of check_template.js) */
var base = JSON.parse(fs.readFileSync(path.join(__dirname, 'template_baseline.json'), 'utf8'));
var core = fs.readFileSync(path.join(__dirname, '..', 'parts', 'p2_core.js'), 'utf8');
var tplStart = core.indexOf('var NOTE_TEMPLATE = ['); var tplEnd = core.indexOf("].join('\\n');", tplStart);
var tplArr = new Function('return ' + core.slice(core.indexOf('[', tplStart), tplEnd + 1))();
eq('18 template text identical to the classic baseline', tplArr.join('\n') === base.template, true);

/* 19. overnight splitting produces correct dates */
eq('19 Mon 18:00–09:00 split at 03:00 → second segment on Tuesday', M.evSplitSegmentDate('2030-03-04', '18:00', '09:00', '03:00'), '2030-03-05');
eq('19b same shift split at 22:00 → still Monday', M.evSplitSegmentDate('2030-03-04', '18:00', '09:00', '22:00'), '2030-03-04');
eq('19c a day shift split at 13:00 → same day; a split outside the shift is rejected', [M.evSplitSegmentDate('2030-03-04', '09:00', '18:00', '13:00'), M.evSplitSegmentDate('2030-03-04', '09:00', '18:00', '20:00')], ['2030-03-04', null]);

/* 20. the demonstration dataset contains no real participant data */
var demo = M.evDemoDataset('2030-05-01', '2030-05-28');
var realIds = ['aaaa3333', 'Tim', 'Allan', 'Nick', 'Weir Views', 'Bundoora', 'Ivanhoe'];
var blob = JSON.stringify(demo);
eq('20 demo participant is synthetic and no real name/address/id appears', [demo.client.id, realIds.filter(function(x){ return blob.indexOf(x) >= 0; })], ['demo-participant', []]);
eq('20b demo builds a full dataset with all record kinds', (function(){ var d = M.evBuildDataset(Object.assign({ from: '2030-05-01', to: '2030-05-28', tz: 'Australia/Melbourne' }, demo)); return [d.coverage.shifts.rostered > 0, d.overnight.inScope > 0, d.incidents.n >= 0, d.care.logs > 0]; })(), [true, true, true, true]);

/* extra: daylight-saving night length is taken from the clock, not assumed to be 8 */
eq('DST spring-forward night (4 Oct 2026, Melbourne) has a 7 h window; an ordinary night 8 h', [M.evBlockHours('2026-10-03'), M.evBlockHours('2026-09-15')], [7, 8]);
var dsDst = build({ from: '2026-10-01', to: '2026-10-05', shifts: [shift('x', '2026-10-03', 'sleepover')], overnightLogs: [{ id: 'lx', shift_id: 'x', asleep_hours: 5, active_hours: 1, wakes: 0, bed_time: '21:00', wake_time: '06:00', created_at: '2026-10-04T10:00:00Z' }], now: '2026-10-10T00:00:00' });
eq('awake-without-assistance uses the real 7 h window on the DST night', dsDst.overnight.rows[0].awakeNoAssist, 1);

console.log(n - fails + '/' + n + ' passed');
process.exit(fails ? 1 : 0);
