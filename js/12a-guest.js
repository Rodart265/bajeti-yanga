// ===============================================
// GUEST MODE: lets a first-time visitor try the REAL app with sample data before making an account.
//
// How it works: the demo is not a separate app. It fills the app's own lists (lCfg, _pxMain, lPx) with a made-up household
// held in memory, then opens the normal #app screens (Home, Log, Insights, Bajeti AI, Profile) exactly as a signed-in person
// sees them. Two things keep it safe:
//  1. While isGuestMode is true, _pxCol() (js/05-household.js) returns guestPxCol() below instead of a Firestore collection,
//     so adding, editing and deleting entries only change the in-memory list. saveCfg() already skips Firestore when there is
//     no household, so budget, goal and item edits stay in memory too.
//  2. Everything that needs a real account (households, members, Premium, Chipereganyu, PIN, sign out, notifications...)
//     is listed in GUEST_BLOCKED. In demo mode those functions open the "Create an account" sheet instead of running.
//
// RULES (tests/guest.test.js checks the important ones):
//  - This file never touches Firebase. No Firestore, no sign-in calls, no Worker calls, no household listeners.
//  - It never calls bootApp() or connectHH(). The real app is only started by the normal sign-in path.
//  - Everything a guest types lives in memory. A refresh or a sign-in throws it away.
//  - The only thing written to the phone by name is nb_seen_auth (set when someone signs in, so they never see the guest
//    entry screen again) and nb_lang (the language choice the app already uses).
//
// Hooks in other files: bootApp() in js/05-household.js calls guestRoute() when nobody is signed in, and
// guestNoteSignedIn() when someone is. The splash script in index.html lists the guest entry screen.
// ===============================================
const GUEST_SEEN_KEY = 'nb_seen_auth';
const GUEST_MAX_ENTRIES = 40;      // entries a guest can add before the demo says it is full
let guestDemoStarted = false, _guestSeq = 0;

// Sample household (all made up). Amounts in MWK. Items are names from the app's own default item list.
// [item, amount, days ago, who (0 = first member, 1 = second), isIncome]
const GUEST_NOW = [
  ['Salary/Income', 250000, 99, 0, true], ['Rent', 78000, 99, 0],
  ['Electricity', 19500, 9, 0], ['School Fees', 30000, 8, 1], ['Maize Flour (Ufa)', 18500, 6, 0], ['Chicken', 12000, 5, 1],
  ['Transport', 17000, 4, 0], ['Cooking Oil', 9500, 3, 1], ['Beans (Nyemba)', 7000, 2, 0], ['Charcoal', 6000, 1, 1],
  ['Airtime / Data', 5000, 1, 0], ['Tomatoes', 4500, 0, 1]
];
// What earlier months looked like, so the trend chart and History have something real to show.
// [item, amount, day of month, who, isIncome]
const GUEST_PAST = [
  ['Salary/Income', 250000, 1, 0, true], ['Rent', 78000, 1, 0], ['Maize Flour (Ufa)', 30000, 4, 0], ['Cooking Oil', 12000, 7, 1],
  ['Charcoal', 15000, 10, 1], ['Transport', 16000, 12, 0], ['Airtime / Data', 10000, 15, 0], ['Beans (Nyemba)', 8000, 17, 1],
  ['School Fees', 30000, 20, 1], ['Electricity', 17000, 22, 0], ['Chicken', 10000, 24, 1]
];
const GUEST_PAST_SCALE = [0.94, 1.06, 0.91, 1.12, 0.97];     // month 1 back ... month 5 back
const GUEST_MEMBERS = [{id:'u1', name:'Chifundo', color:'#176B78'}, {id:'u2', name:'Tamanda', color:'#E91E63'}];
const GUEST_GOALS = [{name:'Emergency fund', target:100000, saved:50000}, {name:'School fees', target:80000, saved:20000}];

