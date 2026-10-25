// ===============================================
// 5. PIN
// ===============================================

function hasPIN()  { return !!localStorage.getItem('nb_pin'); }
function showPIN(_skipHistoryPush) {
  pinEntry='';
  if(pinMode!=='confirm') pinTmp='';
  show('scr-pin'); hide('scr-auth'); hide('scr-setup'); g('app').classList.add('hide');
  if(!_skipHistoryPush && window._pushOnboardScreen){ _pushOnboardScreen('pin', _pinBackTarget); _pinBackTarget=null; }
  const sub=g('pin-sub');
  const isCW=lang==='cw';
  if(sub) sub.textContent=pinMode==='set'?(isCW?'Sankhani PIN ya manambala 4.':'Choose a 4-digit PIN.'):pinMode==='confirm'?(isCW?'Tsimikizani PIN yanu.':'Confirm your PIN.'):(isCW?'Lowetsani PIN yanu.':'Enter your PIN to continue.');
  const hint=g('pin-hint');
  if(hint) hint.style.display=pinMode==='check'?'flex':'none';
  // Show fingerprint key in keypad when biometrics available
  const bioKey=g('pin-bio-key');
  if(bioKey) bioKey.style.display=hasBio()&&pinMode==='check'?'flex':'none';
  updDots();
  // Run lucide on pin screen
  if(window.lucide) lucide.createIcons({nodes:[g('scr-pin')]});
  // Auto-trigger biometric when checking
  if(pinMode==='check' && hasBio()){
    setTimeout(triggerBio, 400);
  }
}
function hidePIN() { hide('scr-pin'); }
function updDots() { for(let i=0;i<4;i++){const el=g('pd'+i);if(el)el.classList.toggle('on',i<pinEntry.length);} }
async function hashPIN(pin, saltHex){
  const saltBytes = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g).map(h=>parseInt(h,16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt:saltBytes,iterations:100000,hash:'SHA-256'}, keyMaterial, 256);
  const hashHex = Array.from(new Uint8Array(bits)).map(b=>b.toString(16).padStart(2,'0')).join('');
  const saltStr = Array.from(saltBytes).map(b=>b.toString(16).padStart(2,'0')).join('');
  return {hash:hashHex, salt:saltStr};
}
async function verifyPIN(entered, storedRaw){
  if(storedRaw.includes(':')){
    const [salt, hash] = storedRaw.split(':');
    const result = await hashPIN(entered, salt);
    return result.hash === hash;
  }
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(entered+'nb_salt_bajeti'));
  const legacyHash = Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
  return legacyHash === storedRaw;
}
function pinK(k) {
  if(k==='C') pinEntry='';
  else if(k==='B') pinEntry=pinEntry.slice(0,-1);
  else if(pinEntry.length<4) pinEntry+=k;
  updDots();
  if(pinEntry.length===4){
    setTimeout(async()=>{
      const stored=String(localStorage.getItem('nb_pin')||'').trim();
      const entered=String(pinEntry).trim();
      if(pinMode==='check'){
        const match = await verifyPIN(entered, stored);
        if(match){
          if(!stored.includes(':')){ const r=await hashPIN(entered); localStorage.setItem('nb_pin',r.salt+':'+r.hash); }
          hidePIN();
          // bootApp() is a no-op on re-entry (authReg guard). If we already have a connected
          // household (e.g. this was a resume-lock re-check, not first sign-in), just reveal
          // the app again — connectHH() already has a live listener running.
          const hid = hhId || _pendingHid;
          if(!hhId && hid){ hhId=hid; _pendingHid=null; connectHH(hid); }
          else { g('app').classList.remove('hide'); }
        } else { pinEntry=''; updDots(); toast((lang==='cw'?'PIN yolakwika.':'Wrong PIN.'),'e'); }
      } else if(pinMode==='set'){
        pinTmp=pinEntry; pinEntry=''; pinMode='confirm'; showPIN();
      } else if(pinMode==='confirm'){
        if(entered===String(pinTmp).trim()){
          const result=await hashPIN(entered);
          localStorage.setItem('nb_pin',result.salt+':'+result.hash);
          hidePIN(); g('app').classList.remove('hide'); toast(tx().pinOn); pinMode='check'; go('stg');
        } else {
          pinEntry=''; pinMode='set'; showPIN(); toast((lang==='cw'?'Ma-PIN awiriwo sakufanana.':'PINs did not match.'),'e');
        }
      }
    },160);
  }
}
// Google and phone accounts have no password, so the password prompts below can never succeed for them.
function _authProviders(){ return ((curUser&&curUser.providerData)||[]).map(function(p){return p.providerId;}); }
async function _reauthWithoutPassword(){
  if(_authProviders().indexOf('google.com')>=0){
    await curUser.reauthenticateWithPopup(new firebase.auth.GoogleAuthProvider());
    return true;
  }
  return false; // phone-only: no in-app re-auth route
}
async function pinFgtNoPassword(){
  try{
    const ok=await _reauthWithoutPassword();
    if(!ok){ toast(lang==='cw'?'Kuti musinthe PIN, tulukani ndi kulowanso ndi nambala yanu ya foni.':'To reset your PIN, sign out and sign back in with your phone number.','i'); return; }
    localStorage.removeItem('nb_pin');
    hidePIN();
    toast((lang==='cw'?'Zatsimikizika! Ikani PIN yatsopano.':'Verified! Set a new PIN.'),'s');
    setTimeout(()=>{ pinMode='set'; showPIN(); },400);
  }catch(e){ if(!e||e.code!=='auth/popup-closed-by-user') toast(lang==='cw'?'Kutsimikiza kwalephera. Yesaninso.':'Verification failed. Please try again.','e'); }
}
function pinFgt(){
  if(_authProviders().indexOf('password')<0){ pinFgtNoPassword(); return; }
  const box=g('mb-confirm');
  const isCW=lang==='cw';
  const ph=isCW?'Mawu achinsinsi':'Account password';
  const ttl=isCW?'Mwaiwala PIN yanu?':'Forgot your PIN?';
  const sub=isCW?'Lowetsani mawu achinsinsi kuti mutsimikizire, ndiyeno muike PIN yatsopano.':'Enter your account password to verify your identity, then set a new PIN.';
  const cancel=isCW?'Letsani':'Cancel';
  const verify=isCW?'Tsimikizani':'Verify & Reset';
  box.innerHTML='<div style="text-align:center;padding:6px 0 10px">'
    +'<div style="width:52px;height:52px;border-radius:var(--cr);background:#EDE7F6;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">'
    +'<i data-lucide="key" style="width:26px;height:26px;color:#7B1FA2"></i></div>'
    +'<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1rem;margin-bottom:8px">'+ttl+'</div>'
    +'<div style="font-size:.8rem;color:var(--mid);line-height:1.6;margin-bottom:14px">'+sub+'</div>'
    +'<input type="password" class="fi" id="pin-fgt-pw" placeholder="'+ph+'" style="margin-bottom:10px">'
    +'<div id="pin-fgt-err" style="display:none;font-size:.75rem;color:#C62828;margin-bottom:8px;text-align:left"></div>'
    +'</div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="btnG" style="flex:1" onclick="closeM(\'mv-confirm\')">'+cancel+'</button>'
    +'<button class="btnM" style="flex:2" onclick="pinFgtVerify()">'
    +'<i data-lucide="shield-check" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i>'
    +verify+'</button>'
    +'</div>';
  if(window.lucide)lucide.createIcons({nodes:[box]});
  openM('mv-confirm');
  setTimeout(function(){ var pw=g('pin-fgt-pw'); if(pw)pw.focus(); },300);
}
async function pinFgtVerify(){
  const pw=(g('pin-fgt-pw')||{}).value||'';
  const errEl=g('pin-fgt-err');
  if(!pw){ if(errEl){errEl.style.display='block';errEl.textContent='Please enter your password.';} return; }
  if(!curUser||!curUser.email){ closeM('mv-confirm'); toast((lang==='cw'?'Sitinathe kutsimikizira. Chonde lowaninso.':'Cannot verify. Please sign in again.'),'e'); return; }
  try{
    const cred=firebase.auth.EmailAuthProvider.credential(curUser.email,pw);
    await curUser.reauthenticateWithCredential(cred);
    localStorage.removeItem('nb_pin');
    closeM('mv-confirm'); hidePIN();
    toast((lang==='cw'?'Zatsimikizika! Ikani PIN yatsopano.':'Verified! Set a new PIN.'),'s');
    setTimeout(()=>{ pinMode='set'; showPIN(); },400);
  }catch(e){
    if(errEl){
      errEl.style.display='block';
      errEl.textContent=e.code==='auth/wrong-password'||e.code==='auth/invalid-credential'?'Incorrect password. Try again.':'Verification failed: '+(e.message||e.code);
    }
  }
}
function openSetPIN(){ pinMode='set'; showPIN(); }

