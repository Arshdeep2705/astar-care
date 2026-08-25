/* ================= render root ================= */
function render(){
  var app = document.getElementById('app');
  app.innerHTML = '';
  if (state.pwChange) { renderSetPassword(app); return; }
  if (!state.auth) { renderSignin(app); return; }
  if (state.loading) { renderLoading(app); return; }
  if (state.loadErr) { renderLoadError(app); return; }
  if (isAdmin() && !state.preview) renderAdmin(app);
  else renderWorker(app);
}

function renderLoading(app){
  var w = el('div', { 'class': 'wrap main' });
  w.appendChild(el('div', { 'class': 'skel', style: 'height:36px;width:240px;margin:22px 0 18px' }));
  for (var i = 0; i < 3; i++) w.appendChild(el('div', { 'class': 'skel', style: 'height:96px;margin-bottom:12px;border-radius:16px' }));
  app.appendChild(w);
}
function renderLoadError(app){
  app.appendChild(el('div', { 'class': 'wrap main' },
    el('div', { 'class': 'card card-pad', style: 'max-width:440px;margin:60px auto;text-align:center' }, [
      el('div', { 'class': 't-title', style: 'margin-bottom:8px' }, "Couldn't reach the server"),
      el('p', { 'class': 't-mut', style: 'margin-bottom:16px' }, state.loadErr),
      el('button', { 'class': 'btn btn-pri', onclick: function(){ location.reload(); } }, 'Try again')
    ])));
}

/* ================= sign in ================= */
function renderSignin(app){
  var wrap = el('div', { 'class': 'auth-wrap' });
  var card = el('div', { 'class': 'auth-card' });
  card.appendChild(el('div', { 'class': 'brand', style: 'justify-content:center;margin-bottom:6px' }, [
    el('span', { 'class': 'brand-mark' }, 'A'), 'Astar Care'
  ]));
  card.appendChild(el('div', { 'class': 't-cap', style: 'margin-bottom:4px' }, 'Astar Health Service'));

  if (PORTAL === 'admin') {
    card.appendChild(el('div', { 'class': 't-title', style: 'margin-top:18px' }, 'Admin sign in'));
    card.appendChild(el('p', { 'class': 't-cap' }, 'Enter your 4-digit PIN'));
    var dots = el('div', { 'class': 'pin-dots' });
    for (var i = 0; i < 4; i++) dots.appendChild(el('div', { 'class': 'pin-dot' + (i < state.pin.length ? ' fill' : '') }));
    card.appendChild(dots);
    var pad = el('div', { 'class': 'pin-pad' });
    var keys = ['1','2','3','4','5','6','7','8','9','','0','del'];
    keys.forEach(function(k){
      if (k === '') { pad.appendChild(el('div')); return; }
      if (k === 'del') {
        pad.appendChild(el('button', { 'class': 'pin-key ghostkey', 'aria-label': 'Delete', onclick: function(){ pinInput('del'); } },
          svgIcon('<path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="m12 10 4 4M16 10l-4 4"/>')));
        return;
      }
      pad.appendChild(el('button', { 'class': 'pin-key', onclick: function(){ pinInput(k); } }, k));
    });
    card.appendChild(pad);
  } else {
    card.appendChild(el('div', { 'class': 't-title', style: 'margin-top:18px;margin-bottom:4px' }, 'Worker sign in'));
    card.appendChild(el('p', { 'class': 't-cap', style: 'margin-bottom:20px' }, 'Use your work email and password'));
    var form = el('form', { style: 'text-align:left', onsubmit: function(e){ e.preventDefault(); doWorkerLogin(form); } });
    form.appendChild(el('div', { 'class': 'field' }, [
      el('label', null, 'Email'),
      el('input', { 'class': 'inp', type: 'email', name: 'email', autocomplete: 'username', required: 'required', placeholder: 'you@example.com' })
    ]));
    form.appendChild(el('div', { 'class': 'field' }, [
      el('label', null, 'Password'),
      el('input', { 'class': 'inp', type: 'password', name: 'password', autocomplete: 'current-password', required: 'required', placeholder: '••••••••' })
    ]));
    var errBox = el('div', { 'class': 'err-line', id: 'login-err', style: 'display:none;margin-bottom:10px' });
    form.appendChild(errBox);
    form.appendChild(el('button', { 'class': 'btn btn-pri btn-big btn-block', type: 'submit' }, 'Sign in'));
    card.appendChild(form);
  }
  wrap.appendChild(card);
  app.appendChild(wrap);
}

