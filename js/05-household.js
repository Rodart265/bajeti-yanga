// ===============================================
// 7. FIREBASE / HOUSEHOLD
// ===============================================

let _authUnsubscribe = null;

var _pendingHid = null;
var _pendingRestoreHid = null;

function showWelcome(hid, hhName){
  _pendingHid = hid;
  const firstName = curUser&&curUser.displayName ? curUser.displayName.split(' ')[0] : null;
  const nameEl = g('welcome-hh-name');
  const subEl = g('welcome-hh-sub');
  const subMain = g('welcome-sub');
  const titleEl = g('welcome-title');
  const avatarEl = g('welcome-avatar');
  const btnLabel = g('welcome-btn-label');
  if(nameEl) nameEl.textContent = hhName || 'Your Household';
  if(subEl) subEl.textContent = hid ? hid : 'Your household';
  if(subMain) subMain.textContent = firstName ? 'Good to see you again, '+firstName+'.' : 'Good to see you again.';
  if(titleEl) titleEl.textContent = firstName ? 'Welcome back, '+firstName+'!' : 'Welcome back!';
  if(avatarEl) avatarEl.textContent = firstName ? firstName[0].toUpperCase() : '?';
  if(btnLabel) btnLabel.textContent = firstName ? 'Continue as '+firstName : 'Continue';
  hide('scr-auth'); hide('scr-setup'); hide('scr-pin');
  g('app').classList.add('hide');
  show('scr-welcome');
  if(window._pushOnboardScreen) _pushOnboardScreen('welcome');
  if(window.lucide) lucide.createIcons({nodes:[g('scr-welcome')]});
  // Auto-trigger biometrics right away so returning users don't need an extra tap first.
  // Falls through silently to the normal "Continue" tap -> PIN screen if it fails/cancels.
  if(hasPIN() && hasBio()){
    setTimeout(triggerBio, 500);
  }
}

function welcomeContinue(){
  if(!_pendingHid) return;
  const hid = _pendingHid;
  hide('scr-welcome');
  if(hasPIN()){
    // Keep _pendingHid set — triggerBio() (fired by showPIN below) needs it.
    // It gets cleared once the PIN/biometric flow actually consumes it.
    _pinBackTarget='welcome';
    g('app').classList.add('hide'); show('scr-pin'); showPIN();
  } else {
    _pendingHid = null;
    hide('scr-auth'); hide('scr-setup'); hide('scr-pin'); g('app').classList.remove('hide'); connectHH(hid);
  }
}

function welcomeSwitch(){
  hide('scr-welcome');
  _pendingHid = null;
  show('scr-setup');
}


// Deep link join code — extracted from ?join= URL parameter on boot
let _pendingJoinCode = null;

// Cache-first read with a server fallback. Firestore's default .get()
// behavior is "try the server first, fall back to cache only once the
// network attempt fails/times out" — on a slow or offline connection that
// makes every boot wait out a network timeout before it ever looks at data
// that's already sitting on the device. Trying the cache first means a
// returning user unblocks instantly; a brand-new login (nothing cached yet)
// still falls through to the normal server request.
function fastGet(ref){
  return ref.get({source:'cache'}).catch(()=>ref.get());
}