// -- Biometrics v2: proper WebAuthn create/get flow --
// Requires HTTPS or localhost. On plain file:// the ceremony will fail and the user is told clearly.
// This is a device screen-lock only — Firebase Auth is the real identity layer.
function hasBio(){ return !!localStorage.getItem('nb_bio_credId'); }

async function _bioAvailable(){
  try{
    if(!window.PublicKeyCredential) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  }catch(e){ return false; }
}
function _b64url(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,''); }
function _fromB64url(s){ s=s.replace(/-/g,'+').replace(/_/g,'/'); while(s.length%4)s+='='; return Uint8Array.from(atob(s),c=>c.charCodeAt(0)); }

async function registerBio(){
  const avail = await _bioAvailable();
  if(!avail){ toast((lang==='cw'?'Palibe sensa ya biometric yomwe yapezeka pa chipangizochi.':'No biometric sensor found on this device.'),'e'); return; }
  const isSecure = location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1';
  if(!isSecure){ toast((lang==='cw'?'Kutsegula ndi chala kumafuna adilesi yotetezeka (HTTPS).':'Biometrics needs HTTPS. Host the app on a secure URL to enable fingerprint unlock.'),'e'); return; }
  try{
    const uid = curUser ? curUser.uid : 'local';
    const cred = await navigator.credentials.create({
      publicKey:{
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp:{ name:'Bajeti Yanga', id: location.hostname },
        user:{ id: new TextEncoder().encode(uid), name:(curUser&&curUser.email)||'user', displayName:'Bajeti Yanga' },
        pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],
        authenticatorSelection:{ authenticatorAttachment:'platform', userVerification:'required', residentKey:'discouraged' },
        timeout:60000, attestation:'none'
      }
    });
    localStorage.setItem('nb_bio_credId', _b64url(cred.rawId));
    // WebAuthn platform credentials are bound to the exact origin (scheme +
    // host + port) they were created on. If the app is later opened from a
    // different origin -- a new preview/staging URL, http vs https, a domain
    // change -- the browser will never find this credential again, and every
    // future check will fail with no useful error. Remember the origin here
    // so checkBio() can catch that case explicitly instead of leaving the
    // toggle stuck on "ON" while it silently never works.
    localStorage.setItem('nb_bio_origin', location.origin);
    localStorage.removeItem('nb_bio_fail_count');
    localStorage.removeItem('nb_bio_enabled');
    localStorage.removeItem('nb_bio_token');
    localStorage.removeItem('nb_bio_sig');
    toast((lang==='cw'?'Chala chalembetsedwa':'Fingerprint registered'),'s');
    go('stg');
  }catch(e){
    if(e.name==='NotAllowedError') toast((lang==='cw'?'Kulembetsa kwaletsedwa.':'Registration cancelled.'),'e');
    else toast((lang==='cw'?'Kukhazikitsa kwalephera: ':'Setup failed: ')+(e.message||e.name)+'.','e');
  }
}

