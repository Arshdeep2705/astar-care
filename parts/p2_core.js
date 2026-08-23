'use strict';
/* ================= config ================= */
var SB_URL = 'https://pbiafthhnvvpxaxcvaso.supabase.co';
var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBiaWFmdGhobnZ2cHhheGN2YXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NjUwNzgsImV4cCI6MjEwMzA0MTA3OH0.CgGhHsay9lkyHkmaM5pB4eah8auXOv70KtzXUEl_010';
var ADMIN_PIN = '9999';
var BUCKET = 'ac-files';
var MAX_FILE = 15 * 1024 * 1024;
/* Which portal is this page? /admin serves the admin portal, everything else the worker portal. */
var PORTAL = /(^|\/)admin(\/|$)/.test(location.pathname) ? 'admin' : 'worker';
var VAPID_PUBLIC = 'BHILHZ1Fyu5QC3AFoqhBVYYWrfgLd6LxmSv813-Zw3xDDiFJHneLuUl5AWz4al3BB0in_NY8_eQfoQa4DXym1hI';

var NOTE_TEMPLATE = [
'**SHIFT SUMMARY (Give a brief summary of things that happened during the shift)**','','',
'**APPOINTMENTS (List any appointments attended during the shift, times, who the appointment was with, what it was for, and the support you provided during the appointment)**','','',
'**COMMUNITY ACTIVITIES (List any community activities the participant attended during the shift including what the activity was, the location and the times, and the support you provided during the activity)**','','',
'**CHALLENGING BEHAVIOURS (Please note any challenging behaviours the Participant displayed during the shift. Include triggers and the responses you provided)**','','',
'**MEDICATION (Note all medications the Participant took during the shift. Include the times taken, if ingestion was witnessed)**','','',
"**Medication Refusal (Did the Participant refuse medication at all during this shift. If 'yes', please note what medication was refused and any details. If 'no' please just write no)**",'','',
'**FOOD INTAKE (List any food the Participant ate during the shift and approx. times)**','','',
'**PERSONAL CARE (Note any personal care activities the Participant was supported with during the shift)**','','',
"**FOR ACTIVE NIGHTS ONLY (What time did the participant go to sleep, details of any support needed during night and any other observations. If this shift was not active night write 'no')**",'','',
'**WERE THERE ANY INCIDENTS DURING THE SHIFT (Provide a brief summary and complete an incident report within 24 hours)**','','',
'**ADDITIONAL NOTES**','',''
].join('\n');

var NOTE_TYPES = ['Progress Notes','Enquiry','Feedback','Incident','Injury','Mileage'];

/* ================= tiny DOM helper ================= */
function el(tag, attrs, kids) {
  var n = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'style') n.style.cssText = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.slice(0,2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'multiple') { if (attrs[k]) n[k] = true; }
    else if (k === 'value') n.value = attrs[k];
    else n.setAttribute(k, attrs[k]);
  }
  if (kids != null) appendKids(n, kids);
  return n;
}
function appendKids(n, kids) {
  if (!Array.isArray(kids)) kids = [kids];
  for (var i = 0; i < kids.length; i++) {
    var c = kids[i];
    if (c == null || c === false) continue;
    if (Array.isArray(c)) { appendKids(n, c); continue; }
    n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}
function svgIcon(paths, vb) {
  var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', vb || '0 0 24 24');
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = paths;
  return s;
}
var IC = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  note: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alert: '<path d="M12 3 2.5 20h19z"/><path d="M12 9.5v4.5M12 17.5v.3"/>',
  check: '<path d="M4.5 12.5 10 18 19.5 6.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  left: '<path d="M14.5 5 8 12l6.5 7"/>',
  right: '<path d="M9.5 5 16 12l-6.5 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  pin: '<path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.8-3.8 3.9-6 7.5-6s6.7 2.2 7.5 6"/>',
  users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.7-3.3 3.4-5.2 6.5-5.2s5.8 1.9 6.5 5.2"/><path d="M15.5 5.5a3.5 3.5 0 0 1 0 6.4M17.5 14.9c2.1.7 3.6 2.3 4 5.1"/>',
  grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  inbox: '<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 4h14l2 9v7H3v-7z"/>',
  pay: '<rect x="2.5" y="6" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 15h4"/>',
  send: '<path d="m3 11 18-7-7 18-2.5-7.5z"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  bell: '<path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="m14 7 3 3"/>',
  eye: '<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
  out: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="m10 7-5 5 5 5M5 12h11"/>'
};