function pinInput(k){
  if (state.pinBusy) return;
  if (k === 'del') state.pin = state.pin.slice(0, -1);
  else if (state.pin.length < 4) state.pin += k;
  if (state.pin.length === 4) {
    // the PIN is verified server-side; a correct PIN returns a real admin session
    var pin = state.pin;
    state.pinBusy = true;
    render();
    sbFetch('/functions/v1/admin-login', { method: 'POST', body: { pin: pin }, token: SB_KEY })
      .then(function(s){
        state.pinBusy = false; state.pin = '';
        state.auth = { mode: 'admin', token: s.access_token, refresh: s.refresh_token };
        saveSession();
        render(); loadAll().then(render);
      })
      ["catch"](function(){
        state.pinBusy = false;
        var card = document.querySelector('.auth-card');
        if (card) card.classList.add('shake');
        setTimeout(function(){ state.pin = ''; render(); }, 420);
      });
    return;
  }
  render();
}
document.addEventListener('keydown', function(e){
  if (state.auth || PORTAL !== 'admin' || state.pwChange) return;
  if (e.key >= '0' && e.key <= '9') pinInput(e.key);
  else if (e.key === 'Backspace') pinInput('del');
});

function doWorkerLogin(form){
  var email = form.email.value.trim().toLowerCase();
  var pass = form.password.value;
  var btn = form.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Signing in…';
  var errBox = document.getElementById('login-err');
  sbLogin(email, pass).then(function(sess){
    return sbFetch('/rest/v1/ac_workers?select=*&email=eq.' + encodeURIComponent(email), { token: sess.access_token }).then(function(rows){
      var w = rows[0];
      if (!w) throw new Error('No worker record found for this email. Ask the office to add you.');
      if (w.must_change_password) {
        state.pwChange = { token: sess.access_token, refresh: sess.refresh_token, workerId: w.id, name: w.name };
        render();
        return;
      }
      state.auth = { mode: 'worker', workerId: w.id, token: sess.access_token, refresh: sess.refresh_token };
      saveSession();
      state.view = 'home';
      render(); loadAll().then(render);
    });
  })["catch"](function(e){
    btn.disabled = false; btn.textContent = 'Sign in';
    errBox.style.display = 'block';
    errBox.textContent = /invalid/i.test(e.message) ? 'Wrong email or password.' : e.message;
  });
}