function bootApp(){
  // Extract ?join= deep link parameter before auth flow clears the URL
  if(!_pendingJoinCode){
    try {
      const params = new URLSearchParams(window.location.search);
      const joinParam = params.get('join');
      if(joinParam && joinParam.trim()){
        _pendingJoinCode = joinParam.trim().toUpperCase();
        // Clean the URL so it doesn't persist on refresh
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    } catch(e){ /* URL API unavailable — ignore */ }
  }
  loadChatHistory();
  if(authReg)return;
  authReg=true;
  // Unsubscribe any previous listener before attaching a new one
  if(_authUnsubscribe){ _authUnsubscribe(); _authUnsubscribe=null; }
  _authUnsubscribe = auth.onAuthStateChanged(user=>{
    if(user){
      curUser=user;
      // Gate: if email user has not verified yet, show verify screen
      const isEmailProvider = user.providerData && user.providerData.length > 0 && user.providerData[0].providerId === 'password';
      if(isEmailProvider && !user.emailVerified){
        hide('scr-auth'); hide('scr-setup'); hide('scr-pin'); hide('scr-welcome');
        g('app').classList.add('hide');
        showVerifyScreen(user.email||'');
        return;
      }
      fastGet(db.collection('users').doc(user.uid))
        .then(doc=>{
          // Account-deletion grace period: offer restore instead of loading the app
          if(doc.exists && doc.data().pendingDeletion){
            const _ud = doc.data();
            const _delAt = _ud.deletedAt && _ud.deletedAt.toDate ? _ud.deletedAt.toDate() : null;
            const restoreBefore = _ud.restoreBefore ? new Date(_ud.restoreBefore) : (_delAt ? new Date(_delAt.getTime()+30*24*60*60*1000) : null);
            const stillRecoverable = !restoreBefore || restoreBefore > new Date();
            showAccountRestorePrompt(user, Object.assign({}, _ud, {restoreBefore: restoreBefore ? restoreBefore.toISOString() : null}), stillRecoverable);
            return;
          }
          // Check if user has a pending join request from a previous session
          const pendingCode = localStorage.getItem('nb_pending_join');
          if(pendingCode){
            // Verify they're still not a member — if approved since, connect normally
            db.collection('households').doc(pendingCode).get().then(function(snap){
              if(snap.exists && snap.data().memberUids && snap.data().memberUids.includes(user.uid)){
                // Already approved — clear pending and connect
                localStorage.removeItem('nb_pending_join');
                localStorage.setItem('nb_household', pendingCode);
                _claimMembership(pendingCode);
                hide('scr-auth'); hide('scr-pin'); g('app').classList.add('hide'); show('scr-setup');
                // Short delay then connect
                setTimeout(function(){ hide('scr-setup'); g('app').classList.remove('hide'); connectHH(pendingCode); }, 300);
              } else {
                // Still pending — restore waiting screen and resume polling
                hide('scr-auth'); hide('scr-pin'); g('app').classList.add('hide'); show('scr-setup');
                _restoreWaitingScreen(pendingCode);
              }
            }).catch(function(){
              // Network error — restore waiting screen anyway
              hide('scr-auth'); hide('scr-pin'); g('app').classList.add('hide'); show('scr-setup');
              _restoreWaitingScreen(pendingCode);
            });
            return;
          }
          if(doc.exists&&doc.data().householdId){
            // Cache owned households for owner detection in old households without owner field
            window._userOwnedHouseholds = doc.data().ownedHouseholds || [];
            const hid=doc.data().householdId;
            localStorage.setItem('nb_household',hid);
            // Show welcome screen - let user choose to continue or switch household
            const hhName = doc.data().householdName || null;
            if(hhName){
              showWelcome(hid, hhName);
            } else {
              // Fetch household name from Firestore for display
              fastGet(db.collection('households').doc(hid)).then(hhDoc=>{
                const name = hhDoc.exists ? (hhDoc.data().name||'Your Household') : 'Your Household';
                showWelcome(hid, name);
              }).catch(()=>showWelcome(hid, 'Your Household'));
            }
          } else {
            hide('scr-auth'); hide('scr-pin'); g('app').classList.add('hide'); show('scr-setup');
            // Pre-fill join code from QR deep link if present
            if(_pendingJoinCode){
              setTimeout(function(){
                renderSetupJoinForm();
                const joinInp = g('join-code');
                if(joinInp){
                  joinInp.value = _pendingJoinCode;
                  // Scroll to and highlight the join section
                  joinInp.scrollIntoView({behavior:'smooth', block:'center'});
                  joinInp.focus();
                  // Show a toast so the user knows what happened
                  toast(lang==='cw'?'Kodi yolowera yatsegulidwa kuchokera ku QR code.':'Join code loaded from QR code. Tap "Join This Household" to continue.','i');
                }
                _pendingJoinCode = null;
              }, 400);
            }
          }
        })
        .catch(()=>{
          hide('scr-auth'); hide('scr-pin'); g('app').classList.add('hide'); show('scr-setup');
          if(_pendingJoinCode){
            setTimeout(function(){
              renderSetupJoinForm();
              const joinInp = g('join-code');
              if(joinInp){ joinInp.value = _pendingJoinCode; joinInp.focus(); }
              _pendingJoinCode = null;
            }, 400);
          }
        });
    } else {
      curUser=null;
      stopChipListener();
      g('app').classList.add('hide'); hide('scr-setup'); hide('scr-pin'); show('scr-auth');
    }
  });
}

function setupErr(msg){ renderErrBox('setup-err',msg); }

// ── Account-deletion restore flow (see Bug 3 fix: Auth user is no longer
// permanently deleted at deletion time, so this prompt can actually restore) ──
function showAccountRestorePrompt(user, userData, stillRecoverable){
  hide('scr-auth'); hide('scr-pin'); hide('scr-welcome'); g('app').classList.add('hide');
  const isCW = lang === 'cw';
  show('scr-setup');
  _pendingRestoreHid = userData.householdId || null;
  // Render into the dedicated join card. (document.querySelector('.setup-card') used to match the "Just Me" card,
  // whose onclick is createHHSolo(), so tapping Restore / Sign Out also tried to create a new household.)
  const box = g('setup-card-join');
  if(!box) return;
  const _soloCard = g('setup-card-solo'); if(_soloCard) _soloCard.style.display='none';
  const _heading = g('setup-heading'); if(_heading) _heading.style.display='none';
  box.style.display='';
  if(stillRecoverable){
    const daysLeft = userData.restoreBefore ? Math.max(0, Math.ceil((new Date(userData.restoreBefore)-new Date())/86400000)) : 30;
    box.innerHTML = '<div style="text-align:center;padding:10px 0">'
      +'<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1.05rem;margin-bottom:8px">'+(isCW?'Bwezeretsani Akaunti?':'Restore Your Account?')+'</div>'
      +'<div style="font-size:.8rem;color:var(--mid);line-height:1.6;margin-bottom:16px">'+(isCW?'Akaunti yanu idzachotsedwa kwathunthu pakapita masiku '+daysLeft+'. Mukufuna kuibwezera?':'Your account is scheduled for deletion in '+daysLeft+' day'+(daysLeft===1?'':'s')+'. Want to restore it?')+'</div>'
      +'<button class="btnM" style="width:100%;margin-bottom:8px" onclick="restoreAccount()">'+(isCW?'Inde, Bwezeretsani':'Yes, Restore My Account')+'</button>'
      +'<button class="btnG" style="width:100%" onclick="auth.signOut()">'+(isCW?'Ayi, Siyani':'No, Sign Out')+'</button>'
      +'</div>';
  } else {
    box.innerHTML = '<div style="text-align:center;padding:10px 0">'
      +'<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1.05rem;margin-bottom:8px">'+(isCW?'Akaunti Yachotsedwa':'Account No Longer Recoverable')+'</div>'
      +'<div style="font-size:.8rem;color:var(--mid);line-height:1.6;margin-bottom:16px">'+(isCW?'Nthawi ya masiku 30 yathera. Akaunti iyi sichingathe kubwezeretsedwanso.':'The 30-day recovery window has passed. This account can no longer be restored.')+'</div>'
      +'<button class="btnG" style="width:100%" onclick="auth.signOut()">'+(isCW?'Tsekani':'Close')+'</button>'
      +'</div>';
  }
  if(window.lucide) lucide.createIcons({nodes:[box]});
}

function restoreAccount(){
  const user = auth.currentUser;
  if(!user){ toast('Not signed in.','e'); return; }
  const uid = user.uid, hid = _pendingRestoreHid, FV = firebase.firestore.FieldValue;
  const userUpd = {pendingDeletion:false, deletedAt:null, restoreBefore:null};
  let step = Promise.resolve();
  let _needsReapproval = false;
  if(hid){
    const hhRef = db.collection('households').doc(hid);
    step = hhRef.get().catch(e=>{ if(e && e.code==='permission-denied') _needsReapproval = true; return null; }).then(snap=>{
      const d = snap && snap.exists ? snap.data() : null;
      if(!d) return null;
      if(d.owner === uid){
        // Owner: un-schedule the household and put it back in ownedHouseholds (deletion removed it).
        userUpd.ownedHouseholds = FV.arrayUnion(hid);
        return hhRef.update({deletedAt:null, deletedBy:null, restoreBefore:null});
      }
      // Member: deletion only removed them from memberUids. The rules only let the OWNER add members, so this normally
      // fails; remember that so we tell the person the truth below instead of a plain "Account restored!".
      return hhRef.update({memberUids: FV.arrayUnion(uid)}).catch(()=>{ _needsReapproval = true; });
    });
  }
  step.then(()=>db.collection('users').doc(uid).update(userUpd)).then(()=>{
    if(_needsReapproval) toast(lang==='cw'?'Akaunti yabwezeretsedwa. Mwachotsedwa mu nyumbayi. Lowetsani kodi kuti mupemphe kulowanso.':'Account restored, but you are no longer in your household. Enter the household code to ask the owner to approve you again.','i');
    else toast(lang==='cw'?'Akaunti yabwezeretsedwa!':'Account restored!','s');
    _pendingRestoreHid=null;
    authReg=false; bootApp();
  }).catch(()=>toast('Restore failed. Check your connection.','e'));
}

// Guards createHHSolo()/createHH()/joinHH() against double-submission: these three
// are the only setup actions that keep their button on screen while awaiting a
// Firestore round-trip, so a slow network + a second tap could otherwise create
// two households or send two join requests. Locked while any one is in flight;
// unlocked on error/no-op paths (success navigates away, so re-enabling there is
// harmless but not required — done anyway so a later return to this screen, e.g.
// via switchHousehold(), never finds stale disabled buttons).
let _setupBusy = false;
function _setupLock(){
  _setupBusy = true;
  document.querySelectorAll('#scr-setup button, #scr-setup [onclick]').forEach(el=>{
    el.disabled = true; el.style.pointerEvents = 'none'; el.style.opacity = '.55';
  });
}
function _setupUnlock(){
  _setupBusy = false;
  document.querySelectorAll('#scr-setup button, #scr-setup [onclick]').forEach(el=>{
    el.disabled = false; el.style.pointerEvents = ''; el.style.opacity = '';
  });
}

// ── Setup screen: "With Family / Partner" card, two-step flow ──────────────
// Step 1 (default): choice between Create New / Join Existing.
// Step 2 (after tapping Join Existing): code input + QR scan + submit, with
// a Back button. Both steps render into #setup-card-join; the actual backend
// calls (createHH/joinHH/openQRScanner) are unchanged, only the surrounding
// markup/interaction is new.
function renderSetupJoinChoice(){
  const box = g('setup-card-join');
  if(!box) return;
  const isCW = lang === 'cw';
  box.innerHTML =
    '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">'
      +'<div style="width:44px;height:44px;background:rgba(255,255,255,.18);border-radius:var(--cr);display:flex;align-items:center;justify-content:center;flex-shrink:0">'
        +'<i data-lucide="users" style="color:#fff;width:22px;height:22px"></i>'
      +'</div>'
      +'<div style="flex:1">'
        +'<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.95rem;color:#fff;margin-bottom:2px">'+(isCW?'Ndi Banja / Mnzanu':'With Family / Partner')+'</div>'
        +'<div style="font-size:.73rem;color:rgba(255,255,255,.65);line-height:1.4">'+(isCW?'Pangani nyumba yatsopano kapena lowani imene mwapatsidwa.':'Create a new household or join one that was shared with you.')+'</div>'
      +'</div>'
    +'</div>'
    +'<div style="display:flex;gap:8px">'
      +'<button class="setup-btn" style="flex:1;margin-top:0;padding:11px 8px;font-size:.82rem" onclick="createHH()">'
        +'<i data-lucide="plus-circle" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i>'+(isCW?'Pangani Yatsopano':'Create New')+'</button>'
      +'<button class="setup-btn outline" style="flex:1;margin-top:0;padding:11px 8px;font-size:.82rem" onclick="renderSetupJoinForm()">'
        +'<i data-lucide="log-in" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i>'+(isCW?'Lowani Ina':'Join Existing')+'</button>'
    +'</div>';
  setupErr('');
  if(window.lucide) lucide.createIcons({nodes:[box]});
}

function renderSetupJoinForm(){
  const box = g('setup-card-join');
  if(!box) return;
  const isCW = lang === 'cw';
  box.innerHTML =
    '<button onclick="renderSetupJoinChoice()" style="background:none;border:none;color:rgba(255,255,255,.75);font-size:.78rem;display:flex;align-items:center;gap:3px;margin-bottom:14px;cursor:pointer;padding:0;font-family:inherit">'
      +'<i data-lucide="chevron-left" style="width:14px;height:14px"></i>'+(isCW?'Bwerera':'Back')+'</button>'
    +'<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">'
      +'<div style="width:44px;height:44px;background:rgba(255,255,255,.18);border-radius:var(--cr);display:flex;align-items:center;justify-content:center;flex-shrink:0">'
        +'<i data-lucide="log-in" style="color:#fff;width:22px;height:22px"></i>'
      +'</div>'
      +'<div style="flex:1">'
        +'<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.95rem;color:#fff;margin-bottom:2px">'+(isCW?'Lowani mu Nyumba':'Join a Household')+'</div>'
        +'<div style="font-size:.73rem;color:rgba(255,255,255,.65);line-height:1.4">'+(isCW?'Lowetsani kodi imene mwini nyumba wakupatsani.':'Enter the code your household owner shared with you.')+'</div>'
      +'</div>'
    +'</div>'
    +'<div style="display:flex;gap:8px;margin-bottom:12px">'
      +'<input class="setup-in" id="join-code" placeholder="'+(isCW?'Bzalani kodi ya nyumba…':'Paste household code…')+'" maxlength="20" style="flex:1;margin-bottom:0">'
      +'<button onclick="openQRScanner()" style="flex-shrink:0;width:48px;height:48px;background:rgba(255,255,255,.14);border:1.5px solid rgba(255,255,255,.22);border-radius:var(--cr-md);display:flex;align-items:center;justify-content:center;cursor:pointer" title="Scan QR Code">'
        +'<i data-lucide="scan-line" style="width:20px;height:20px;color:#fff"></i></button>'
    +'</div>'
    +'<button class="setup-btn" style="width:100%;margin-top:0;padding:13px;display:flex;align-items:center;justify-content:center;gap:6px" onclick="joinHH()">'
      +'<i data-lucide="arrow-right-circle" style="width:16px;height:16px"></i>'+(isCW?'Lowani Nyumba Iyi':'Join This Household')+'</button>';
  setupErr('');
  if(window.lucide) lucide.createIcons({nodes:[box]});
  box.classList.add('fade-in');
  setTimeout(function(){ const inp=g('join-code'); if(inp) inp.focus(); }, 150);
}

// Restores the "With Family / Partner" card to its default choice state and
// un-hides the solo card/heading — used whenever the setup screen is shown
// fresh (not while a join request is pending, since that flow renders its own
// waiting screen immediately after and handles solo/heading visibility itself).
function resetSetupJoinCard(){
  if(localStorage.getItem('nb_pending_join')) return;
  const soloCard = g('setup-card-solo'); if(soloCard) soloCard.style.display='';
  const heading = g('setup-heading'); if(heading) heading.style.display='';
  renderSetupJoinChoice();
}

// Premium lives on each household's own doc/config, not on the user account, so
// "premium unlocks unlimited households" has to check every household this user
// owns, not whichever one happens to be connected right now. Resolves true if the
// user is still under the free cap, or if ANY owned household carries premium.
function _canCreateAnotherHousehold(ownedHH){
  if(ownedHH.length < HOUSEHOLD_LIMITS.free) return Promise.resolve(true);
  return Promise.all(ownedHH.map(hid=>db.collection('households').doc(hid).get().catch(()=>null)))
    .then(snaps=>snaps.some(s=>{
      if(!s||!s.exists) return false;
      const dd=s.data()||{};
      return !!(dd.isPremium || (dd.config&&dd.config.isPremium));
    }));
}

function createHHSolo(){
  if(!curUser){setupErr('Not signed in.');return;}
  if(_setupBusy) return;
  _setupLock();
  setDot('spin'); setupErr('');
  // Check household limit using HOUSEHOLD_LIMITS config
  db.collection('users').doc(curUser.uid).get().then(uDoc=>{
    const ownedHH = uDoc.exists && uDoc.data().ownedHouseholds ? uDoc.data().ownedHouseholds : [];
    return _canCreateAnotherHousehold(ownedHH).then(allowed=>{
    if(!allowed){
      setDot('off');
      const isCW = lang === 'cw';
      setupErr(isCW?'Ma nyumba a pa ntchito auluka ('+HOUSEHOLD_LIMITS.free+'). Sinthani imodzi kukhala Premium, kapena posani nyumba.':'Free accounts can only have '+HOUSEHOLD_LIMITS.free+' households. Upgrade one of your households to Premium for unlimited, or delete one first.');
      setTimeout(()=>showPremiumPage(), 1500);
      return;
    }
    const code=randCode();
    const soloCfg=JSON.parse(JSON.stringify(DEF_CFG));
    const nm=(curUser&&(curUser.displayName||curUser.email||'').split('@')[0])||'Me';
    soloCfg.users=[{id:'u1',name:nm,color:'#7B1FA2'}];
    soloCfg.solo=true;
    return db.collection('households').doc(code)
      .set(_newHouseholdDoc(uDoc.exists?uDoc.data():null, soloCfg, {solo:true}))
      .then(()=>{
        return db.collection('users').doc(curUser.uid).set({
          householdId:code,
          displayName:curUser.displayName||curUser.email||'Me',
          ownedHouseholds:firebase.firestore.FieldValue.arrayUnion(code)
        },{merge:true});
      })
      .then(()=>{ localStorage.setItem('nb_household',code); localStorage.setItem('nb_uid','u1'); hide('scr-setup'); g('app').classList.remove('hide'); connectHH(code); toast(lang==='cw'?'Takulandirani! Muli wokonzeka.':'Welcome! You\'re all set.','s'); })
      .catch(e=>{ setDot('off'); setupErr('Error: '+e.message); });
    });
  }).catch(e=>{ setDot('off'); setupErr('Error: '+e.message); })
  .finally(()=>{ _setupUnlock(); });
}

function createHH(){
  if(!curUser){setupErr('Not signed in.');return;}
  if(_setupBusy) return;
  _setupLock();
  setDot('spin'); setupErr('');
  // Check household limit using HOUSEHOLD_LIMITS config
  db.collection('users').doc(curUser.uid).get().then(uDoc=>{
    const ownedHH = uDoc.exists && uDoc.data().ownedHouseholds ? uDoc.data().ownedHouseholds : [];
    return _canCreateAnotherHousehold(ownedHH).then(allowed=>{
    if(!allowed){
      setDot('off');
      const isCW = lang === 'cw';
      setupErr(isCW?'Ma nyumba a pa ntchito auluka ('+HOUSEHOLD_LIMITS.free+'). Sinthani imodzi kukhala Premium, kapena posani nyumba.':'Free accounts can only have '+HOUSEHOLD_LIMITS.free+' households. Upgrade one of your households to Premium for unlimited, or delete one first.');
      setTimeout(()=>showPremiumPage(), 1500);
      return;
    }
    const code=randCode();
    return db.collection('households').doc(code)
      .set(_newHouseholdDoc(uDoc.exists?uDoc.data():null, JSON.parse(JSON.stringify(DEF_CFG))))
      .then(()=>{
        return db.collection('users').doc(curUser.uid).set({
          householdId:code,
          displayName:curUser.displayName||curUser.email||'User',
          ownedHouseholds:firebase.firestore.FieldValue.arrayUnion(code)
        },{merge:true});
      })
      .then(()=>{ localStorage.setItem('nb_household',code); localStorage.setItem('nb_uid','u1'); hide('scr-setup'); g('app').classList.remove('hide'); connectHH(code); toast(lang==='cw'?'Nyumba yopangidwa!':'Household created!','s'); })
      .catch(e=>{ setDot('off'); setupErr('Error: '+e.message); });
    });
  }).catch(e=>{ setDot('off'); setupErr('Error: '+e.message); })
  .finally(()=>{ _setupUnlock(); });
}

// Restores the waiting-for-approval screen after app reopen during a pending join request
// ── Setup screen: "Waiting for Approval" state, adapted from the join-flow
// prototype. Text on this card sits directly on the translucent purple glass
// (not on a light panel), so it needs to be white/light — the previous version
// used var(--mid)/var(--border), which are dark-on-light tokens meant for the
// household-code pill below, and were basically unreadable here. Shared by
// joinHH() (just submitted) and _restoreWaitingScreen() (resumed after reopen).
function renderSetupJoinWaiting(code, justSubmitted){
  const setupBox = g('setup-card-join') || document.querySelector('.setup-card') || document.querySelector('.auth-box');
  if(!setupBox) return;
  const soloCard = g('setup-card-solo'); if(soloCard) soloCard.style.display='none';
  const heading = g('setup-heading'); if(heading) heading.style.display='none';
  const isCW = lang === 'cw';
  const subText = justSubmitted
    ? (isCW?'Pempho lanu latumizidwa. Mudziwa mukavomelezwa.':'Your request has been sent. You\'ll connect automatically once the owner approves.')
    : (isCW?'Pempho lanu litumizidwa. Mudziwa mukavomelezwa.':'Your request is still pending. You\'ll connect automatically once the owner approves.');
  setupBox.innerHTML =
    '<div id="pending-approval-box" style="text-align:center;padding:4px 0 8px">'
    +'<div style="margin:-2px -18px 20px;padding:32px 20px 28px;background:linear-gradient(145deg,#4A148C,#6A1B9A,#8E24AA);border-radius:0 0 24px 24px;position:relative;overflow:hidden">'
    +'<div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.06)"></div>'
    +'<div style="width:72px;height:72px;border-radius:50%;border:3px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;position:relative">'
    +'<div style="position:absolute;inset:0;border-radius:50%;border:3px solid rgba(255,255,255,.15);animation:pulse-ring 2s ease-out infinite"></div>'
    +'<div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center">'
    +'<i data-lucide="clock" style="width:26px;height:26px;color:#fff"></i>'
    +'</div></div>'
    +'<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1.15rem;color:#fff;margin-bottom:6px">'+(isCW?'Chonde Dikirani Chilolezo':'Waiting for Approval')+'</div>'
    +'<div style="font-size:.75rem;color:rgba(255,255,255,.65);line-height:1.6">'+subText+'</div>'
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:8px;background:var(--mist);border-radius:var(--cr-md);padding:10px 14px;font-size:.75rem;color:var(--mid);margin-bottom:14px">'
    +'<i data-lucide="home" style="width:14px;height:14px;flex-shrink:0;color:var(--p1)"></i>'
    +'<span>'+(isCW?'Nyumba':'Household')+': <strong style="color:var(--ink);font-family:monospace;letter-spacing:.5px">'+esc(code)+'</strong></span>'
    +'</div>'
    +'<div style="display:flex;align-items:center;justify-content:center;gap:7px;font-size:.74rem;color:rgba(255,255,255,.75);margin-bottom:14px" id="approval-listening-indicator">'
    +'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" style="animation:spin 1.2s linear infinite;flex-shrink:0"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'
    +(isCW?'Kudikira chilolezo…':'Listening for approval…')
    +'</div>'
    +'<button onclick="cancelPendingJoin()" style="width:100%;background:none;border:1.5px solid rgba(255,255,255,.35);border-radius:var(--cr-md);padding:11px;font-size:.8rem;font-weight:700;color:#fff;cursor:pointer;font-family:inherit">'+(isCW?'Siyani Pempho':'Cancel Request')+'</button>'
    +'</div>';
  if(window.lucide) lucide.createIcons({nodes:[setupBox]});
  if(window._pushOnboardScreen) _pushOnboardScreen('waiting-approval');
}

// Swaps the waiting card's header into the green "You're Approved!" state.
// Shared by both polling loops below (joinHH's fresh poll and
// _restoreWaitingScreen's resumed poll) — was previously duplicated verbatim.
function _setupJoinApproved(){
  const box = g('pending-approval-box');
  if(!box) return;
  const isCW = lang === 'cw';
  box.innerHTML = '<div style="margin:-2px -18px 20px;padding:32px 20px 28px;background:linear-gradient(145deg,#1B5E20,#2E7D32,#388E3C);border-radius:0 0 24px 24px"><div style="width:72px;height:72px;border-radius:50%;border:3px solid rgba(255,255,255,.3);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;background:rgba(255,255,255,.2)"><i data-lucide="check-circle" style="width:32px;height:32px;color:#fff"></i></div><div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1.15rem;color:#fff;margin-bottom:6px">'+(isCW?'Mwavomelezedwa!':'You\'re Approved!')+'</div><div style="font-size:.75rem;color:rgba(255,255,255,.75)">'+(isCW?'Kulumikizana tsopano...':'Connecting you now...')+'</div></div>';
  if(window.lucide) lucide.createIcons({nodes:[box]});
}

function _restoreWaitingScreen(code){
  const isCW = lang === 'cw';
  renderSetupJoinWaiting(code, false);
  // Resume polling
  let _pollCount = 0;
  const MAX_P = 120;
  function _poll(){
    if(_pollCount >= MAX_P){
      const ind = g('approval-listening-indicator');
      if(ind) ind.innerHTML = (isCW?'Tayimitsa kufufuza. Tsegulaninso app kuti mupitirize.':'Paused checking — reopen the app to keep checking.');
      return;
    }
    _pollCount++;
    _checkApproved(code)
      .then(function(approved){
        if(!localStorage.getItem('nb_pending_join')) return;
        if(curUser && approved){
          localStorage.removeItem('nb_pending_join');
          localStorage.setItem('nb_household', code);
          _claimMembership(code);
          _setupJoinApproved();
          setTimeout(function(){ hide('scr-setup'); g('app').classList.remove('hide'); connectHH(code); toast(lang==='cw'?'Takulandirani mu nyumba!':'Welcome to the household!','s'); }, 1200);
        } else {
          // Not approved yet — check whether the owner declined (request doc removed)
          db.collection('households').doc(code).collection('joinRequests').doc(curUser.uid).get()
            .then(function(reqSnap){
              if(!reqSnap.exists && localStorage.getItem('nb_pending_join')){
                localStorage.removeItem('nb_pending_join');
                toast(isCW?'Pempho lanu lakanidwa.':'Your request to join was declined.','e');
                location.reload();
                return;
              }
              setTimeout(_poll, 5000);
            })
            .catch(function(){ setTimeout(_poll, 5000); });
        }
      })
      .catch(function(){ if(localStorage.getItem('nb_pending_join')) setTimeout(_poll, 8000); });
  }
  setTimeout(_poll, 3000);
}

// Called on the JOINING user's own client once they detect they've been added to
// a household's memberUids (via polling). Writes householdId to their OWN user doc
// — allowed, since a user can always write their own doc — and points nb_uid at
// their real Firebase uid so actU() resolves to their own member entry (added by
// the owner in approveJoin) instead of silently falling back to the owner's ('u1').
function _claimMembership(hid){
  if(!curUser) return;
  localStorage.setItem('nb_uid', curUser.uid);
  db.collection('invites').doc(hid).collection('approved').doc(curUser.uid).delete().catch(()=>{});
  db.collection('users').doc(curUser.uid).set({
    householdId: hid,
    displayName: curUser.displayName || curUser.email || 'User'
  }, {merge:true}).catch(()=>{});
}

function switchHousehold(){
  appConfirm(
    lang==='cw'
      ? 'Mukufuna kutuluka nyumba iyi ndi kulowa ina? Simutuluka kwathunthu — mudzakhalabe olowa.'
      : 'Leave this household and join a different one? You will stay signed in.',
    function(){
      // Unsubscribe household listener
      if(unsub){ unsub(); unsub=null; }
      if(unsubHH){ unsubHH(); unsubHH=null; }
      if(unsubJoinBadge){ unsubJoinBadge(); unsubJoinBadge=null; }
      clearTimeout(window._recurTimer);
      // Clear household state but keep auth
      localStorage.removeItem('nb_household');
      localStorage.removeItem('nb_uid');
      localStorage.removeItem('nb_pending_join');
      hhId=null; lCfg=JSON.parse(JSON.stringify(DEF_CFG)); lPx=[]; lHHDoc={};
      window._userOwnedHouseholds = null;
      // Go to setup screen — user stays signed in
      g('app').classList.add('hide');
      hide('scr-auth'); hide('scr-pin'); hide('scr-verify');
      show('scr-setup');
      toast(lang==='cw'?'Lowani nyumba yatsopano.':'Choose or create a household to continue.','i');
    },
    lang==='cw'?'Inde, Siyani':'Yes, Leave',
    true
  );
}

function cancelPendingJoin(){
  // Reload instead of manually rebuilding the setup screen: the pending-approval
  // markup replaced the setup-card's original HTML in place, so there's nothing
  // to "show" back — a reload is the only clean way to restore it. Firebase Auth
  // persists across reload, so the user stays signed in; they land on the normal
  // create/join screen, not a re-login prompt.
  const finish = ()=>location.reload();
  if(!curUser){ finish(); return; }
  const code = localStorage.getItem('nb_pending_join');
  localStorage.removeItem('nb_pending_join');
  if(code){
    db.collection('households').doc(code).collection('joinRequests').doc(curUser.uid).delete().then(finish).catch(finish);
  } else {
    finish();
  }
}

// ── Invite stubs ─────────────────────────────────────────────────────────────
// invites/{code} is a tiny public stub ({createdAt, expiresAt?}) so someone holding only a join code can check it
// WITHOUT reading the household document (budgets, member names, config). Owners create it when they open the app
// (this also covers households that pre-date it). It never throws: the app works fine without it, and a
// permission-denied from not-yet-published rules is treated as "no stub".
function _ensureInvite(code){
  return db.collection('invites').doc(code).set({createdAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})
    .then(()=>true).catch(()=>false);
}
function _backfillInvite(code){
  const k='nb_inv_'+code;
  try{ if(localStorage.getItem(k)) return; }catch(e){}
  db.collection('invites').doc(code).get()
    .then(s=> s.exists ? true : _ensureInvite(code))
    .then(ok=>{ if(ok){ try{ localStorage.setItem(k,'1'); }catch(e){} } })
    .catch(()=>{});
}
// Owner leaves a marker for each approved joiner so the joiner can learn they were approved even once non-members
// can no longer read the household document. Best effort with one retry; membership itself is still decided only
// by households.memberUids.
function _markApproved(hid, uid){
  const ref = db.collection('invites').doc(hid).collection('approved').doc(uid);
  const doc = {uid:uid, approvedAt:firebase.firestore.FieldValue.serverTimestamp()};
  return ref.set(doc).catch(()=>new Promise(r=>setTimeout(r,2500)).then(()=>ref.set(doc)).catch(()=>{}));
}
// Has the owner approved THIS account's join request for household `code`? True if the owner left an approval
// marker, or the household already lists this account as a member (approvals made by older versions of the app
// wrote no marker). permission-denied counts as "not yet"; any other error is passed on so callers can retry.
function _checkApproved(code){
  if(!curUser) return Promise.resolve(false);
  const _denied = e=>{ if(e && e.code==='permission-denied') return null; throw e; };
  return Promise.all([
    db.collection('invites').doc(code).collection('approved').doc(curUser.uid).get().catch(_denied),
    db.collection('households').doc(code).get().catch(_denied)
  ]).then(r=>{
    if(r[0] && r[0].exists) return true;
    const uids = (r[1] && r[1].exists && r[1].data().memberUids) || [];
    return uids.includes(curUser.uid);
  });
}

function joinHH(){
  const code=val('join-code').trim().toLowerCase();
  if(!code){setupErr('Enter a household code.');return;}
  if(!_validCode(code)){setupErr(lang==='cw'?'Kodi iyi siikuoneka bwino. Onaninso.':'That code does not look right. Check it with your household owner.');return;}
  if(!curUser){setupErr('Not signed in.');return;}
  if(_setupBusy) return;
  _setupLock();
  setDot('spin'); setupErr('');
  // Read the invite stub and the household side by side. The household read succeeds for members (and, until the rules
  // are tightened, for any signed-in user); for a non-member it may be denied, which just means "not a member".
  const _okOrDenied = e=>{ if(e && e.code==='permission-denied') return null; throw e; };
  Promise.all([
    db.collection('invites').doc(code).get().catch(_okOrDenied),
    db.collection('households').doc(code).get().catch(_okOrDenied)
  ])
    .then(([inv, doc])=>{
      const hhExists = !!(doc && doc.exists), invExists = !!(inv && inv.exists);
      if(!hhExists && !invExists){setDot('off');setupErr(lang==='cw'?'Kodi imeneyi sichiripo. Onani kodi ya nyumba, kapena pangani nyumba yatsopano.':'That code doesn\'t exist. Double-check it with your household owner, or create your own household to get started.');return;}
      const hhData = hhExists ? (doc.data()||{}) : {}, invData = invExists ? (inv.data()||{}) : {};
      // The invite's expiresAt (a Firestore timestamp) is authoritative; the old joinCodeExpiry field (ms) is still honoured.
      const _exp = invData.expiresAt ? _toMs(invData.expiresAt) : (hhData.joinCodeExpiry||0);
      if(_exp && Date.now() > _exp){
        setDot('off');
        setupErr(lang==='cw'?'Kodi yathera. Pemphani mwini kodi ipsya.':'This household code has expired. Ask the owner to share a new one.');
        return;
      }
      // Check if already a member — if so, just connect directly
      if(curUser && hhExists && hhData.memberUids && hhData.memberUids.includes(curUser.uid)){
        localStorage.setItem('nb_household',code);
        _claimMembership(code);
        hide('scr-setup'); g('app').classList.remove('hide'); connectHH(code);
        toast(lang==='cw'?'Takulandirani!':'Welcome back!','s');
        return;
      }
      // Owner approval model: always submit a joinRequest — no direct member add
      // Store pending code in localStorage so reopen restores waiting screen, not app
      // Do NOT write householdId to user doc until actually approved
      localStorage.setItem('nb_pending_join', code);
      // Clear any stale approval marker from an earlier stint, so an old marker can't look like a fresh approval.
      db.collection('invites').doc(code).collection('approved').doc(curUser.uid).delete().catch(()=>{});
      return db.collection('households').doc(code).collection('joinRequests')
        .doc(curUser.uid).set({
          uid: curUser.uid,
          displayName: curUser.displayName || curUser.email || 'User',
          email: curUser.email || '',
          requestedAt: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(()=>{
          setDot('off');
          hide('scr-setup');
          g('app').classList.add('hide');
          show('scr-setup');
          renderSetupJoinWaiting(code, true);
          toast(lang==='cw'?'Pempho lotumizidwa. Mudziwa mukavomelezwa.':'Join request sent. You\'ll be notified when approved.','i');

          // Auto-detect approval: poll the household doc every 5 seconds
          // We poll with get() not onSnapshot() — non-members can only get(), never listen
          // This avoids the permission error that occurred with onSnapshot on household doc
          // and avoids the owner needing to write to someone else's user doc
          let _approvalUnsub = null;
          let _approvalPollCount = 0;
          const MAX_POLLS = 120; // poll for up to 10 minutes (120 × 5s)
          function pollForApproval(){
            if(_approvalUnsub === false) return; // stopped
            if(_approvalPollCount >= MAX_POLLS){
              const indicator = g('approval-listening-indicator');
              if(indicator) indicator.innerHTML = '<button onclick="location.reload()" style="background:none;border:1.5px solid rgba(255,255,255,.35);border-radius:var(--cr-md);padding:7px 16px;font-size:.75rem;color:#fff;cursor:pointer;font-family:inherit">'+(lang==='cw'?'Onani Pomwe':'Check Again')+'</button>';
              return;
            }
            _approvalPollCount++;
            _checkApproved(code)
              .then(function(approved){
                if(_approvalUnsub === false) return;
                if(curUser && approved){
                  _approvalUnsub = false; // stop polling
                  localStorage.removeItem('nb_pending_join'); // clear pending flag
                  localStorage.setItem('nb_household', code);
                  _claimMembership(code);
                  _setupJoinApproved();
                  setTimeout(function(){
                    hide('scr-setup'); g('app').classList.remove('hide');
                    connectHH(code);
                    toast(lang==='cw'?'Takulandirani mu nyumba!':'Welcome to the household!','s');
                  }, 1200);
                } else {
                  // Not yet approved — check whether the owner declined (request doc removed)
                  db.collection('households').doc(code).collection('joinRequests').doc(curUser.uid).get()
                    .then(function(reqSnap){
                      if(_approvalUnsub === false) return;
                      if(!reqSnap.exists){
                        _approvalUnsub = false; // stop polling
                        localStorage.removeItem('nb_pending_join');
                        toast(lang==='cw'?'Pempho lanu lakanidwa.':'Your request to join was declined.','e');
                        location.reload();
                        return;
                      }
                      setTimeout(pollForApproval, 5000);
                    })
                    .catch(function(){ if(_approvalUnsub !== false) setTimeout(pollForApproval, 5000); });
                }
              })
              .catch(function(err){
                console.warn('[approvalPoll] Error:', err.code);
                if(_approvalUnsub !== false) setTimeout(pollForApproval, 8000); // back off on error
              });
          }
          _approvalUnsub = null; // null = active
          setTimeout(pollForApproval, 3000); // first check after 3 seconds
        })
        .catch(e=>{ setDot('off'); setupErr('Error: '+e.message); });
    })
    .catch(e=>{ setDot('off'); setupErr('Error: '+e.message); })
    .finally(()=>{ _setupUnlock(); });
}

function connectHH(code){
  if(!_validCode(code)){
    try{ localStorage.removeItem('nb_household'); }catch(e){}
    hhId=null; g('app').classList.add('hide'); show('scr-setup');
    toast(lang==='cw'?'Kodi ya nyumba siili bwino.':'That household code is not valid.','e');
    return;
  }
  hhId=code; loadChatHistory(); setDot('spin');
  setTimeout(_resumePaymentCheck, 4000);   // finishes a Premium payment started earlier, if any
  hide('scr-auth'); hide('scr-setup'); hide('scr-pin'); hide('scr-welcome'); hide('scr-verify');
  g('app').classList.remove('hide');
  // Unsubscribe previous household document listener to prevent memory leak
  if(unsubHH){ unsubHH(); unsubHH=null; }
  if(unsubJoinBadge){ unsubJoinBadge(); unsubJoinBadge=null; }
  _lastMemberUids = null;
  unsubHH=db.collection('households').doc(code).onSnapshot(doc=>{
    if(!doc.exists){
      // A cache-only "missing" result isn't proof (we may be offline or still syncing); wait for the server before unlinking anyone.
      if(doc.metadata && doc.metadata.fromCache) return;
      // Household was deleted (or never existed) but this user's account still points at it.
      // Detach it so they aren't stuck on an endless spinner forever, and send them back to Setup.
      if(unsubHH){ unsubHH(); unsubHH=null; }
      if(unsub){ unsub(); unsub=null; }
      localStorage.removeItem('nb_household');
      if(hhId===code) hhId=null;
      if(curUser){
        db.collection('users').doc(curUser.uid).update({householdId:firebase.firestore.FieldValue.delete()}).catch(()=>{});
      }
      setDot('off');
      hide('scr-auth'); hide('scr-pin'); hide('scr-welcome');
      g('app').classList.add('hide');
      show('scr-setup');
      toast(lang==='cw'
        ? 'Nyumba imeneyi sichinipezekanso. Pangani yatsopano kapena lowani ina.'
        : 'That household no longer exists. Create a new one or join another.', 'e');
      return;
    }
    { const d=doc.data({serverTimestamps:'estimate'});
      // Defense-in-depth: re-validate live membership on every snapshot, not
      // only when the (separately gated) purchases listener happens to hit a
      // permission-denied later. Without this, a removed member could still
      // land here via the "Welcome back" shortcut (connectHH called directly,
      // no join-request involved) and briefly render real household config —
      // until the Phase B rules are published the household doc is readable by any signed-in user
      // (join-code verification used it), so this check is the only thing
      // standing between "removed" and "quietly still in." Only runs when
      // memberUids actually exists on the doc, to stay backward-compatible
      // with old households created before that field existed.
      if(curUser && Array.isArray(d.memberUids) && !d.memberUids.includes(curUser.uid) && curUser.uid !== d.owner){
        handleRemovedFromHousehold();
        return;
      }
      lHHDoc = d;
      lCfg=d.config||JSON.parse(JSON.stringify(DEF_CFG)); if(!lCfg.goals)lCfg.goals=[];
      // Tell existing members when someone new joins. Skipped on the first snapshot of
      // this session (no baseline to compare against yet) and skips the joiner
      // themself so they don't get a "you joined!" popup about their own action.
      if(Array.isArray(d.memberUids)){
        if(_lastMemberUids){
          const _newUids = d.memberUids.filter(u=>!_lastMemberUids.includes(u) && u!==(curUser&&curUser.uid));
          _newUids.forEach(function(u){
            const _mu = (lCfg.users||[]).find(x=>x.id===u);
            const _isCW = lang === 'cw';
            const _nm = _mu ? _mu.name : (_isCW?'Membala watsopano':'A new member');
            toast(_isCW?_nm+' walowa nyumba yanu!':_nm+' joined your household!','s');
            maybeNotify('Bajeti Yanga', _isCW?_nm+' walowa nyumba yanu.':_nm+' just joined your household.');
          });
        }
        _lastMemberUids = d.memberUids.slice();
      }
      // One-time defaults migration per household. (It used to run on every snapshot, which silently
      // re-added any default item a user had deleted and wrote to Firestore from inside the listener.)
      if(!lCfg.defaultsMigrated && Array.isArray(lCfg.items)){
        const _next=JSON.parse(JSON.stringify(lCfg));
        DEF_ITEMS.filter(di=>di.name!=='Paraffin').forEach(di=>{if(!_next.items.find(it=>it.name===di.name)){_next.items.push({...di});}});
        const _pi=_next.items.findIndex(it=>it.name==='Paraffin');
        if(_pi>-1){_next.items.splice(_pi,1);}
        _next.defaultsMigrated=1;
        saveCfg(_next);
      }
      setDot(''); updatePill(); render();
      scheduleInAppAlerts(); checkBillReminders();
      // Owners make sure the household has its invite stub (invites/{code}); see _backfillInvite.
      if(curUser && d.owner === curUser.uid) _backfillInvite(code);
      // Owners give records that pre-date ids a stable id, once per session (one writer, so devices cannot race).
      if(curUser && d.owner === curUser.uid && _idsBackfilledFor !== code && cfgNeedsRecIds(lCfg)){
        _idsBackfilledFor = code;
        saveCfg(JSON.parse(JSON.stringify(lCfg)));
      }
      // Load pending join requests badge for owner
      // Attach once per household. (It used to be re-attached on every household snapshot, which reset the counter
      // and re-fired the "new request" toast + notification on any unrelated config change while a request was pending.)
      if(curUser && d.owner === curUser.uid && (!unsubJoinBadge || _joinBadgeFor!==code)){
        if(unsubJoinBadge){ unsubJoinBadge(); unsubJoinBadge=null; }
        _joinBadgeFor = code;
        let _prevJoinReqCount = -1; // -1 = no baseline yet: the first snapshot only sets the badge, it doesn't toast
        unsubJoinBadge = db.collection('households').doc(code).collection('joinRequests').onSnapshot(function(snap){
            const badge = g('pending-join-badge');
            if(badge) badge.innerHTML = snap.size > 0
              ? '<span style="background:#E65100;color:#fff;border-radius:var(--cr-md);font-size:.6rem;font-weight:800;padding:2px 7px;margin-right:5px">'+snap.size+'</span>'
              : '';
            if(_prevJoinReqCount>=0 && snap.size > _prevJoinReqCount){
              const _isCW = lang === 'cw';
              toast(_isCW?'Pempho latsopano lolowa nyumba.':'New request to join your household.','i');
              maybeNotify('Bajeti Yanga', _isCW?'Pali pempho latsopano lolowa nyumba yanu.':'Someone wants to join your household.');
            }
            _prevJoinReqCount = snap.size;
          }, function(){});
      }
      // Show expiry warning toast once per session on first data load
      if(!window._expiryToastShown){
        window._expiryToastShown = true;
        const _ps = getPremiumStatus();
        const _isCW = lang === 'cw';
        if(_ps.isExpired){
          setTimeout(()=>toast(_isCW?'Premium yathera. Bwezani kuti mupitirire ntchito zonse.':'Your Premium has expired. Renew to restore full access.','e'),1500);
        } else if(_ps.isPremium && !_ps.isTrial && _ps.daysLeft !== null && _ps.daysLeft <= 7){
          setTimeout(()=>toast(_isCW?'Premium yatha m\'masiku '+_ps.daysLeft+'. Bwezani tsopano.':'Premium expires in '+_ps.daysLeft+' day'+(_ps.daysLeft===1?'':'s')+'. Renew soon.','i'),1500);
        } else if(_ps.isTrial && _ps.daysLeft <= 7 && _ps.daysLeft > 0){
          setTimeout(()=>toast(_isCW?'Mayeso a Premium: masiku '+_ps.daysLeft+' otsala.':'Premium trial: '+_ps.daysLeft+' day'+(_ps.daysLeft===1?'':'s')+' left.','i'),1500);
        }
      }
    }
  }, err=>{
    setDot('off');
    console.warn('[connectHH] Household snapshot error:', err.code);
    // permission-denied means this account is no longer a member (or the household is gone); the purchases listener
    // below confirms that against the server and routes the person back to setup, so no "Sync lost" toast here.
    if(err && err.code==='permission-denied') return;
    toast(lang==='cw'
      ? 'Kulumikizana kwathyolewa: '+(err.code||'error')+'. Yesaninso.'
      : 'Sync lost: '+(err.code||'unknown')+'. Check connection and refresh.',
    'e');
  });
  if(unsub)unsub();
  let _permRetried=false; // one automatic retry after refreshing the auth token before we conclude the user was removed
  const tryConnect = (field) => {
    const q = field
      ? db.collection('households').doc(code).collection('purchases').orderBy(field,'desc')
      : db.collection('households').doc(code).collection('purchases');
    return q.onSnapshot(snap=>{
      lPx=snap.docs.map(d=>({id:d.id,...d.data()}));
      // Sort client-side by date desc as fallback
      // createdAt is a Firestore Timestamp (not a number), so convert before comparing.
      const _ms=x=>{ if(x.timestamp) return Number(x.timestamp)||0; const c=x.createdAt; return (c&&c.toMillis)?c.toMillis():0; };
      lPx.sort((a,b)=>{
        const ta=_ms(a), tb=_ms(b);
        if(ta&&tb&&ta!==tb) return tb-ta;
        return (b.date||'').localeCompare(a.date||'');
      });
      _invalidateMemo(); // Clear performance cache when data changes
      setDot(''); render();
      clearTimeout(window._recurTimer);
      window._recurTimer = setTimeout(checkAndAddRecurring, 2500);
    }, err=>{
      if(field&&(err.code==='failed-precondition'||err.code==='unimplemented')){
        // Index not ready or field missing, try without ordering
        if(unsub) unsub();
        unsub=tryConnect(null);
      } else if(err.code==='permission-denied'){
        // Until the Phase B rules are published the household doc stays readable to any signed-in user, so it
        // won't error out on removal -- but purchases
        // are gated on live memberUids membership, so this is the reliable signal
        // that this account was removed from the household. Route to a clean
        // re-request state instead of leaving them on a frozen list with a vague
        // "connection lost" toast.
        // A single permission-denied can also be a transient auth/token hiccup, and acting on it deletes the user's
        // householdId link. So confirm against the SERVER copy of the household first, and only unlink if they're really gone from it.
        Promise.resolve(curUser && curUser.getIdToken(true)).catch(()=>{})
          .then(()=>db.collection('households').doc(code).get({source:'server'}).catch(e=>{ if(e && e.code==='permission-denied') return {exists:false}; throw e; }))
          .then(snap=>{
            const dd=snap.exists?snap.data():null;
            const uidNow=curUser&&curUser.uid;
            const isMember = !!dd && (dd.owner===uidNow || !Array.isArray(dd.memberUids) || dd.memberUids.includes(uidNow));
            if(!snap.exists || !isMember){ handleRemovedFromHousehold(); return; }
            if(!_permRetried){ _permRetried=true; if(unsub) unsub(); unsub=tryConnect(null); }
            else { toast('Cannot load entries (permission denied). Please sign out and in again.','e'); setDot('off'); }
          })
          .catch(()=>{ toast('Connection problem. Please check your network.','e'); setDot('off'); });
      } else { toast('Connection lost: '+(err&&err.code||'unknown')+'.','e'); setDot('off'); }
    });
  };
  // No server-side orderBy: Firestore silently drops documents that lack the ordered field (older entries), and we sort client-side anyway.
  unsub=tryConnect(null);
  applyLang();
  startChipListener();
}

// ── Chipereganyu: listens for any group this signed-in account belongs to.
// Independent of household membership (a person's Chipereganyu circle can span
// several different households), so it's keyed on curUser.uid, not hhId. ──
function startChipListener(){
  if(unsubChip){ unsubChip(); unsubChip=null; }
  if(!curUser) return;
  unsubChip = db.collection('chipereganyu_groups').where('memberUids','array-contains',curUser.uid)
    .onSnapshot(function(snap){
      chipGroups = snap.docs.map(d=>({id:d.id,...d.data()}));
      chipGroups.sort((a,b)=>(a.name||'').localeCompare(b.name||''));
      if(chipActiveId && !chipGroups.some(g=>g.id===chipActiveId)) chipActiveId=null;
      if(!chipActiveId && chipGroups.length) chipActiveId=chipGroups[0].id;
      if(tab==='home') rHome();
      if(tab==='chip') rChip();
    }, function(err){ console.warn('[chip] listener error:', err && err.code); });
}
function stopChipListener(){
  if(unsubChip){ unsubChip(); unsubChip=null; }
  chipGroups=[]; chipActiveId=null;
}

// Called when a live listener detects this account is no longer a household
// member (permission-denied on purchases -- see tryConnect above). Mirrors the
// "household deleted" cleanup in connectHH's own listener, but with an accurate
// message: this household still exists, this account was just removed from it.
// Re-entering the same code afterward files a fresh joinRequest, same as any
// new member -- the owner has to approve it again.
function handleRemovedFromHousehold(){
  if(unsubHH){ unsubHH(); unsubHH=null; }
  if(unsub){ unsub(); unsub=null; }
  if(unsubJoinBadge){ unsubJoinBadge(); unsubJoinBadge=null; }
  localStorage.removeItem('nb_household');
  hhId=null;
  if(curUser){
    db.collection('users').doc(curUser.uid).update({householdId:firebase.firestore.FieldValue.delete()}).catch(()=>{});
  }
  setDot('off');
  hide('scr-auth'); hide('scr-pin'); hide('scr-welcome');
  g('app').classList.add('hide');
  show('scr-setup');
  toast(lang==='cw'
    ? 'Mwachotsedwa mu nyumbayi. Lowetsani kodi kuti mupemphe kulowanso.'
    : 'You were removed from this household. Enter the code again to request to rejoin.', 'e');
}

function saveCfg(cfg){
  if(!cfg.goals)cfg.goals=[];
  ensureRecIds(cfg);   // any record added or still without an id gets one before it is written
  const prev=lCfg||{}; lCfg=cfg; _invalidateMemo();
  if(!hhId) return Promise.resolve();
  // Field-level update: only the top-level config keys that changed (items, bills, goals, users, ...), not the whole map.
  const FV=firebase.firestore.FieldValue, upd={};
  Object.keys(cfg).forEach(k=>{ if(JSON.stringify(cfg[k])!==JSON.stringify(prev[k])) upd['config.'+k]=cfg[k]===undefined?FV.delete():cfg[k]; });
  Object.keys(prev).forEach(k=>{ if(!(k in cfg)) upd['config.'+k]=FV.delete(); });
  if(!Object.keys(upd).length) return Promise.resolve();
  setDot('spin');
  return db.collection('households').doc(hhId).update(upd).then(()=>setDot('')).catch(e=>{toast('Settings sync failed: '+(e&&e.code||'error')+'.','e');setDot('off');});
}
// Returns a Promise<boolean> (true = saved) so callers that chain several writes can tell whether this one worked.
// opts.docId makes the write idempotent (same id => same document), used to stop two devices both adding the same recurring entry.
function addPx(p,opts){
  opts=opts||{};
  if(!hhId){toast('Not connected.','e');return Promise.resolve(false);}
  const amt=Number(p.amount);
  if(!amt||amt<=0||isNaN(amt)){toast(lang==='cw'?'Lowetsani ndalama yabwino':'Please enter a valid amount','e');return Promise.resolve(false);}
  const itemName=String(p.item||'').trim();
  if(!itemName){toast(lang==='cw'?'Lowetsani dzina la chinthu':'Please enter an item name','e');return Promise.resolve(false);}
  setDot('spin');
  const col=db.collection('households').doc(hhId).collection('purchases');
  // store the validated number (not whatever string/fraction the caller passed), rounded to 2dp to avoid float drift
  const data={...p,item:itemName,amount:Math.round(amt*100)/100,createdAt:firebase.firestore.FieldValue.serverTimestamp()};
  const op=opts.docId?col.doc(opts.docId).set(data):col.add(data);
  return op.then(()=>{setDot('');return true;}).catch(e=>{
    if(opts.quiet){ setDot(''); return false; }
    const msg=e&&e.code==='permission-denied'?'Permission denied. Check Firestore rules.':'Sync error: '+(e&&e.code||'unknown')+'.'; toast(msg,'e'); setDot('off'); if(e&&e.code==='permission-denied'&&curUser)curUser.getIdToken(true).catch(()=>{});
    return false;
  });
}
function updPx(id,data){ if(!hhId)return; _invalidateMemo(); setDot('spin'); db.collection('households').doc(hhId).collection('purchases').doc(id).update(data).then(()=>setDot('')).catch(e=>{toast('Update failed: '+(e&&e.code||'error')+'.','e');setDot('off');}); }
function delPx(id){ if(!hhId)return Promise.resolve(); setDot('spin'); return db.collection('households').doc(hhId).collection('purchases').doc(id).delete().then(()=>setDot('')).catch(e=>{toast('Delete failed: '+(e&&e.code||'error')+'.','e');setDot('off');throw e;}); }