/* ================= dates ================= */
var DOW = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
var DOW3 = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var MON = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var MON3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function pad2(n){ return (n < 10 ? '0' : '') + n; }
function ymd(d){ return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); }
function pd(s){ var p = s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function todayYmd(){ return ymd(new Date()); }
function addDays(s, n){ var d = pd(s); d.setDate(d.getDate() + n); return ymd(d); }
function dow(s){ return pd(s).getDay(); }
function mondayOf(s){ var d = pd(s); var off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return ymd(d); }
function fmtDate(s){ var d = pd(s); return DOW3[d.getDay()] + ' ' + d.getDate() + ' ' + MON3[d.getMonth()]; }
function fmtDateFull(s){ var d = pd(s); return DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }
function fmtDM(s){ var d = pd(s); return pad2(d.getDate()) + '/' + pad2(d.getMonth()+1); }
function fmtTime(t){ // '15:30' -> '3:30pm'
  var p = t.split(':'), h = +p[0], m = +p[1];
  var ap = h >= 12 ? 'pm' : 'am'; var h12 = h % 12; if (h12 === 0) h12 = 12;
  return h12 + (m ? ':' + pad2(m) : '') + ap;
}
function fmtRange(a, b){ return fmtTime(a) + ' – ' + fmtTime(b); }
function tMin(t){ var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); }
function shiftHours(s){
  var a = tMin(s.start_t), b = tMin(s.end_t);
  var mins = b > a ? b - a : (1440 - a) + b;
  return mins / 60;
}
function shiftStartDate(s){ // Date obj of shift start
  var d = pd(s.date), p = s.start_t.split(':');
  d.setHours(+p[0], +p[1], 0, 0); return d;
}
function shiftEndDate(s){
  var d = pd(s.date), p = s.end_t.split(':');
  var cross = tMin(s.end_t) <= tMin(s.start_t);
  d.setHours(+p[0], +p[1], 0, 0);
  if (cross) d.setDate(d.getDate() + 1);
  return d;
}
function fmtDT(iso){
  var d = new Date(iso);
  return DOW3[d.getDay()] + ' ' + d.getDate() + ' ' + MON3[d.getMonth()] + ', ' + fmtTime(pad2(d.getHours()) + ':' + pad2(d.getMinutes()));
}
function hrsFmt(h){ return (Math.round(h * 100) / 100).toLocaleString('en-AU', {maximumFractionDigits: 2}); }
function money(n){ return '$' + (Math.round(n * 100) / 100).toLocaleString('en-AU', {minimumFractionDigits: 2, maximumFractionDigits: 2}); }

function haversine(lat1, lng1, lat2, lng2) {
  var R = 6371000, rad = Math.PI / 180;
  var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1*rad) * Math.cos(lat2*rad) * Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* ================= Supabase fetch wrappers ================= */