async function checkBio(){
  try{
    const credId = localStorage.getItem('nb_bio_credId');
    if(!credId) return false;
    if(!await _bioAvailable()){ localStorage.removeItem('nb_bio_credId'); return false; }
    const isSecure = location.protocol==='https:' || location.hostname==='localhost' || location.hostname==='127.0.0.1';
    if(!isSecure) return false;
    const regOrigin = localStorage.getItem('nb_bio_origin');
    if(regOrigin && regOrigin !== location.origin){
      _clearStaleBio();
      return false;
    }
    await navigator.credentials.get({
      publicKey:{
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: location.hostname,
        allowCredentials:[{ type:'public-key', id:_fromB64url(credId) }],
        userVerification:'required', timeout:30000
      }
    });
    localStorage.removeItem('nb_bio_fail_count');
    return true;
  }catch(e){
    if(e.name!=='NotAllowedError'){
      // NotAllowedError = user cancelled/dismissed — expected. Anything else is worth logging.
      console.warn('[checkBio] Unexpected WebAuthn error:', e.name, e.message);
    }
    return false;
  }
}
// Removes a fingerprint credential that can no longer possibly work (origin
// changed since registration) and tells the user plainly why, instead of
// leaving Settings showing "ON" for something that silently never succeeds.
function _clearStaleBio(){
  ['nb_bio_credId','nb_bio_enabled','nb_bio_token','nb_bio_sig','nb_bio_origin','nb_bio_fail_count'].forEach(k=>localStorage.removeItem(k));
  toast(lang==='cw'
    ? 'Chikhalidwe cha chala chinasintha (app inasamukira ku adilesi ina). Ikanso mu Settings > Security.'
    : "Your fingerprint setup no longer matches this app's address and was reset. Set it up again in Settings > Security.", 'e');
}
// Auto (non-tap) biometric checks stay silent on a single miss so a routine
// app-resume doesn't nag the user. But if it keeps failing, Settings still
// says "ON" while it never actually works. After repeated silent misses,
// say so once with an actionable next step instead of staying quiet forever.
function _bioAutoFailed(){
  const n = (parseInt(localStorage.getItem('nb_bio_fail_count')||'0',10))+1;
  localStorage.setItem('nb_bio_fail_count', String(n));
  if(n===2){
    toast(lang==='cw'
      ? 'Chala sichikugwira pa gadgetli. Gwiritsani PIN, kapena ikanso mu Settings.'
      : "Fingerprint isn't responding on this device. Use your PIN, or set it up again in Settings.", 'e');
  }
}

