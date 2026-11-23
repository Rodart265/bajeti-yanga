// ===============================================
// 6. AUTH
// ===============================================

// Password hints on the sign-up tab. Four states:
//   untouched  : nothing shown (no box, no warnings)
//   typing     : the box opens with neutral hints; each turns into a green tick once met
//   invalid    : after pressing the button with a problem (submitted=true) the unmet rows turn amber with a cross
//   submitted  : the button shows "Please wait..." while the account is created (see doEmailAuth)
function pwProblems(pw, pw2, submit){
  // Plain-language list of what is still missing, in the order a person would fix it. Empty list = the password is fine.
  const out = [];
  if(pw.length < 6){ const n = 6 - pw.length; out.push({k:'len', en: n===1 ? 'Add 1 more character (at least 6).' : 'Add '+n+' more characters (at least 6).', cw: 'Onjezani zilembo '+n+' (zosachepera 6).'}); }
  if(pw.length > 0 && pw !== pw.trim()) out.push({k:'space', en:'Remove the space at the start or end.', cw:'Chotsani malo opanda kanthu poyamba kapena pomaliza.'});
  if((pw2.length > 0 || submit) && pw !== pw2) out.push(pw2.length===0
    ? {k:'match', en:'Type your password again in the Confirm box.', cw:'Lembaninso mawu achinsinsi mu bokosi lotsimikizira.'}
    : {k:'match', en:'The two passwords are not the same yet. Retype the confirmation.', cw:'Mawu achinsinsi awiriwa sakufanana. Lembaninso otsimikizira.'});
  return out;
}
function validatePwReqs(val, fromPw2, submitted){
  const reqs = g('pw-reqs'), btn = g('a-em-btn');
  if(!reqs || !btn || btn.dataset.mode !== 'register') return;       // only the sign-up tab has this box
  const pw = String(g('a-pw') ? g('a-pw').value : (val||''));
  const pw2 = String(g('a-pw2') ? g('a-pw2').value : '');
  if(pw.length === 0 && pw2.length === 0 && !submitted){ reqs.style.display = 'none'; return; }   // untouched: no warnings yet
  reqs.style.display = 'flex';

  function setReq(chipId, icoId, ok, bad){
    const chip = g(chipId), ico = g(icoId);
    if(chip){ chip.style.color = ok ? '#A5D6A7' : (bad ? '#FFCC80' : 'rgba(255,255,255,.7)'); }
    if(ico){ ico.setAttribute('data-lucide', ok ? 'check-circle' : (bad ? 'x-circle' : 'circle')); }
  }
  const probs = pwProblems(pw, pw2, !!submitted), has = function(k){ return probs.some(function(p){ return p.k === k; }); };
  const lenTxt = g('req-len-txt');
  if(lenTxt){
    const need = 6 - pw.length;
    lenTxt.textContent = (pw.length > 0 && need > 0) ? L(need===1 ? '1 more character to go (at least 6)' : need+' more characters to go (at least 6)', 'Zilembo '+need+' zikufunika (zosachepera 6)') : L('At least 6 characters', 'Zilembo zosachepera 6');
  }
  // A row only turns "bad" after a failed submit; while typing, an unmet row stays neutral.
  setReq('req-len', 'req-len-ico', pw.length >= 6, !!submitted && has('len'));
  setReq('req-space', 'req-space-ico', pw.length > 0 && pw === pw.trim(), !!submitted && has('space'));
  const matchRow = g('req-match');
  if(matchRow && (pw2.length > 0 || submitted)){
    matchRow.style.display = 'flex';
    setReq('req-match', 'req-match-ico', pw === pw2 && pw.length > 0, !!submitted && pw2.length > 0 && has('match'));
  }
  if(window.lucide) lucide.createIcons({nodes:[reqs]});
}