// What a guest sees when they tap something that needs a real account. icon names must exist in vendor/icons.min.js.
const GUEST_GATES = {
  account:{icon:'user', en:['Create your account','This part needs an account. Create one free, or sign in if you already have one.'],
        cw:['Tsegulani akaunti yanu','Gawoli limafuna akaunti. Tsegulani yaulere, kapena lowani ngati muli nayo.']},
  save:{icon:'wallet', en:['Keep your own records','Create an account to save your income and spending, and see them on any phone.'],
        cw:['Sungani zolemba zanu','Tsegulani akaunti kuti musunge ndalama zanu zolowa ndi zotuluka, ndi kuziona pa foni iliyonse.']},
  household:{icon:'users', en:['Share a budget with your family','Households need an account so everyone sees the same records.'],
        cw:['Gawanani bajeti ndi banja lanu','Nyumba imafuna akaunti kuti aliyense aone zolemba zomwezo.']},
  bills:{icon:'receipt', en:['Track your bills','Create an account to keep bills and get reminders before they are due.'],
        cw:['Lembani ma bilu anu','Tsegulani akaunti kuti musunge ma bilu ndi kulandira chikumbutso nthawi isanakwane.']},
  chip:{icon:'landmark', en:['Chipereganyu savings circles','Create an account to start or join a savings circle with people you trust.'],
        cw:['Chipereganyu','Tsegulani akaunti kuti muyambe kapena kulowa mu gulu la Chipereganyu ndi anthu amene mumawadalira.']},
  premium:{icon:'gem', en:['Premium','Create an account to see the Premium plans.'],
        cw:['Premium','Tsegulani akaunti kuti muone mapulani a Premium.']},
  ai:{icon:'sparkles', en:['Bajeti AI','Create an account first. Bajeti AI is a Premium feature that answers questions about your own spending.'],
        cw:['Bajeti AI','Tsegulani akaunti poyamba. Bajeti AI ndi ya Premium, imayankha mafunso okhudza ndalama zanu.']}
};

// Functions that need a real account. In demo mode each one opens the matching sheet above instead of running.
// (tests/guest.test.js checks every name here is a real function, so a rename cannot silently open a hole.)
const GUEST_BLOCKED = {
  premium:   ['showPremiumPage', 'showPremiumSheet', 'copyPreviousMonth', 'proceedToPayment', 'startCheckout', 'claimPayment', 'showClaimScreen'],
  ai:        ['sendChat', 'processMagicLog', 'scanReceipt', 'scanReceiptFromChat', 'generateAiSummary'],
  household: ['openSwitch', 'switchHousehold', 'openQRCode', 'cpCode', 'waCode', 'openAddM', 'saveMember', 'delMember',
              'approveJoin', 'declineJoin', 'openDeleteHousehold', 'openDeleteAccount'],
  chip:      ['openChipView', 'openChipEntry', 'openChipCreate', 'openChipJoin'],
  bills:     ['openAddBill', 'markBillPaid', 'offerBillReminders'],
  account:   ['logout', 'openSetPIN', 'registerBio', 'removeBio', 'openNotifs', 'doPwReset']
};
(function(){
  Object.keys(GUEST_BLOCKED).forEach(function(key){
    GUEST_BLOCKED[key].forEach(function(name){
      const real = window[name];
      if(typeof real !== 'function') return;
      window[name] = function(){
        if(isGuestMode){ guestGate(key); return; }
        return real.apply(this, arguments);
      };
    });
  });
})();

// ── Who sees the guest screen ───────────────────────────────────────────────
// Only a first-time visitor on this phone. Anyone who has signed in before, or belongs to a household on this
// phone, goes straight to sign-in as before. If the phone will not let us read storage, play safe: sign-in.
function guestIsReturning(){
  try{ return !!(localStorage.getItem(GUEST_SEEN_KEY) || localStorage.getItem('nb_household')); }
  catch(e){ return true; }
}
// Called by bootApp() when nobody is signed in. Returns true when it has put a guest screen up, false when the
// caller should show the normal sign-in screen.
function guestRoute(){
  if(!g('scr-guest-entry')) return false;
  const open = ['scr-guest-entry','scr-auth'].some(function(id){ return !g(id).classList.contains('hide'); })
    || (isGuestMode && !g('app').classList.contains('hide'));
  if(open) return true;                                  // a screen is already up: leave it alone
  if(typeof _pendingJoinCode !== 'undefined' && _pendingJoinCode) return false;   // came from an invite link: they need an account
  if(guestIsReturning()) return false;
  guestShowEntry();
  return true;
}
// Called by bootApp() when someone is signed in: remember it, close the demo and forget everything in it.
function guestNoteSignedIn(){
  try{ localStorage.setItem(GUEST_SEEN_KEY,'1'); }catch(e){}
  hide('scr-guest-entry'); guestCloseSheet();
  const b = g('a-guest-back'); if(b) b.classList.add('hide');
  if(isGuestMode) guestEndDemo();
}