async function tryBioUnlock(){
  if(!curUser){ toast((lang==='cw'?'Chonde dikirani...':'Please wait, loading...'),'e'); return; }
  const hid = hhId || _pendingHid;
  if(!hid){ toast((lang==='cw'?'Chonde lowetsani PIN yanu.':'Session not ready. Enter PIN.'),'e'); return; }
  toast((lang==='cw'?'Tikudikira chala chanu...':'Waiting for fingerprint...'),'i');
  const ok = await checkBio();
  if(ok){
    hidePIN();
    if(!hhId){ hhId=hid; _pendingHid=null; connectHH(hid); }
    toast((lang==='cw'?'Takulandirani!':'Welcome back!'),'s');
  } else { toast((lang==='cw'?'Biometric yakanika. Gwiritsani ntchito PIN yanu.':'Biometric failed. Use your PIN.'),'e'); }
}

async function triggerBio(){
  if(!curUser) return;
  const hid = hhId || _pendingHid;
  if(!hid) return;
  const ok = await checkBio();
  if(ok){
    hidePIN();
    // If we already have a connected household (resume-lock re-check), just reveal the app —
    // bootApp() is a no-op on re-entry and won't do this for us.
    if(!hhId){ hhId=hid; _pendingHid=null; connectHH(hid); } else { g('app').classList.remove('hide'); }
  } else {
    _bioAutoFailed();
  }
}

// -- Resume-lock: re-require PIN/biometrics after the app has been backgrounded a while --
// Grace period avoids re-locking on brief interruptions like the OS camera sheet used for
// receipt scanning, which also fires a visibilitychange event.
const APP_LOCK_GRACE_MS = 20000;
let _bgAt = 0;
function lockApp(){
  if(!hasPIN()) return;
  if(!hhId) return; // not actually inside a household yet — nothing to lock
  if(g('app').classList.contains('hide')) return; // already locked/on another screen
  pinMode = 'check';
  g('app').classList.add('hide');
  show('scr-pin');
  showPIN();
}
document.addEventListener('visibilitychange', function(){
  if(document.visibilityState === 'hidden'){
    _bgAt = Date.now();
  } else if(document.visibilityState === 'visible'){
    if(_bgAt && (Date.now() - _bgAt) >= APP_LOCK_GRACE_MS) lockApp();
    _bgAt = 0;
  }
});

function removeBio(){
  requestSecurityVerification(function(){
    ['nb_bio_credId','nb_bio_enabled','nb_bio_token','nb_bio_sig','nb_bio_origin','nb_bio_fail_count'].forEach(k=>localStorage.removeItem(k));
    toast((lang==='cw'?'Biometric yachotsedwa.':'Biometrics removed.'),'i');
    go('stg');
  });
}

// -- Security-change verification --
// Anyone holding an unlocked phone could otherwise switch off PIN/biometrics in two taps.
// Require re-proving identity first, using whichever method the user already has set up:
// current PIN > a fresh biometric check > account password, in that order.
let _secVerifyCallback = null;