function aTab(mode){
  const isReg=mode==='register';
  g('at-login').classList.toggle('on',!isReg);
  g('at-reg').classList.toggle('on',isReg);
  const nmf=g('a-nm-f'),pw2f=g('a-pw2-f'),fgtL=g('a-fgt-lnk'),btn=g('a-em-btn'),sw=g('a-sw');
  if(nmf)nmf.classList.toggle('hide',!isReg);
  if(pw2f)pw2f.classList.toggle('hide',!isReg);
  if(fgtL)fgtL.style.display=isReg?'none':'block';
  if(btn){btn.dataset.mode=isReg?'register':'login';btn.textContent=authBtnLabel(isReg);}
  if(sw)sw.innerHTML=lang==='cw'?(isReg?"Mukulemba kale? <span onclick=\"aTab('login')\">Takulandirani kubwerera</span>":"Ndinu watsopano pa Bajeti Yanga? <span onclick=\"aTab('register')\">Yambani kulemba</span>"):(isReg?"Already tracking? <span onclick=\"aTab('login')\">Welcome back</span>":"New to Bajeti Yanga? <span onclick=\"aTab('register')\">Start tracking</span>");
  // Show/hide password requirements box
  const reqs = g('pw-reqs');
  if(reqs) reqs.style.display = 'none';        // hidden on both tabs until someone types in the password field
  // Reset all requirement indicators when switching tabs
  {
    ['req-len','req-space'].forEach(function(id){
      const el=g(id); if(el){ el.style.color='rgba(255,255,255,.7)'; }
    });
    ['req-len-ico','req-space-ico'].forEach(function(id){
      const el=g(id); if(el) el.setAttribute('data-lucide','circle');
    });
    const lt=g('req-len-txt'); if(lt) lt.textContent=L('At least 6 characters','Zilembo zosachepera 6');
    const matchRow=g('req-match'); if(matchRow) matchRow.style.display='none';
    const matchIco=g('req-match-ico'); if(matchIco) matchIco.setAttribute('data-lucide','circle');
    const matchEl=g('req-match'); if(matchEl) matchEl.style.color='rgba(255,255,255,.7)';
  }
  // Trial note: sign-up tab only. It is the real offer (one 14-day Premium trial per account, started by the first household).
  const tn=g('a-trial'); if(tn) tn.classList.toggle('hide',!isReg);
  // Tell the phone's password manager which kind of field this is, so it can suggest a strong password on sign-up.
  ['a-pw','a-pw2'].forEach(function(id){ const f=g(id); if(f) f.setAttribute('autocomplete', isReg?'new-password':'current-password'); });
  // Clear password fields when switching tabs
  const pwField=g('a-pw'); if(pwField) pwField.value='';
  const pw2Field=g('a-pw2'); if(pw2Field) pw2Field.value='';
  showAErr('');
}
// Where Firebase's "Continue" button sends people after they finish a reset or verification link: back to the app.
// If Firebase does not accept the address (it must be in Authentication > Settings > Authorized domains), the
// email is sent again the plain way, so a setup gap can never stop someone getting their link.
function _authEmailSettings(){ return { url: APP_BASE_URL, handleCodeInApp: false }; }
function _sendAuthEmail(kind, target, email){
  const call = function(opts){
    return kind==='reset' ? auth.sendPasswordResetEmail(email, opts) : target.sendEmailVerification(opts);
  };
  return call(_authEmailSettings()).catch(function(e){
    if(e && (e.code==='auth/unauthorized-continue-uri' || e.code==='auth/invalid-continue-uri' || e.code==='auth/missing-continue-uri')){
      try{ console.error('[auth email] continue address not accepted, sending without it', e.code); }catch(_){}
      return call(undefined);
    }
    throw e;
  });
}
function showFgt(s){
  const fp=g('a-fgt'),mp=g('a-main'),sw=g('a-sw'),ok=g('fgt-ok');
  if(fp)fp.classList.toggle('hide',!s);
  if(mp)mp.classList.toggle('hide',s);
  if(sw)sw.style.display=s?'none':'block';
  if(ok&&s)ok.classList.remove('on');
  showAErr('');
}
function showAErr(msg){ renderErrBox('a-err',msg); }
function renderErrBox(id,msg){
  const el=g(id); if(!el)return;
  if(!msg){ el.classList.remove('on'); el.innerHTML=''; return; }
  el.innerHTML='<div style="display:flex;gap:8px;align-items:flex-start">'
    +'<i data-lucide="alert-circle" style="width:15px;height:15px;color:#EF5350;flex-shrink:0;margin-top:1px"></i>'
    +'<div style="flex:1;min-width:0;line-height:1.5">'+esc(msg)+'</div>'
    +'</div>';
  el.classList.add('on');
  if(window.lucide) lucide.createIcons({nodes:[el]});
}
function fmtAErr(code, err){
  const isCW = lang === 'cw';
  // Always leave a trace of the real error: it is what we need to diagnose a problem someone reports.
  try{ console.error('[auth error]', code, err&&err.message); }catch(_){}
  const en = {
    'auth/user-not-found':           'No account found with this email. Check the address or create a new account.',
    'auth/wrong-password':           'Incorrect password. Please try again.',
    'auth/invalid-credential':       'Incorrect email or password. Please try again.',
    'auth/invalid-login-credentials':'Incorrect email or password. Please try again.',
    'auth/email-already-in-use':     'This email is already registered. Try signing in instead.',
    'auth/invalid-email':            'Please enter a valid email address.',
    'auth/weak-password':            'Password must be at least 6 characters.',
    'auth/too-many-requests':        'Too many attempts. Please wait a few minutes and try again.',
    'auth/invalid-verification-code':'Wrong OTP code. Please check and try again.',
    'auth/code-expired':             'OTP has expired. Request a new one.',
    'auth/invalid-phone-number':     'Invalid phone number. Include the country code (e.g. +265).',
    'auth/network-request-failed':   'Network error. Check your internet connection and try again.',
    'auth/operation-not-allowed':    'This sign-in method is not enabled. Contact support.',
    'auth/popup-blocked':            'Popup was blocked. Allow popups in your browser settings and try again.',
    'auth/cancelled-popup-request':  'Sign-in was cancelled. Please try again.',
    'auth/account-exists-with-different-credential': 'An account exists with this email using a different sign-in method (e.g. Google). Try signing in with that method.',
    'auth/missing-password':         'Please enter your password.',
    'auth/missing-email':            'Please enter your email address.',
    'auth/requires-recent-login':    'For security, please sign out and sign back in before doing this.',
    'auth/user-disabled':            'This account has been disabled. Contact support at +265 888 029 029.',
    'auth/expired-action-code':      'This link has expired. Please request a new one.',
    'auth/invalid-action-code':      'This link is invalid or has already been used.',
    'auth/internal-error':           'The sign-in service had a problem. Please try again in a moment. If it keeps happening, contact support and mention "auth/internal-error".',
    'auth/invalid-api-key':          'The app\'s sign-in key is not accepted. This is a setup problem, not your fault. Please contact support.',
    'auth/api-key-not-valid':        'The app\'s sign-in key is not accepted. This is a setup problem, not your fault. Please contact support.',
    'auth/unauthorized-domain':      'This web address is not allowed to sign in yet. Please contact support.',
    'auth/app-not-authorized':       'This app is not allowed to sign in yet. Please contact support.',
    'auth/admin-restricted-operation':'New sign-ups are switched off right now. Please contact support.',
    'auth/quota-exceeded':           'Too many sign-ups or codes have been sent today. Please try again later.',
    'auth/captcha-check-failed':     'We could not check that you are a real person. Refresh the page and try again.',
    'auth/missing-recaptcha-token':  'We could not check that you are a real person. Refresh the page and try again.',
    'auth/invalid-app-credential':   'We could not check that you are a real person. Refresh the page and try again.',
    'auth/missing-phone-number':     'Please enter your phone number.',
    'auth/session-expired':          'The code expired. Request a new one.',
    'auth/timeout':                  'The request took too long. Check your connection and try again.',
    'auth/web-storage-unsupported':  'Your browser is blocking storage. Turn off private browsing or allow cookies for this site, then try again.',
    'auth/network-request-failed':   'Network error. Check your internet connection and try again.',
  };
  const cw = {
    'auth/user-not-found':           'Akaunti yosapezeka ndi imelo iyi. Onani imelo kapena pangani akaunti yatsopano.',
    'auth/wrong-password':           'Mawu achinsinsi olakwika. Yesaninso.',
    'auth/invalid-credential':       'Imelo kapena mawu achinsinsi olakwika. Yesaninso.',
    'auth/invalid-login-credentials':'Imelo kapena mawu achinsinsi olakwika. Yesaninso.',
    'auth/email-already-in-use':     'Imelo iyi yalembetsedwa kale. Yesani kulowa.',
    'auth/invalid-email':            'Lowetsani imelo yolondola.',
    'auth/weak-password':            'Mawu achinsinsi ayenera kukhala ndi zilembo 6 kapena kupitirira.',
    'auth/too-many-requests':        'Mwayesa kambirimbiri. Dikirani mphindi zingapo kenako yesaninso.',
    'auth/invalid-verification-code':'Kodi ya OTP yolakwika. Onani ndipo yesaninso.',
    'auth/code-expired':             'OTP yatha. Pemphani yatsopano.',
    'auth/invalid-phone-number':     'Nambala ya foni ndi yolakwika. Phatikizani nambala ya dziko (mwachitsanzo +265).',
    'auth/network-request-failed':   'Vuto la intaneti. Onani kulumikizana kwanu ndipo yesaninso.',
    'auth/operation-not-allowed':    'Njira iyi ya kulowa siilolezedwa. Lankhulani ndi thandizo.',
    'auth/popup-blocked':            'Popup idakanidwa. Lolani ma popup mu browser ndipo yesaninso.',
    'auth/cancelled-popup-request':  'Kulowa kudaimitsiwa. Yesaninso.',
    'auth/account-exists-with-different-credential': 'Akaunti ilipo ndi imelo iyi kugwiritsa ntchito njira ina (mwachitsanzo Google). Yesani kulowa ndi njira imeneyo.',
    'auth/missing-password':         'Lowetsani mawu achinsinsi.',
    'auth/missing-email':            'Lowetsani imelo yanu.',
    'auth/requires-recent-login':    'Chifukwa cha chitetezo, tulukani ndipo lowani pomwe.',
    'auth/user-disabled':            'Akaunti iyi yatsekedwa. Lankhulani thandizo pa +265 888 029 029.',
    'auth/expired-action-code':      'Ulalo uwu watha. Pemphani watsopano.',
    'auth/invalid-action-code':      'Ulalo uwu ndi wopanda pake kapena wagwiritsidwa ntchito kale.',
    'auth/internal-error':           'Dongosolo lolowera lakumana ndi vuto. Yesaninso pakanthawi. Likapitirira, lankhulani ndi thandizo ndi kunena "auth/internal-error".',
    'auth/invalid-api-key':          'Chinsinsi cha pulogalamu sichikuvomerezedwa. Ndi vuto la kakonzedwe, osati lanu. Lankhulani ndi thandizo.',
    'auth/api-key-not-valid':        'Chinsinsi cha pulogalamu sichikuvomerezedwa. Ndi vuto la kakonzedwe, osati lanu. Lankhulani ndi thandizo.',
    'auth/unauthorized-domain':      'Adilesi iyi sinaloledwe kulowa. Lankhulani ndi thandizo.',
    'auth/app-not-authorized':       'Pulogalamu iyi sinaloledwe kulowa. Lankhulani ndi thandizo.',
    'auth/admin-restricted-operation':'Kulembetsa akaunti zatsopano kwatsekedwa pano. Lankhulani ndi thandizo.',
    'auth/quota-exceeded':           'Ma kodi atumizidwa ambiri lero. Yesaninso mawa.',
    'auth/captcha-check-failed':     'Sitinathe kutsimikizira kuti ndinu munthu. Tsegulaninso tsambali ndipo yesaninso.',
    'auth/missing-recaptcha-token':  'Sitinathe kutsimikizira kuti ndinu munthu. Tsegulaninso tsambali ndipo yesaninso.',
    'auth/invalid-app-credential':   'Sitinathe kutsimikizira kuti ndinu munthu. Tsegulaninso tsambali ndipo yesaninso.',
    'auth/missing-phone-number':     'Lowetsani nambala yanu ya foni.',
    'auth/session-expired':          'Kodi yatha. Pemphani yatsopano.',
    'auth/timeout':                  'Zatenga nthawi yaitali. Onani intaneti yanu ndipo yesaninso.',
    'auth/web-storage-unsupported':  'Browser yanu ikutsekereza kusunga zambiri. Zimitsani private mode kapena lolani ma cookie, kenako yesaninso.',
  };
  const map = isCW ? cw : en;
  // Any code not in the map above (Firebase has more than we've listed) now
  // gets the same friendly fallback as a codeless error, instead of leaking
  // the raw "auth/whatever-it-is" string to the user.
  if(map[code]) return map[code];
  // Password rules set in the Firebase console (e.g. "must contain a symbol"): show what is missing.
  if(code==='auth/password-does-not-meet-requirements'){
    const m=/\[(.+)\]/.exec((err&&err.message)||'');
    return (isCW?'Mawu achinsinsi sakukwaniritsa malamulo a chitetezo.':'This password does not meet the security rules.')+(m?' '+m[1]+'.':(isCW?' Onjezani chizindikiro (monga ! kapena @), zilembo zazikulu ndi zazing\'ono, ndi nambala.':' Try adding a symbol (such as ! or @), upper and lower case letters, and a number.'));
  }
  // The sign-in key is restricted by web address in Google Cloud; the code then carries the address.
  if(code && code.indexOf('auth/requests-from-referer')===0)
    return isCW?'Adilesi ya tsambali siyaloledwa ndi chinsinsi cha pulogalamu. Ndi vuto la kakonzedwe. Lankhulani ndi thandizo.':'This web address is not allowed by the app\'s sign-in key. This is a setup problem, not your fault. Please contact support.';
  // Anything else: say so, and show the code so it can be reported. A missing code means a bug in the app itself.
  if(code) return (isCW?'Chinachake chinalakwika (':'Could not complete that (')+code+(isCW?'). Yesaninso, kapena tilankhuleni ngati chikupitirira.':'). Please try again, or contact support if it keeps happening.');
  return (isCW?'Pulogalamu yakumana ndi vuto: ':'The app hit an unexpected problem: ')+(((err&&err.message)||'unknown').toString().slice(0,120))+(isCW?'. Tsegulaninso tsambali ndipo yesaninso.':'. Please refresh the page and try again.');
}
function authBtnLabel(isReg){ return lang==='cw'?(isReg?'Yambani Kulemba':'Takulandirani Kubwerera'):(isReg?'Start Tracking':'Welcome Back'); }
function doEmailAuth(){
  const email=val('a-em').trim(), pass=val('a-pw');
  const btn=g('a-em-btn'), isReg=!!(btn&&btn.dataset.mode==='register');
  if(!email||!pass){
    showAErr((lang==='cw'?'Lowetsani imelo ndi mawu achinsinsi.':'Please fill in email and password.'));
    if(isReg && email) validatePwReqs(null,false,true);
    return;
  }
  if(btn){btn.disabled=true;btn.textContent=(lang==='cw'?'Chonde dikirani...':'Please wait...');}
  showAErr('');
  if(isReg){
    const p2=val('a-pw2'), nm=val('a-nm').trim();
    // Check in the order a person would fix things, say exactly what to do, and open the hint box with the problem rows marked.
    const probs = pwProblems(pass, p2, true);
    if(probs.length){
      showAErr(lang==='cw' ? probs[0].cw : probs[0].en);
      validatePwReqs(null,false,true);
      if(btn){btn.disabled=false;btn.textContent=authBtnLabel(true);}
      const f=g(probs[0].k==='match'?'a-pw2':'a-pw'); if(f){ try{ f.focus({preventScroll:false}); }catch(e){} }
      return;
    }
    auth.createUserWithEmailAndPassword(email,pass)
      .then(cred=>{
        const user=cred.user;
        const updates=[];
        let sendErr=null;
        // Both are best-effort: the account already exists, so a failure here (e.g. too-many-requests) must not
        // strand the user with an error and a half-created account. They can use "Resend" on the verify screen,
        // which now also tells them plainly that the first email did not go out.
        if(nm) updates.push(user.updateProfile({displayName:nm}).catch(()=>{}));
        updates.push(_sendAuthEmail('verify', user).catch(e=>{ sendErr=e; try{ console.error('[verification email]', e&&e.code, e&&e.message); }catch(_){} }));
        return Promise.all(updates).then(()=>({user, sendErr}));
      })
      .then(r=>{
        // Stay signed in on the verify screen: Resend / "I Have Verified" need auth.currentUser, and
        // onAuthStateChanged already blocks unverified email users from reaching the app.
        if(btn){btn.disabled=false;btn.textContent=authBtnLabel(true);}
        showVerifyScreen(email, r.sendErr);
      })
      .catch(e=>{ showAErr(fmtAErr(e.code,e)); if(btn){btn.disabled=false;btn.textContent=authBtnLabel(true);} });
  } else {
    auth.signInWithEmailAndPassword(email,pass)
      .then(()=>{ if(btn){btn.disabled=false;btn.textContent=authBtnLabel(false);} })
      .catch(e=>{ showAErr(fmtAErr(e.code,e)); if(btn){btn.disabled=false;btn.textContent=authBtnLabel(false);} });
  }
}
function doFgt(){
  const em=val('fgt-em').trim(); if(!em){showAErr((lang==='cw'?'Lowetsani imelo yanu.':'Enter your email address.'));return;}
  const btn=g('fgt-btn'); if(btn){btn.disabled=true;btn.textContent='Sending...';}
  showAErr('');
  _sendAuthEmail('reset', null, em)
    .then(()=>{ const ok=g('fgt-ok');if(ok){ ok.innerHTML='<i data-lucide="check-circle" style="width:13px;height:13px;margin-right:5px;vertical-align:middle;color:#A5D6A7"></i> '+esc(lang==='cw'?'Imelo yatumizidwa! Onani inbox yanu. Ulalo umagwira ntchito pafupifupi ola limodzi.':'Reset email sent! Check your inbox. The link works for about 1 hour.'); ok.classList.add('on'); if(window.lucide)lucide.createIcons({nodes:[ok]}); } if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="send" class="ic14m4"></i> Send Reset Link'; if(window.lucide)lucide.createIcons({nodes:[btn]});} })
    .catch(e=>{ showAErr(fmtAErr(e.code,e)); if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="send" class="ic14m4"></i> Send Reset Link'; if(window.lucide)lucide.createIcons({nodes:[btn]});} });
}

// ── Email Verification Screen ──
// FIX: Persist cooldown in localStorage so page refresh cannot bypass the 60s rate limit
let _resendCooldown = parseInt(localStorage.getItem('nb_resend_cd')||'0');

function showVerifyScreen(email, sendErr){
  const isCW = lang === 'cw';
  // Clear any stale resend cooldown from a previous session/account
  localStorage.removeItem('nb_resend_cd');
  _resendCooldown = 0;
  // Set bilingual text dynamically
  const titleEl = g('verify-title');
  const subEl = g('verify-sub');
  const bodyEl = g('verify-body-text');
  const contLbl = g('verify-continue-lbl');
  const resendLbl = g('verify-resend-lbl');
  const backLbl = g('verify-back-lbl');
  if(titleEl) titleEl.textContent = isCW ? 'Onani Imelo Yanu' : 'Check Your Email';
  if(subEl) subEl.textContent = isCW ? 'Tatumiza ulalo wotsimikizira imelo yanu.' : 'We sent a verification link to your email.';
  if(bodyEl) bodyEl.textContent = isCW ? 'Dinani ulalo mu imelo imeneyo kuti mutsimikizire akaunti yanu. Onani spam folder ngati simuwona.' : 'Click the link in that email to verify your account. Check your spam folder if you do not see it.';
  if(contLbl) contLbl.textContent = isCW ? 'Ndatsimikiza. Pitilizani' : 'I Have Verified. Continue';
  if(resendLbl) resendLbl.textContent = isCW ? 'Tumizaninso Imelo' : 'Resend Verification Email';
  if(backLbl) backLbl.textContent = isCW ? 'Bwererani Kulowa' : 'Back to Login';
  const emailEl = g('verify-email-display');
  if(emailEl) emailEl.textContent = email || '';
  const msgEl = g('verify-msg'); if(msgEl) msgEl.textContent = '';
  // The first email did not go out: say so instead of claiming it was sent, and point at the Resend button.
  if(sendErr){
    if(subEl) subEl.textContent = isCW ? 'Akaunti yanu yapangidwa, koma sitinathe kutumiza imelo yotsimikizira.' : 'Your account is created, but we could not send the verification email.';
    if(bodyEl) bodyEl.textContent = isCW ? 'Dinani "Tumizaninso Imelo" pansipa. Ngati zikulephera, dikirani mphindi zingapo ndipo yesaninso.' : 'Tap "Resend Verification Email" below. If it keeps failing, wait a few minutes and try again.';
    if(msgEl){ msgEl.style.color='#FFCDD2'; msgEl.textContent = fmtAErr(sendErr.code, sendErr); }
  }
  const btn = g('resend-btn'); if(btn) btn.disabled = false;
  hide('scr-auth'); hide('scr-setup'); hide('scr-pin'); hide('scr-welcome');
  g('app').classList.add('hide');
  show('scr-verify');
  if(window._pushOnboardScreen) _pushOnboardScreen('verify');
  if(window.lucide) lucide.createIcons({nodes:[g('scr-verify')]});
}

function checkVerification(){
  const btn=document.querySelector('#scr-verify .a-btn');
  // Change only the label span; setting btn.textContent would delete #verify-continue-lbl and the label could never be restored.
  if(btn){btn.disabled=true; const _l=g('verify-continue-lbl'); if(_l) _l.textContent='Checking...';}
  const msgEl=g('verify-msg');
  // Must sign in fresh to get updated emailVerified status
  const user=auth.currentUser;
  if(!user){
    // User not signed in — ask them to log in again
    if(msgEl) msgEl.textContent='Please log in to continue.';
    if(btn){btn.disabled=false; const _l2=g('verify-continue-lbl'); if(_l2) _l2.textContent=(lang==='cw'?'Ndatsimikiza. Pitirizani':'I Have Verified. Continue');}
    backToLogin();
    return;
  }
  // After reload, also refresh the ID token: the rules read the email_verified claim from the token, which stays
  // stale (false) for up to an hour otherwise.
  user.reload().then(()=>auth.currentUser && auth.currentUser.emailVerified ? auth.currentUser.getIdToken(true).catch(()=>{}) : null).then(()=>{
    const isCW2 = lang === 'cw';
    if(auth.currentUser && auth.currentUser.emailVerified){
      if(msgEl) msgEl.textContent='';
      hide('scr-verify');
      authReg=false;
      bootApp();
    } else {
      if(msgEl){msgEl.style.color='#FFCDD2';msgEl.textContent=isCW2?'Imelo siitsimikiziridwa. Onani inbox yanu ndipo dinani ulalo, kenako yesaninso.':'Email not verified yet. Check your inbox and click the link, then try again.';}
      if(btn){btn.disabled=false; const lbl=g('verify-continue-lbl'); if(lbl) lbl.textContent=isCW2?'Ndatsimikiza. Pitirizani':'I Have Verified. Continue'; if(window.lucide)lucide.createIcons({nodes:[btn]});}
    }
  }).catch(()=>{
    const isCW3 = lang === 'cw';
    if(msgEl){msgEl.style.color='#FFCDD2';msgEl.textContent=isCW3?'Sitinathe kuwonetsa. Onani kulumikizana kwanu.':'Could not check. Check your internet connection.';}
    if(btn){btn.disabled=false; const lbl=g('verify-continue-lbl'); if(lbl) lbl.textContent=isCW3?'Ndatsimikiza. Pitirizani':'I Have Verified. Continue'; if(window.lucide)lucide.createIcons({nodes:[btn]});}
  });
}

function resendVerification(){
  const isCW = lang === 'cw';
  const now=Date.now();
  if(now < _resendCooldown){
    const secs=Math.ceil((_resendCooldown-now)/1000);
    const msgEl=g('verify-msg');
    if(msgEl){msgEl.style.color='rgba(255,255,255,.65)';msgEl.textContent=isCW?'Dikirani ma sekunde '+secs+' musanatumizanso.':'Please wait '+secs+' seconds before resending.';}
    return;
  }
  const user=auth.currentUser;
  if(!user){ backToLogin(); return; }
  const btn=g('resend-btn');
  if(btn){btn.disabled=true;}
  _sendAuthEmail('verify', user)
    .then(()=>{
      _resendCooldown=Date.now()+60000;
      localStorage.setItem('nb_resend_cd', String(_resendCooldown));
      const msgEl=g('verify-msg');
      if(msgEl){msgEl.style.color='#C8E6C9';msgEl.textContent=isCW?'Imelo yatumizidwa! Onani inbox yanu.':'Verification email sent! Check your inbox.';}
      if(btn){btn.disabled=false;}
    })
    .catch(e=>{
      const msgEl=g('verify-msg');
      if(msgEl){msgEl.style.color='#FFCDD2';msgEl.textContent=fmtAErr(e.code,e);}
      if(btn){btn.disabled=false;}
    });
}

function backToLogin(){
  auth.signOut().catch(()=>{});
  hide('scr-verify');
  show('scr-auth');
  aTab('login');
}
function doGoogle(){
  if(!auth){toast((lang==='cw'?'Sizinakonzeke.':'Not ready.'),'e');return;}
  auth.signInWithPopup(new firebase.auth.GoogleAuthProvider())
    .catch(e=>{ if(e.code!=='auth/popup-closed-by-user')showAErr(fmtAErr(e.code,e)); });
}