// ── The sample household ────────────────────────────────────────────────────
function guestBuildCfg(){
  const cfg = JSON.parse(JSON.stringify(DEF_CFG));
  cfg.users = GUEST_MEMBERS.map(function(m){ return {id:m.id, name:m.name, color:m.color}; });
  // Monthly budget a little above the item budgets, so the "item budgets add up to more than..." note does not show.
  cfg.overallBudget = Math.ceil(cfg.items.reduce(function(s,it){ return s + (Number(it.budget)||0); },0) / 10000) * 10000;
  cfg.goals = GUEST_GOALS.map(function(x){ return {name:x.name, target:x.target, saved:x.saved}; });
  try{ ensureRecIds(cfg); }catch(e){}
  return cfg;
}
function _guestEntry(item, amount, d, who, isIncome, hour){
  const date = localISO(d);
  return {id:'gs'+(++_guestSeq), item:item, amount:amount, date:date, timestamp:new Date(date+'T'+String(hour).padStart(2,'0')+':00').getTime(),
    userId:GUEST_MEMBERS[who||0].id, type:isIncome?'income':'expense', notes:'', qty:'', unit:''};
}
function guestBuildPx(){
  const out = [], now = new Date(), dom = now.getDate();
  GUEST_NOW.forEach(function(r, i){
    const day = Math.max(1, dom - r[2]);
    out.push(_guestEntry(r[0], r[1], new Date(now.getFullYear(), now.getMonth(), day), r[3], r[4], 8 + (i % 12)));
  });
  GUEST_PAST.forEach(function(r, i){
    GUEST_PAST_SCALE.forEach(function(f, k){
      if(r[0]==='School Fees' && k%2===1) return;       // school fees only some months
      const amt = r[4] ? r[1] : Math.round(r[1]*f/500)*500;
      out.push(_guestEntry(r[0], amt, new Date(now.getFullYear(), now.getMonth()-(k+1), r[2]), r[3], r[4], 8 + (i % 12)));
    });
  });
  return out;
}
function guestStartData(){
  isGuestMode = true; guestDemoStarted = true; _guestUid = null;
  lHHDoc = {}; lCfg = guestBuildCfg();
  _pxMain.length = 0; _pxOlder.length = 0; _pxTrash.length = 0;
  guestBuildPx().forEach(function(p){ _pxMain.push(p); });
  chipGroups = []; _pxFirst = true; _chipFirst = true;
  viewMonth = null; tab = 'home'; _stgSection = null; selItem = null; selItemKey = null; fUser = 'all'; logSrch = '';
  _setPx(); _invalidateMemo();
}
// Throws every trace of the demo away and puts the app's own lists back the way a signed-out app has them.
function guestEndDemo(){
  isGuestMode = false; guestDemoStarted = false; _guestUid = null;
  lHHDoc = {}; lCfg = JSON.parse(JSON.stringify(DEF_CFG)); lPx = [];
  _pxMain.length = 0; _pxOlder.length = 0; _pxTrash.length = 0;
  chipGroups = []; _pxFirst = false; _chipFirst = false;
  viewMonth = null; tab = 'home'; _stgSection = null; selItem = null; selItemKey = null;
  _invalidateMemo();
  const a = g('app'); if(a) a.classList.remove('is-guest');
  hide('guest-strip');
}

// ── In-memory stand-in for the household's entries ──────────────────────────
// Offers the few calls the app makes on a Firestore collection (add, doc().set / update / delete) and applies them to the
// in-memory list, then redraws the way a live update would.
function _guestStamp(){
  const t = Date.now();
  return {seconds:Math.floor(t/1000), nanoseconds:0, toMillis:function(){ return t; }, toDate:function(){ return new Date(t); }};
}
function _guestApply(target, data){
  Object.keys(data||{}).forEach(function(k){
    const v = data[k];
    if(v && typeof v === 'object' && typeof v._methodName === 'string'){      // a Firestore "server value"
      if(/delete/i.test(v._methodName)) delete target[k];
      else if(/timestamp/i.test(v._methodName)) target[k] = _guestStamp();
    } else target[k] = v;
  });
}
function _guestChanged(){
  _setPx(); _invalidateMemo();
  try{ renderLive(); }catch(e){}
}
function guestPxFull(){
  return _pxMain.filter(function(p){ return p._guestTyped; }).length >= GUEST_MAX_ENTRIES;
}
function guestPxCol(){
  function write(id, data, mayCreate){
    let p = _pxMain.find(function(x){ return x.id === id; });
    if(!p){
      if(!mayCreate){ const e = new Error('Not found'); e.code = 'not-found'; return Promise.reject(e); }
      p = {id:id, _guestTyped:true}; _pxMain.unshift(p);
    }
    _guestApply(p, data); p.id = id;
    _guestChanged();
    return Promise.resolve();
  }
  function ref(id){
    return {
      id: id,
      set: function(data){ return write(id, data, true); },
      update: function(data){ return write(id, data, false); },
      delete: function(){
        const i = _pxMain.findIndex(function(x){ return x.id === id; });
        if(i > -1) _pxMain.splice(i, 1);
        _guestChanged(); return Promise.resolve();
      }
    };
  }
  return {
    add: function(data){ const id = 'gx' + (++_guestSeq); return write(id, data, true).then(function(){ return {id:id}; }); },
    doc: function(id){ return ref(id || ('gx' + (++_guestSeq))); }
  };
}