function requestSecurityVerification(onVerified){
  if(hasPIN()){
    _openSecurityPinVerify(onVerified);
  } else if(hasBio()){
    toast(lang==='cw'?'Tsimikizani ndi chala kapena nkhope...':'Verifying with biometrics...','i');
    checkBio().then(function(ok){
      if(ok){ onVerified(); }
      else { toast(lang==='cw'?'Kutsimikiza kwalephera.':'Verification failed.','e'); }
    });
  } else if(curUser && curUser.email){
    _openSecurityPasswordVerify(onVerified);
  } else {
    onVerified();
  }
}

function _openSecurityPinVerify(onVerified){
  _secVerifyCallback = onVerified;
  const isCW = lang==='cw';
  const box = g('mb-confirm');
  box.innerHTML = '<div style="text-align:center;padding:6px 0 10px">'
    +'<div style="width:52px;height:52px;border-radius:var(--cr);background:#E8F5E9;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">'
    +'<i data-lucide="shield-check" style="width:26px;height:26px;color:#2E7D32"></i></div>'
    +'<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1rem;margin-bottom:8px">'+(isCW?'Tsimikizani PIN yanu':'Confirm your PIN')+'</div>'
    +'<div style="font-size:.8rem;color:var(--mid);line-height:1.6;margin-bottom:14px">'+(isCW?'Kuti musinthe zosankha za chitetezo, lowetsani PIN yanu yamakono.':'To change your security settings, enter your current PIN.')+'</div>'
    +'<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" class="fi" id="sec-pin-verify" placeholder="••••" style="text-align:center;letter-spacing:10px;font-size:1.2rem;margin-bottom:10px">'
    +'<div id="sec-pin-verify-err" style="display:none;font-size:.75rem;color:#C62828;margin-bottom:8px"></div>'
    +'</div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="btnG" style="flex:1" onclick="closeM(\'mv-confirm\')">'+(isCW?'Letsani':'Cancel')+'</button>'
    +'<button class="btnM" style="flex:2" onclick="_secPinVerifySubmit()"><i data-lucide="shield-check" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i>'+(isCW?'Tsimikizani':'Verify')+'</button>'
    +'</div>';
  if(window.lucide) lucide.createIcons({nodes:[box]});
  openM('mv-confirm');
  setTimeout(function(){ const el=g('sec-pin-verify'); if(el) el.focus(); },300);
}

async function _secPinVerifySubmit(){
  const entered = ((g('sec-pin-verify')||{}).value||'').trim();
  const errEl = g('sec-pin-verify-err');
  const stored = String(localStorage.getItem('nb_pin')||'').trim();
  if(entered.length!==4){ if(errEl){errEl.style.display='block';errEl.textContent=lang==='cw'?'Lowetsani manambala anayi.':'Enter your 4-digit PIN.';} return; }
  const match = await verifyPIN(entered, stored);
  if(match){
    closeM('mv-confirm');
    const cb = _secVerifyCallback; _secVerifyCallback = null;
    if(cb) cb();
  } else {
    if(errEl){ errEl.style.display='block'; errEl.textContent=lang==='cw'?'PIN yolakwika.':'Incorrect PIN.'; }
  }
}

