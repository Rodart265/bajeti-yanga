// ===============================================
// 6. AUTH
// ===============================================

function validatePwReqs(val, fromPw2){
  const reqs = g('pw-reqs');
  if(!reqs || reqs.style.display === 'none') return;
  const pw = String(g('a-pw') ? g('a-pw').value : (val||''));
  const pw2 = String(g('a-pw2') ? g('a-pw2').value : '');
  if(pw.length === 0 && !fromPw2) return; // Don't show errors before first keypress

  function setReq(chipId, icoId, ok){
    const chip = g(chipId), ico = g(icoId);
    if(chip){ chip.style.color = ok ? '#A5D6A7' : 'rgba(255,255,255,.5)'; }
    if(ico){ ico.setAttribute('data-lucide', ok ? 'check-circle' : 'x-circle'); }
  }

  // Requirement 1: at least 6 characters
  setReq('req-len', 'req-len-ico', pw.length >= 6);

  // Requirement 2: no leading/trailing spaces
  setReq('req-space', 'req-space-ico', pw.length > 0 && pw === pw.trim());

  // Requirement 3: passwords match — only show row once confirm field has content
  const matchRow = g('req-match');
  if(matchRow && pw2.length > 0){
    matchRow.style.display = 'flex';
    setReq('req-match', 'req-match-ico', pw === pw2 && pw.length > 0);
  }

  // Re-render Lucide icons after updating data-lucide attributes
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
  if(reqs) reqs.style.display = isReg ? 'flex' : 'none';
  // Reset all requirement indicators when switching tabs
  // Reset all requirement indicators on tab switch
  {
    ['req-len','req-space'].forEach(function(id){
      const el=g(id); if(el){ el.style.color='rgba(255,255,255,.5)'; }
    });
    ['req-len-ico','req-space-ico'].forEach(function(id){
      const el=g(id); if(el) el.setAttribute('data-lucide','x-circle');
    });
    const matchRow=g('req-match'); if(matchRow) matchRow.style.display='none';
    const matchIco=g('req-match-ico'); if(matchIco) matchIco.setAttribute('data-lucide','x-circle');
    const matchEl=g('req-match'); if(matchEl) matchEl.style.color='rgba(255,255,255,.5)';
  }
  // Clear password fields when switching tabs
  const pwField=g('a-pw'); if(pwField) pwField.value='';
  const pw2Field=g('a-pw2'); if(pw2Field) pw2Field.value='';
  showAErr('');
}
function aMethod(m){
  g('mt-em').classList.toggle('on',m==='email');
  g('mt-ph').classList.toggle('on',m==='phone');
  const ep=g('a-em-p'),pp=g('a-ph-p'),sw=g('a-sw');
  if(ep)ep.classList.toggle('hide',m!=='email');
  if(pp)pp.classList.toggle('hide',m!=='phone');
  if(sw)sw.style.display=m==='email'?'block':'none';
  showAErr('');
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
function fmtAErr(code){
  const isCW = lang === 'cw';
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
  };
  const map = isCW ? cw : en;
  // Any code not in the map above (Firebase has more than we've listed) now
  // gets the same friendly fallback as a codeless error, instead of leaking
  // the raw "auth/whatever-it-is" string to the user.
  return map[code] || (isCW ? 'Chinachake chinalakwika. Yesaninso.' : 'Something went wrong. Please try again.');
}
function authBtnLabel(isReg){ return lang==='cw'?(isReg?'Yambani Kulemba':'Takulandirani Kubwerera'):(isReg?'Start Tracking':'Welcome Back'); }
function doEmailAuth(){
  const email=val('a-em').trim(), pass=val('a-pw');
  if(!email||!pass){ showAErr((lang==='cw'?'Lowetsani imelo ndi mawu achinsinsi.':'Please fill in email and password.')); return; }
  const btn=g('a-em-btn'), isReg=!!(btn&&btn.dataset.mode==='register');
  if(btn){btn.disabled=true;btn.textContent=(lang==='cw'?'Chonde dikirani...':'Please wait...');}
  showAErr('');
  if(isReg){
    const p2=val('a-pw2'), nm=val('a-nm').trim();
    if(pass!==p2){ showAErr((lang==='cw'?'Mawu achinsinsi sakufanana.':'Passwords do not match.')); if(btn){btn.disabled=false;btn.textContent=authBtnLabel(true);} return; }
    if(pass.length<6){ showAErr((lang==='cw'?'Mawu achinsinsi ayenera kukhala ndi zilembo zosachepera 6.':'Password must be at least 6 characters.')); if(btn){btn.disabled=false;btn.textContent=authBtnLabel(true);} return; }
    auth.createUserWithEmailAndPassword(email,pass)
      .then(cred=>{
        const user=cred.user;
        const updates=[];
        // Both are best-effort: the account already exists, so a failure here (e.g. too-many-requests) must not
        // strand the user with an error and a half-created account. They can use "Resend" on the verify screen.
        if(nm) updates.push(user.updateProfile({displayName:nm}).catch(()=>{}));
        updates.push(user.sendEmailVerification().catch(()=>{}));
        return Promise.all(updates).then(()=>user);
      })
      .then(user=>{
        // Stay signed in on the verify screen: Resend / "I Have Verified" need auth.currentUser, and
        // onAuthStateChanged already blocks unverified email users from reaching the app.
        if(btn){btn.disabled=false;btn.textContent=authBtnLabel(true);}
        showVerifyScreen(email);
      })
      .catch(e=>{ showAErr(fmtAErr(e.code)); if(btn){btn.disabled=false;btn.textContent=authBtnLabel(true);} });
  } else {
    auth.signInWithEmailAndPassword(email,pass)
      .then(()=>{ if(btn){btn.disabled=false;btn.textContent=authBtnLabel(false);} })
      .catch(e=>{ showAErr(fmtAErr(e.code)); if(btn){btn.disabled=false;btn.textContent=authBtnLabel(false);} });
  }
}
function doFgt(){
  const em=val('fgt-em').trim(); if(!em){showAErr((lang==='cw'?'Lowetsani imelo yanu.':'Enter your email address.'));return;}
  const btn=g('fgt-btn'); if(btn){btn.disabled=true;btn.textContent='Sending...';}
  showAErr('');
  auth.sendPasswordResetEmail(em)
    .then(()=>{ const ok=g('fgt-ok');if(ok)ok.classList.add('on'); if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="send" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> Send Reset Link'; if(window.lucide)lucide.createIcons({nodes:[btn]});} })
    .catch(e=>{ showAErr(fmtAErr(e.code)); if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="send" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> Send Reset Link'; if(window.lucide)lucide.createIcons({nodes:[btn]});} });
}

// ── Email Verification Screen ──
// FIX: Persist cooldown in localStorage so page refresh cannot bypass the 60s rate limit
let _resendCooldown = parseInt(localStorage.getItem('nb_resend_cd')||'0');

function showVerifyScreen(email){
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
  user.reload().then(()=>{
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
  user.sendEmailVerification()
    .then(()=>{
      _resendCooldown=Date.now()+60000;
      localStorage.setItem('nb_resend_cd', String(_resendCooldown));
      const msgEl=g('verify-msg');
      if(msgEl){msgEl.style.color='#C8E6C9';msgEl.textContent=isCW?'Imelo yatumizidwa! Onani inbox yanu.':'Verification email sent! Check your inbox.';}
      if(btn){btn.disabled=false;}
    })
    .catch(e=>{
      const msgEl=g('verify-msg');
      if(msgEl){msgEl.style.color='#FFCDD2';msgEl.textContent=fmtAErr(e.code);}
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
    .catch(e=>{ if(e.code!=='auth/popup-closed-by-user')showAErr(fmtAErr(e.code)); });
}
function sendOTP(){
  const cc=val('a-cc')||'+265', num=val('a-ph').replace(/\s/g,'');
  if(!num){showAErr((lang==='cw'?'Lowetsani nambala yanu ya foni.':'Enter your phone number.'));return;}
  const btn=g('a-otp-btn'); if(btn){btn.disabled=true;btn.textContent='Sending...';}
  showAErr('');
  if(!rcapV) rcapV=new firebase.auth.RecaptchaVerifier('recaptcha-container',{size:'invisible',callback:()=>{}});
  auth.signInWithPhoneNumber(cc+num,rcapV)
    .then(res=>{
      confResult=res;
      show('a-ph-s2'); hide('a-ph-s1');
      const ob0=g('ob0'); if(ob0)ob0.focus();
      if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="smartphone" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> Send OTP'; if(window.lucide)lucide.createIcons({nodes:[btn]});}
      toast((lang==='cw'?'Nambala yotsimikizira yatumizidwa!':'OTP sent!'),'i');
    })
    .catch(e=>{ showAErr(fmtAErr(e.code)); if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="smartphone" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> Send OTP'; if(window.lucide)lucide.createIcons({nodes:[btn]});} if(rcapV){rcapV.clear();rcapV=null;} });
}
function otpN(el,idx){
  el.value=el.value.replace(/\D/g,'');
  if(el.value&&idx<5){const nx=g('ob'+(idx+1));if(nx)nx.focus();}
  if(idx===5&&el.value){const code=[0,1,2,3,4,5].map(i=>(g('ob'+i)||{}).value||'').join('');if(code.length===6)vfyOTP();}
}
function vfyOTP(){
  const code=[0,1,2,3,4,5].map(i=>(g('ob'+i)||{}).value||'').join('');
  if(code.length!==6){showAErr((lang==='cw'?'Lowetsani manambala onse 6.':'Enter all 6 digits.'));return;}
  if(!confResult){showAErr((lang==='cw'?'Nthawi yatha. Bwererani ndipo yesaninso.':'Session expired. Go back and try again.'));return;}
  showAErr('');
  confResult.confirm(code).catch(e=>showAErr(fmtAErr(e.code)));
}
function backPh(){ show('a-ph-s1');hide('a-ph-s2'); confResult=null; if(rcapV){rcapV.clear();rcapV=null;} }