function renderSetPassword(app){
  var wrap = el('div', { 'class': 'auth-wrap' });
  var card = el('div', { 'class': 'auth-card', style: 'text-align:left' });
  card.appendChild(el('div', { 'class': 't-title', style: 'margin-bottom:4px' }, 'Set your own password'));
  card.appendChild(el('p', { 'class': 't-cap', style: 'margin-bottom:20px' }, "G'day " + firstName(state.pwChange.name) + " — before you start, choose a password only you know (at least 8 characters)."));
  var form = el('form', { onsubmit: function(e){ e.preventDefault(); doSetPassword(form); } });
  form.appendChild(el('div', { 'class': 'field' }, [
    el('label', null, 'New password'),
    el('input', { 'class': 'inp', type: 'password', name: 'p1', autocomplete: 'new-password', required: 'required' })
  ]));
  form.appendChild(el('div', { 'class': 'field' }, [
    el('label', null, 'Repeat it'),
    el('input', { 'class': 'inp', type: 'password', name: 'p2', autocomplete: 'new-password', required: 'required' })
  ]));
  var errBox = el('div', { 'class': 'err-line', id: 'pw-err', style: 'display:none;margin-bottom:10px' });
  form.appendChild(errBox);
  form.appendChild(el('button', { 'class': 'btn btn-pri btn-big btn-block', type: 'submit' }, 'Save and continue'));
  card.appendChild(form);
  wrap.appendChild(card);
  app.appendChild(wrap);
}
function doSetPassword(form){
  var p1 = form.p1.value, p2 = form.p2.value;
  var errBox = document.getElementById('pw-err');
  function fail(m){ errBox.style.display = 'block'; errBox.textContent = m; }
  if (p1.length < 8) return fail('Password needs at least 8 characters.');
  if (p1 !== p2) return fail("Those two don't match.");
  var btn = form.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Saving…';
  var pc = state.pwChange;
  function refreshPc(){
    // the worker may have sat on this screen for over an hour — renew first
    return fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { 'apikey': SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: pc.refresh })
    }).then(function(r){ return r.json(); }).then(function(j){
      if (!j.access_token) throw new Error('Your sign-in expired — reload the app and sign in again.');
      pc.token = j.access_token; pc.refresh = j.refresh_token || pc.refresh;
    });
  }
  var setP = pc.pwDone ? Promise.resolve() :
    sbSetPassword(pc.token, p1).then(function(){ pc.pwDone = true; })
      ["catch"](function(e){
        // retry after a half-failed attempt: the password IS already set
        if (/different from the old/i.test(e.message || '')) { pc.pwDone = true; return; }
        if (/jwt|expired|invalid token/i.test(e.message || '') && pc.refresh) {
          return refreshPc().then(function(){
            return sbSetPassword(pc.token, p1).then(function(){ pc.pwDone = true; });
          });
        }
        throw e;
      });
  setP.then(function(){
    // become the signed-in worker so the flag update runs as them
    state.auth = { mode: 'worker', workerId: pc.workerId, token: pc.token, refresh: pc.refresh };
    return sbUpd('ac_workers', 'id=eq.' + pc.workerId, { must_change_password: false });
  }).then(function(){
    state.pwChange = null;
    saveSession();
    state.view = 'home';
    render(); loadAll().then(render);
  })["catch"](function(e){
    state.auth = null;
    btn.disabled = false; btn.textContent = 'Save and continue';
    fail(e.message);
  });
}

function signOut(){
  state.auth = null; state.preview = null; state.pin = ''; state.view = 'home'; state.adminTab = 'roster';
  stopRealtime();
  clearSession();
  render();
}

/* ================= shells ================= */
function workerNavItems(){
  return [
    { id: 'home', label: 'Home', ic: IC.home },
    { id: 'calendar', label: 'Calendar', ic: IC.cal },
    { id: 'notes', label: 'My notes', ic: IC.note },
    { id: 'avail', label: 'Availability', ic: IC.clock }
  ];
}
function renderWorker(app){
  var w = me();
  if (!w) { signOut(); return; }
  var items = workerNavItems();
  var hdr = el('div', { 'class': 'hdr' }, el('div', { 'class': 'wrap hdr-in' }, [
    el('div', { 'class': 'brand' }, [ el('span', { 'class': 'brand-mark' }, 'A'), 'Astar Care' ]),
    el('div', { 'class': 'hdr-tabs' }, items.map(function(it){
      return el('button', { 'class': 'hdr-tab' + (state.view === it.id ? ' on' : ''), onclick: function(){ state.view = it.id; render(); } }, it.label);
    })),
    el('div', { 'class': 'hdr-side' }, [
      state.preview ? el('button', { 'class': 'btn btn-sm btn-dark', onclick: function(){ state.preview = null; state.view = 'home'; render(); } }, '← Admin') : null,
      (!state.preview && pushSupported() && !pushEnabled()) ? el('button', { 'class': 'iconbtn', title: 'Turn on notifications', style: 'color:var(--acc)', onclick: enablePush }, svgIcon(IC.bell)) : null,
      el('span', { 'class': 'avatar', style: 'background:' + w.colour, title: w.name }, initials(w.name)),
      state.preview ? null : el('button', { 'class': 'iconbtn', title: 'Sign out', onclick: function(){ confirmDlg('Sign out?', 'You can sign back in any time.', 'Sign out', signOut); } }, svgIcon(IC.out))
    ])
  ]));
  app.appendChild(hdr);
  var main = el('div', { 'class': 'wrap main' });
  if (state.view === 'home') viewWorkerHome(main, w);
  else if (state.view === 'calendar') viewCalendar(main, w);
  else if (state.view === 'notes') viewMyNotes(main, w);
  else if (state.view === 'avail') viewAvailability(main, w);
  app.appendChild(main);
  app.appendChild(bottomNav(items, state.view, function(id){ state.view = id; render(); }));
}