async function _secVerifyNoPassword(onVerified){
  try{
    const ok=await _reauthWithoutPassword();
    if(!ok){ toast(lang==='cw'?'Tulukani ndi kulowanso ndi nambala yanu ya foni kuti musinthe zosankha za chitetezo.':'To change security settings, sign out and sign back in with your phone number.','i'); return; }
    if(onVerified) onVerified();
  }catch(e){ if(!e||e.code!=='auth/popup-closed-by-user') toast(lang==='cw'?'Kutsimikiza kwalephera. Yesaninso.':'Verification failed. Please try again.','e'); }
}
function _openSecurityPasswordVerify(onVerified){
  if(_authProviders().indexOf('password')<0){ _secVerifyNoPassword(onVerified); return; }
  _secVerifyCallback = onVerified;
  const isCW = lang==='cw';
  const box = g('mb-confirm');
  box.innerHTML = '<div style="text-align:center;padding:6px 0 10px">'
    +'<div style="width:52px;height:52px;border-radius:var(--cr);background:#EDE7F6;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">'
    +'<i data-lucide="key" style="width:26px;height:26px;color:#7B1FA2"></i></div>'
    +'<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1rem;margin-bottom:8px">'+(isCW?'Tsimikizani ndi mawu achinsinsi':'Confirm with your password')+'</div>'
    +'<div style="font-size:.8rem;color:var(--mid);line-height:1.6;margin-bottom:14px">'+(isCW?'Kuti musinthe zosankha za chitetezo, lowetsani mawu achinsinsi a akaunti yanu.':'To change your security settings, enter your account password.')+'</div>'
    +'<input type="password" class="fi" id="sec-pw-verify" placeholder="'+(isCW?'Mawu achinsinsi':'Password')+'" style="margin-bottom:10px">'
    +'<div id="sec-pw-verify-err" style="display:none;font-size:.75rem;color:#C62828;margin-bottom:8px;text-align:left"></div>'
    +'</div>'
    +'<div style="display:flex;gap:8px">'
    +'<button class="btnG" style="flex:1" onclick="closeM(\'mv-confirm\')">'+(isCW?'Letsani':'Cancel')+'</button>'
    +'<button class="btnM" style="flex:2" onclick="_secPwVerifySubmit()"><i data-lucide="shield-check" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i>'+(isCW?'Tsimikizani':'Verify')+'</button>'
    +'</div>';
  if(window.lucide) lucide.createIcons({nodes:[box]});
  openM('mv-confirm');
  setTimeout(function(){ const el=g('sec-pw-verify'); if(el) el.focus(); },300);
}

async function _secPwVerifySubmit(){
  const pw = (g('sec-pw-verify')||{}).value||'';
  const errEl = g('sec-pw-verify-err');
  if(!pw){ if(errEl){errEl.style.display='block';errEl.textContent=lang==='cw'?'Lowetsani mawu achinsinsi.':'Please enter your password.';} return; }
  if(!curUser||!curUser.email){ closeM('mv-confirm'); toast(lang==='cw'?'Kutsimikiza kwalephera. Lowaninso.':'Cannot verify. Please sign in again','e'); return; }
  try{
    const cred=firebase.auth.EmailAuthProvider.credential(curUser.email,pw);
    await curUser.reauthenticateWithCredential(cred);
    closeM('mv-confirm');
    const cb = _secVerifyCallback; _secVerifyCallback = null;
    if(cb) cb();
  }catch(e){
    if(errEl){
      errEl.style.display='block';
      errEl.textContent = e.code==='auth/wrong-password'||e.code==='auth/invalid-credential' ? (lang==='cw'?'Mawu achinsinsi olakwika.':'Incorrect password. Try again.') : (lang==='cw'?'Kutsimikiza kwalephera: ':'Verification failed: ')+(e.message||e.code);
    }
  }
}

// -- Delete Account --
function openDeleteAccount(){
  if(!curUser){toast((lang==='cw'?'Simunalowe mu akaunti.':'Not signed in.'),'e');return;}
  const isCWdel = lang === 'cw';
  const firstName = curUser.displayName ? esc(curUser.displayName.split(' ')[0]) : (isCWdel ? 'akaunti yanu' : 'your account');
  // Step 1 — warning modal
  const box = g('mb-confirm');
  box.innerHTML = ''
    +'<div style="text-align:center;padding:10px 0 6px">'
    +'<div style="width:56px;height:56px;border-radius:var(--cr);background:#FFEBEE;display:flex;align-items:center;justify-content:center;margin:0 auto 12px">'
    +'<i data-lucide="trash-2" style="width:28px;height:28px;color:#C62828"></i></div>'
    +'<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1.05rem;color:#C62828;margin-bottom:8px">'+(isCWdel?'Muchotse Akaunti?':'Delete Account?')+'</div>'
    +'<div style="font-size:.82rem;color:var(--mid);line-height:1.6;margin-bottom:4px">'+(isCWdel?'Mukufuna kuchotsa akaunti ya <strong style="color:var(--ink)">'+firstName+'</strong> ndi data yonse ya nyumba.':'You are about to delete <strong style="color:var(--ink)">'+firstName+' account</strong> and all household data.')+'</div>'
    +'<div style="background:#FFF3E0;border:1.5px solid #FFB74D;border-radius:var(--cr-md);padding:9px 12px;margin:10px 0;font-size:.76rem;color:#E65100;line-height:1.6;text-align:left">'
    +'<i data-lucide="alert-triangle" style="width:13px;height:13px;vertical-align:middle;margin-right:4px"></i>'
    +(isCWdel?'Data yanu isungidwa kwa <strong>masiku 30</strong>. Lowani m\'pulogalamuyi mkati mwa masiku 30 kuti muibweze. Atatha, imatha kwathunthu.':'Your data is kept for <strong>30 days</strong>. Log back in within 30 days to restore it. After that, it is gone permanently.')
    +'</div></div>'
    +'<div style="display:flex;gap:10px;margin-top:4px">'
    +'<button class="btnG" style="flex:1" onclick="closeM(\'mv-confirm\')">'+(isCWdel?'Ayi, sungani':'No, keep it')+'</button>'
    +'<button style="flex:1;background:linear-gradient(135deg,#C62828,#E53935);color:#fff;border:none;border-radius:var(--cr-md);padding:12px;font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.85rem;cursor:pointer;box-shadow:0 4px 12px rgba(198,40,40,.3)" onclick="closeM(\'mv-confirm\');_confirmDeleteAccount()">'+(isCWdel?'Inde, Chotsani!':'Yes, Delete!')+'</button>'
    +'</div>';
  if(window.lucide) lucide.createIcons({nodes:[box]});
  openM('mv-confirm');
}