function sbHeaders(extra) {
  var h = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' };
  if (extra) for (var k in extra) h[k] = extra[k];
  return h;
}
function sbFetch(path, opts) {
  opts = opts || {};
  return fetch(SB_URL + path, {
    method: opts.method || 'GET',
    headers: sbHeaders(opts.headers),
    body: opts.body != null ? JSON.stringify(opts.body) : undefined
  }).then(function(res){
    if (res.status === 204) return null;
    return res.text().then(function(txt){
      var j = null; try { j = txt ? JSON.parse(txt) : null; } catch(e){}
      if (!res.ok) {
        var msg = (j && (j.message || j.msg || j.error_description || j.error)) || ('Request failed (' + res.status + ')');
        var err = new Error(msg); err.status = res.status; err.body = j; throw err;
      }
      return j;
    });
  });
}
function sbSel(table, query){ return sbFetch('/rest/v1/' + table + '?' + (query || 'select=*')); }
function sbIns(table, rows){
  return sbFetch('/rest/v1/' + table, { method:'POST', body: rows, headers: {'Prefer':'return=representation'} });
}
function sbUpd(table, query, patch){
  return sbFetch('/rest/v1/' + table + '?' + query, { method:'PATCH', body: patch, headers: {'Prefer':'return=representation'} });
}
function sbDel(table, query){
  return sbFetch('/rest/v1/' + table + '?' + query, { method:'DELETE' });
}
function sbRpc(name, args){
  return sbFetch('/rest/v1/rpc/' + name, { method:'POST', body: args || {} });
}
function sbUpsert(table, rows, onConflict){
  return sbFetch('/rest/v1/' + table + (onConflict ? '?on_conflict=' + onConflict : ''), {
    method:'POST', body: rows, headers: {'Prefer':'return=representation,resolution=merge-duplicates'}
  });
}
/* auth */
function sbLogin(email, password){
  return sbFetch('/auth/v1/token?grant_type=password', { method:'POST', body:{ email: email, password: password } });
}
function sbSetPassword(token, newPass){
  return fetch(SB_URL + '/auth/v1/user', {
    method:'PUT',
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type':'application/json' },
    body: JSON.stringify({ password: newPass })
  }).then(function(res){ return res.json().then(function(j){ if(!res.ok){ throw new Error(j.msg || j.message || 'Could not update password'); } return j; }); });
}
function sbSignup(email, password){
  return sbFetch('/auth/v1/signup', { method:'POST', body:{ email: email, password: password } });
}
function sbRecover(email){
  return sbFetch('/auth/v1/recover', { method:'POST', body:{ email: email } });
}
/* storage */
function storageUpload(path, file){
  return fetch(SB_URL + '/storage/v1/object/' + BUCKET + '/' + path, {
    method:'POST',
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' },
    body: file
  }).then(function(res){ return res.text().then(function(t){ if(!res.ok){ var j=null; try{j=JSON.parse(t)}catch(e){}; throw new Error((j&&(j.message||j.error))||'Upload failed'); } return path; }); });
}
function storageSignedUrl(path){
  return sbFetch('/storage/v1/object/sign/' + BUCKET + '/' + path, { method:'POST', body:{ expiresIn: 3600 } })
    .then(function(j){ return SB_URL + '/storage/v1' + j.signedURL; });
}
function storageDelete(paths){
  return sbFetch('/storage/v1/object/' + BUCKET, { method:'DELETE', body: { prefixes: paths } })["catch"](function(){ return null; });
}

/* ================= state ================= */
var state = {
  auth: null,           // {mode:'admin'} | {mode:'worker', workerId, token, refresh}
  signinMode: PORTAL,   // fixed per portal: 'worker' | 'admin'
  pin: '',
  view: 'home',
  adminTab: 'roster',
  preview: null,        // worker id when admin previews worker view
  cal: { mode: 'month', anchor: todayYmd() },
  roster: { range: 'week', anchor: mondayOf(todayYmd()), client: 'all' },
  pay: { anchor: null },
  loading: true,
  loadErr: null,
  pwChange: null,       // {token, workerId, name} during forced password change
  data: { settings:null, clients:[], reqs:[], workers:[], shifts:[], notes:[], incidents:[], reminders:[], flags:[], avail:[], clocks:[], invoices:[], enums:{} }
};
var ui = {};            // scratch for modal state

function saveSession(){
  try { localStorage.setItem('ac_session', JSON.stringify(state.auth)); } catch(e){}
}
function loadSession(){
  try { var s = localStorage.getItem('ac_session'); return s ? JSON.parse(s) : null; } catch(e){ return null; }
}
function clearSession(){ try { localStorage.removeItem('ac_session'); } catch(e){} }