// ── Moving between screens ──────────────────────────────────────────────────
function guestShowEntry(){
  guestCloseSheet(); hide('scr-auth');
  const a = g('app'); if(a) a.classList.add('hide');
  show('scr-guest-entry'); guestSyncLangBtns();
}
function guestOpenDemo(){
  guestStartData();
  hide('scr-guest-entry'); hide('scr-auth');
  const a = g('app'); a.classList.add('is-guest'); a.classList.remove('hide');
  show('guest-strip');
  try{ applyLang(); }catch(e){}
  go('home');
}
// Hands over to the EXISTING sign-in screen and its existing functions. Nothing is duplicated here.
function guestGoAuth(mode){
  guestCloseSheet(); hide('scr-guest-entry');
  const a = g('app'); if(a) a.classList.add('hide');
  show('scr-auth'); aTab(mode==='register'?'register':'login');
  const b = g('a-guest-back'); if(b) b.classList.remove('hide');
}
function guestBackFromAuth(){
  const b = g('a-guest-back'); if(b) b.classList.add('hide');
  hide('scr-auth');
  if(guestDemoStarted && isGuestMode){ g('app').classList.remove('hide'); go(tab); } else guestShowEntry();
}
function guestToggleLang(){
  lang = lang==='en' ? 'cw' : 'en';
  try{ localStorage.setItem('nb_lang',lang); }catch(e){}
  try{ applyStaticLang(); }catch(e){}
  try{ applyLang(); }catch(e){}
  const b = g('lbtn'); if(b) b.textContent = lang==='en' ? 'CW' : 'EN';
  guestSyncLangBtns();
}
function guestSyncLangBtns(){
  document.querySelectorAll('.gs-lang').forEach(function(b){ b.textContent = lang==='en' ? 'CW' : 'EN'; });
}

// ── Sheet: "this needs an account" ──────────────────────────────────────────
function guestOpenSheet(html){
  const s = g('gs-sheet'); if(!s) return;
  s.innerHTML = '<div class="gs-sheet-in" role="dialog" aria-modal="true">'+html+'</div>';
  s.classList.remove('hide');
  try{ if(window.lucide) lucide.createIcons({nodes:[s]}); }catch(e){}
}
function guestCloseSheet(){
  const s = g('gs-sheet'); if(!s) return;
  s.classList.add('hide'); s.innerHTML = '';
}
function guestSheetBg(ev){ if(ev && ev.target && ev.target.id==='gs-sheet') guestCloseSheet(); }
// Called wherever a guest taps something that needs a real account.
function guestGate(key){
  const d = GUEST_GATES[key] || GUEST_GATES.account, c = lang==='cw' ? d.cw : d.en;
  guestOpenSheet('<div class="gs-gate"><div class="gs-ic big">'+_ic(d.icon,'currentColor')+'</div><h3>'+esc(c[0])+'</h3><p>'+esc(c[1])+'</p></div>'
    +'<button type="button" class="gs-btn gs-primary" onclick="guestGoAuth(&quot;register&quot;)">'+L('Create account','Tsegulani akaunti')+'</button>'
    +'<button type="button" class="gs-btn gs-outline" onclick="guestGoAuth(&quot;login&quot;)">'+L('Sign in','Lowani')+'</button>'
    +'<button type="button" class="gs-link" style="display:block;margin:12px auto 0" onclick="guestCloseSheet()">'+L('Keep exploring','Pitirizani kuyesa')+'</button>');
}
document.addEventListener('keydown', function(e){ if(e.key==='Escape') guestCloseSheet(); });