function _confirmDeleteAccount(){
  if(!curUser){toast((lang==='cw'?'Simunalowe mu akaunti.':'Not signed in.'),'e');return;}
  const uid = curUser.uid;
  const FV = firebase.firestore.FieldValue;
  // One atomic batch: either the household and the user doc are both updated or neither is, so a failure
  // can't leave a household scheduled for deletion while the user doc says nothing.
  const batch = db.batch();
  // Only the household OWNER deleting their account schedules the whole
  // shared household for deletion. A non-owner member deleting their own
  // account should just leave the household (rules now enforce this too —
  // deletedAt/deletedBy/restoreBefore are owner-only fields).
  const isOwnerHere = hhId && lHHDoc && lHHDoc.owner === uid;
  if(hhId && isOwnerHere){
    batch.update(db.collection('households').doc(hhId),{
      deletedAt:FV.serverTimestamp(),
      deletedBy:uid,
      restoreBefore:new Date(Date.now()+30*24*60*60*1000).toISOString()
    });
  } else if(hhId){
    batch.update(db.collection('households').doc(hhId),{ memberUids: FV.arrayRemove(uid) });
  }
  batch.update(db.collection('users').doc(uid),{
    deletedAt:FV.serverTimestamp(),
    pendingDeletion:true,
    // Remove this household from ownedHouseholds so the count stays accurate
    ownedHouseholds:hhId?FV.arrayRemove(hhId):FV.delete()
  });
  const promises=[batch.commit()];
  Promise.all(promises).then(()=>{
    // Detach listeners only now that the deletion is committed (they used to be torn down first, so a failed write left a dead app).
    if(unsub){unsub();unsub=null;}
    if(unsubHH){unsubHH();unsubHH=null;}
    if(unsubJoinBadge){unsubJoinBadge();unsubJoinBadge=null;}
    toast(lang==='cw'?'Akaunti yanu idzachotsedwa. Mutha kuibwezeretsa mkati mwa masiku 30.':'Account scheduled for deletion. You have 30 days to restore it.','i');
    setTimeout(()=>{
      chatHistory=[];
      // FIX: do NOT delete the Auth user here — doing so made the "30 days to
      // restore" promise impossible (no account left to log back into). Sign
      // out instead; bootApp() detects pendingDeletion on next login and offers
      // a Restore option (see showAccountRestorePrompt / restoreAccount).
      auth.signOut().catch(()=>{});
      localStorage.removeItem('nb_household');
      localStorage.removeItem('nb_uid');
      localStorage.removeItem('nb_pin');
      ['nb_bio_credId','nb_bio_enabled','nb_bio_token','nb_bio_sig','nb_bio_cred'].forEach(k=>localStorage.removeItem(k));
      hhId=null; lCfg=JSON.parse(JSON.stringify(DEF_CFG)); lPx=[];
      show('scr-auth');
    },2000);
  }).catch(()=>toast((lang==='cw'?'Sitinathe kukonza kuchotsa akaunti. Onani intaneti yanu ndipo yesaninso.':'Could not schedule deletion. Check your connection and try again.'),'e'));
}
function removePIN(){
  requestSecurityVerification(function(){
    localStorage.removeItem('nb_pin');
    toast(tx().pinOff);
    go('stg');
  });
}