/* ================= data loading ================= */
function loadAll(){
  state.loading = true; state.loadErr = null;
  var D = state.data;
  if (!state.win) state.win = { from: addDays(mondayOf(todayYmd()), -182), to: addDays(mondayOf(todayYmd()), 182) };
  var from = state.win.from, to = state.win.to;
  return Promise.all([
    sbSel('ac_settings', 'select=*&id=eq.1'),
    sbSel('ac_clients', 'select=*&order=name'),
    sbSel('ac_reqs', 'select=*&active=is.true&order=start_t'),
    sbSel('ac_workers', 'select=*&order=name'),
    sbSel('ac_shifts', 'select=*&date=gte.' + from + '&date=lte.' + to + '&order=date'),
    sbSel('ac_note_entries', 'select=*&order=created_at.desc&limit=2000'),
    sbSel('ac_incident_forms', 'select=*&order=created_at.desc&limit=1000'),
    sbSel('ac_reminders', 'select=*&order=created_at.desc&limit=500'),
    sbSel('ac_flags', 'select=*&order=created_at.desc&limit=100'),
    sbSel('ac_availability', 'select=*'),
    sbSel('ac_clock', 'select=*&order=at'),
    sbSel('ac_invoices', 'select=*'),
    sbSel('ac_enums', 'select=*')
  ]).then(function(r){
    D.settings = r[0][0] || { org_name:'Astar Health Service', km_rate:0.99, week_anchor: mondayOf(todayYmd()), fortnight_anchor: mondayOf(todayYmd()) };
    D.clients = r[1]; D.reqs = r[2]; D.workers = r[3]; D.shifts = r[4];
    D.notes = r[5]; D.incidents = r[6]; D.reminders = r[7]; D.flags = r[8];
    D.avail = r[9]; D.clocks = r[10]; D.invoices = r[11];
    D.enums = {};
    (r[12] || []).forEach(function(e){ D.enums[e.name] = e.values; });
    state.loading = false;
    if (state.auth) startRealtime();
  })["catch"](function(e){
    state.loading = false; state.loadErr = e.message || 'Could not load data';
  });
}
function refresh(){ return loadAll().then(render); }
/* widen the loaded shift window when navigation leaves it */
function ensureWindow(dateStr){
  var w = state.win;
  if (!w || !dateStr) return;
  if (dateStr >= addDays(w.from, 14) && dateStr <= addDays(w.to, -14)) return;
  if (addDays(dateStr, -182) < w.from) w.from = addDays(dateStr, -182);
  if (addDays(dateStr, 182) > w.to) w.to = addDays(dateStr, 182);
  refresh();
}

/* lookups */
function clientById(id){ return state.data.clients.find(function(c){ return c.id === id; }); }
function workerById(id){ return state.data.workers.find(function(w){ return w.id === id; }); }
function shiftById(id){ return state.data.shifts.find(function(s){ return s.id === id; }); }
function notesForShift(id){ return state.data.notes.filter(function(n){ return n.shift_id === id; }); }
function incidentsForShift(id){ return state.data.incidents.filter(function(n){ return n.shift_id === id; }); }
function clocksForShift(id){ return state.data.clocks.filter(function(c){ return c.shift_id === id; }); }
function remindersForShift(id){ return state.data.reminders.filter(function(r){ return r.shift_id === id; }); }
function me(){
  if (state.preview) return workerById(state.preview);
  return state.auth && state.auth.mode === 'worker' ? workerById(state.auth.workerId) : workerById(state.auth && state.auth.workerId);
}
function isAdmin(){ return state.auth && state.auth.mode === 'admin'; }
function initials(name){ return name.split(/\s+/).map(function(p){ return p[0]; }).join('').slice(0,2).toUpperCase(); }
function firstName(name){ return (name || '').split(/\s+/)[0]; }