function bottomNav(items, current, go){
  return el('div', { 'class': 'bnav' }, el('div', { 'class': 'bnav-in' }, items.map(function(it){
    return el('button', { 'class': 'bnav-btn' + (current === it.id ? ' on' : ''), onclick: function(){ go(it.id); } }, [
      svgIcon(it.ic), it.label
    ]);
  })));
}

function adminNavItems(){
  return [
    { id: 'roster', label: 'Roster', ic: IC.grid },
    { id: 'inbox', label: 'Inbox', ic: IC.inbox },
    { id: 'avail', label: 'Availability', ic: IC.clock },
    { id: 'pay', label: 'Pay', ic: IC.pay },
    { id: 'team', label: 'Team', ic: IC.users }
  ];
}
function renderAdmin(app){
  var items = adminNavItems();
  var hdr = el('div', { 'class': 'hdr' }, el('div', { 'class': 'wrap hdr-in' }, [
    el('div', { 'class': 'brand' }, [ el('span', { 'class': 'brand-mark' }, 'A'), 'Astar Care' ]),
    el('div', { 'class': 'hdr-tabs' }, items.map(function(it){
      return el('button', { 'class': 'hdr-tab' + (state.adminTab === it.id ? ' on' : ''), onclick: function(){ state.adminTab = it.id; render(); } }, it.label);
    })),
    el('div', { 'class': 'hdr-side' }, [
      (pushSupported() && !pushEnabled()) ? el('button', { 'class': 'iconbtn', title: 'Turn on notifications', style: 'color:var(--acc)', onclick: enablePush }, svgIcon(IC.bell)) : null,
      workerPreviewSelect(),
      el('button', { 'class': 'iconbtn', title: 'Sign out', onclick: function(){ confirmDlg('Sign out?', 'You can sign back in any time.', 'Sign out', signOut); } }, svgIcon(IC.out))
    ])
  ]));
  app.appendChild(hdr);
  var main = el('div', { 'class': 'wrap main' });
  if (state.adminTab === 'roster') viewRoster(main);
  else if (state.adminTab === 'inbox') viewInbox(main);
  else if (state.adminTab === 'avail') viewAdminAvail(main);
  else if (state.adminTab === 'pay') viewPay(main);
  else if (state.adminTab === 'team') viewTeam(main);
  app.appendChild(main);
  app.appendChild(bottomNav(items, state.adminTab, function(id){ state.adminTab = id; render(); }));
}

function workerPreviewSelect(){
  var sel = el('select', { 'class': 'sel', style: 'min-height:38px;padding:6px 32px 6px 12px;font-size:13px;width:auto;border-radius:10px',
    onchange: function(){
      if (sel.value) { state.preview = sel.value; state.view = 'home'; }
      else state.preview = null;
      render();
    } });
  sel.appendChild(el('option', { value: '' }, 'Worker view…'));
  state.data.workers.filter(function(w){ return !w.is_admin; }).forEach(function(w){
    sel.appendChild(el('option', { value: w.id, selected: state.preview === w.id }, w.name));
  });
  return sel;
}