/* shift ended? */
function shiftEnded(s){ return shiftEndDate(s).getTime() < Date.now(); }
function shiftIsToday(s){
  var t = todayYmd();
  if (s.date === t) return true;
  // overnight shift that started yesterday and is still running
  if (s.date === addDays(t, -1) && tMin(s.end_t) <= tMin(s.start_t) && tMin(s.end_t) > 0) return true;
  return false;
}

/* ================= live updates (Supabase Realtime) ================= */
/* Any change another device saves shows up here within a second or two.
   Never refreshes over an open modal or while the user is typing —
   those refreshes wait until the modal closes / focus leaves the field. */
var rt = { ws: null, hb: null, timer: null, poll: null, pending: false };
function liveGuarded(){
  var ae = document.activeElement;
  return document.getElementById('ac-modal') || document.getElementById('ac-confirm') ||
    (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.tagName === 'SELECT'));
}
function liveRefresh(){
  if (!state.auth || state.loading) return;
  if (liveGuarded()) { rt.pending = true; return; }
  rt.pending = false;
  loadAll().then(function(){
    if (liveGuarded()) { rt.pending = true; return; }
    render();
  });
}
function scheduleLive(){ clearTimeout(rt.timer); rt.timer = setTimeout(liveRefresh, 700); }
function startRealtime(){
  if (!rt.poll) {
    rt.poll = setInterval(scheduleLive, 60000);  // fallback if the socket ever drops
    document.addEventListener('visibilitychange', function(){ if (!document.hidden) scheduleLive(); });
  }
  if (rt.ws || !window.WebSocket) return;
  try {
    var ws = new WebSocket(SB_URL.replace('https://', 'wss://') + '/realtime/v1/websocket?apikey=' + SB_KEY + '&vsn=1.0.0');
    rt.ws = ws;
    ws.onopen = function(){
      ws.send(JSON.stringify({ topic: 'realtime:ac-live', event: 'phx_join', ref: '1',
        payload: { config: { postgres_changes: [{ event: '*', schema: 'public' }] } } }));
      rt.hb = setInterval(function(){
        try { ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', ref: 'hb', payload: {} })); } catch (e) {}
      }, 25000);
    };
    ws.onmessage = function(ev){
      try {
        var m = JSON.parse(ev.data);
        if (m.event === 'postgres_changes') scheduleLive();
      } catch (e) {}
    };
    ws.onclose = function(){
      clearInterval(rt.hb); rt.ws = null;
      if (state.auth) setTimeout(startRealtime, 5000);
    };
    ws.onerror = function(){ try { ws.close(); } catch (e) {} };
  } catch (e) { rt.ws = null; }
}
function stopRealtime(){
  rt.pending = false;
  if (rt.ws) { var w = rt.ws; rt.ws = null; try { w.onclose = null; w.close(); } catch (e) {} }
  clearInterval(rt.hb);
}

/* ================= push notifications ================= */
function pushSupported(){ return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
function pushEnabled(){
  return pushSupported() && Notification.permission === 'granted' && localStorage.getItem('ac_push_on') === '1';
}
function urlB64ToU8(s){
  var pad = '='.repeat((4 - s.length % 4) % 4);
  var b = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(b), arr = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
function adminIds(){
  return state.data.workers.filter(function(w){ return w.is_admin; }).map(function(w){ return w.id; });
}
function myPushWorkerId(){
  if (state.auth && state.auth.mode === 'worker') return state.auth.workerId;
  var a = state.data.workers.find(function(w){ return w.is_admin; });
  return a ? a.id : null;
}
function enablePush(){
  if (!pushSupported()) {
    var ios = /iPhone|iPad/.test(navigator.userAgent);
    toast(ios ? 'On iPhone: first add Astar Care to your Home Screen (Share → Add to Home Screen), then open it from there and try again.'
              : 'Notifications are not supported in this browser.', true);
    return Promise.resolve(false);
  }
  return Notification.requestPermission().then(function(perm){
    if (perm !== 'granted') { toast('Notifications were blocked — allow them in your browser settings to get reminders.', true); return false; }
    return navigator.serviceWorker.register('/sw.js')
      .then(function(){ return navigator.serviceWorker.ready; })
      .then(function(reg){
        return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToU8(VAPID_PUBLIC) });
      })
      .then(function(sub){
        var wid = myPushWorkerId();
        if (!wid) throw new Error('No worker record for this session.');
        return sbUpsert('ac_push_subs', [{ worker_id: wid, endpoint: sub.endpoint, sub: sub.toJSON() }], 'endpoint');
      })
      .then(function(){
        localStorage.setItem('ac_push_on', '1');
        toast('Notifications are on for this device');
        // prove it end-to-end: this device gets a confirmation push right away
        sendPush([myPushWorkerId()], 'Notifications are on', "You'll get Astar Care messages like this on this device.");
        render();
        return true;
      });
  })["catch"](function(e){ toast('Could not turn on notifications: ' + e.message, true); return false; });
}
/* fire-and-forget: never block the action on the notification */
function sendPush(workerIds, title, body){
  if (!workerIds || !workerIds.length) return Promise.resolve(null);
  return sbFetch('/functions/v1/push', { method: 'POST', body: { worker_ids: workerIds, title: title, body: (body || '').slice(0, 240), url: '/' } })
    ["catch"](function(){ return null; });
}

/* ================= toasts & confirm ================= */
function toast(msg, isErr){
  var t = el('div', { 'class': 'toast' + (isErr ? ' err' : '') }, msg);
  document.getElementById('toasts').appendChild(t);
  setTimeout(function(){ t.style.transition = 'opacity .25s'; t.style.opacity = '0';
    setTimeout(function(){ t.remove(); }, 260); }, 2600);
}
function closeModal(){
  var m = document.getElementById('ac-modal');
  if (m) m.remove();
  document.body.style.overflow = '';
  if (rt.pending) scheduleLive();
}
function openModal(node, opts){
  closeModal();
  opts = opts || {};
  var scrim = el('div', { 'class': 'scrim', id: 'ac-modal', onclick: function(e){ if (e.target === scrim && !opts.noDismiss) closeModal(); } }, node);
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';
}
/* confirm stacks ON TOP of any open modal so Cancel never destroys an editor */
function confirmDlg(title, body, okLabel, cb, danger){
  var old = document.getElementById('ac-confirm');
  if (old) old.remove();
  function closeConfirm(){ var c = document.getElementById('ac-confirm'); if (c) c.remove(); if (!document.getElementById('ac-modal')) document.body.style.overflow = ''; }
  var m = el('div', { 'class': 'modal', style: 'max-width:400px' }, [
    el('div', { 'class': 'sheet-grab' }),
    el('div', { 'class': 'modal-head' }, el('div', { 'class': 't-title' }, title)),
    el('div', { 'class': 'modal-body' }, el('p', { 'class': 't-mut', style: 'font-size:14px' }, body)),
    el('div', { 'class': 'modal-foot' }, [
      el('div', { 'class': 'spacer' }),
      el('button', { 'class': 'btn btn-ghost', onclick: closeConfirm }, 'Cancel'),
      el('button', { 'class': 'btn ' + (danger ? 'btn-dark' : 'btn-pri'), style: danger ? 'background:var(--bad)' : '', onclick: function(){ closeConfirm(); cb(); } }, okLabel)
    ])
  ]);
  var scrim = el('div', { 'class': 'scrim', id: 'ac-confirm', style: 'z-index:150', onclick: function(e){ if (e.target === scrim) closeConfirm(); } }, m);
  document.body.appendChild(scrim);
  document.body.style.overflow = 'hidden';
}
function busyBtn(btn, on){
  if (on) { btn.dataset.txt = btn.textContent; btn.textContent = 'Saving…'; btn.disabled = true; }
  else { btn.textContent = btn.dataset.txt || btn.textContent; btn.disabled = false; }
}
