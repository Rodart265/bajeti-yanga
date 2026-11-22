// ===============================================
// GUEST MODE: lets a first-time visitor try the app with sample data before making an account.
//
// RULES (tests/guest.test.js checks the important ones):
//  - This file never touches Firebase. No db, no auth, no Firestore, no Worker calls, no household listeners.
//  - It never calls bootApp(), connectHH() or addPx(). The real app is only started by the normal sign-in path.
//  - Everything a guest types lives in the guestEntries array in memory. A refresh or a sign-in throws it away.
//  - The only thing written to the phone is nb_seen_auth (set when someone signs in, so they are never shown the
//    guest screen again) and nb_lang (the language choice the app already uses).
//  - Account-only features go through guestGate(), which sends people to the EXISTING sign-in screen (scr-auth).
//
// Hooks in other files: bootApp() in js/05-household.js calls guestRoute() when nobody is signed in, and
// guestNoteSignedIn() when someone is. The splash script in index.html lists the two guest screens.
// ===============================================
const GUEST_SEEN_KEY = 'nb_seen_auth';
let guestTab = 'home', guestEntries = [], guestSheetType = 'expense', guestDemoStarted = false;

// Sample household (all made up). Amounts in MWK. day = how many days ago.
const GUEST_CATS = [['Food',60000],['Household',100000],['Personal',40000],['Transport',20000],['Other',10000]];
const GUEST_BUDGET = GUEST_CATS.reduce(function(s,c){ return s+c[1]; },0);
const GUEST_CAT_CW = {Food:'Chakudya',Household:'Zapakhomo',Personal:'Zaumwini',Transport:'Mayendedwe',Other:'Zina'};
const GUEST_SAMPLE = [
  {item:'Maize Flour (Ufa)', cw:'Ufa', cat:'Food', amount:18500, day:0},
  {item:'Transport', cw:'Mayendedwe', cat:'Transport', amount:12000, day:1},
  {item:'Charcoal', cw:'Makala', cat:'Household', amount:6000, day:2},
  {item:'Cooking Oil', cw:'Mafuta a Kuphikira', cat:'Food', amount:9500, day:3},
  {item:'Airtime / Data', cw:'Airtime/Data', cat:'Household', amount:5000, day:4},
  {item:'Beans (Nyemba)', cw:'Nyemba', cat:'Food', amount:7000, day:6},
  {item:'School Fees', cw:'Ndalama za Sukulu', cat:'Personal', amount:35000, day:8},
  {item:'Rent', cw:'Lenti', cat:'Household', amount:80000, day:11},
  {item:'Salary / Income', cw:'Malipiro / Ndalama', cat:'Other', amount:250000, income:true, day:12}
];
const GUEST_GOALS = [
  {en:'Emergency fund', cw:'Ndalama zadzidzidzi', saved:50000, target:100000},
  {en:'School fees', cw:'Ndalama za sukulu', saved:20000, target:80000}
];
// What a guest sees when they tap something that needs a real account. icon names must exist in vendor/icons.min.js.
const GUEST_GATES = {
  save:{icon:'wallet', en:['Keep your own records','Create an account to save your income and spending, and see them on any phone.'],
        cw:['Sungani zolemba zanu','Tsegulani akaunti kuti musunge ndalama zanu zolowa ndi zotuluka, ndi kuziona pa foni iliyonse.']},
  household:{icon:'users', en:['Share a budget with your family','Households need an account so everyone sees the same records.'],
        cw:['Gawanani bajeti ndi banja lanu','Nyumba imafuna akaunti kuti aliyense aone zolemba zomwezo.']},
  bills:{icon:'receipt', en:['Track your bills','Create an account to keep bills and get reminders before they are due.'],
        cw:['Lembani ma bilu anu','Tsegulani akaunti kuti musunge ma bilu ndi kulandira chikumbutso nthawi isanakwane.']},
  chip:{icon:'landmark', en:['Chipereganyu savings circles','Create an account to start or join a savings circle with people you trust.'],
        cw:['Chipereganyu','Tsegulani akaunti kuti muyambe kapena kulowa mu gulu la Chipereganyu ndi anthu amene mumawadalira.']},
  ai:{icon:'sparkles', en:['Bajeti AI','Create an account first. Bajeti AI is a Premium feature that answers questions about your own spending.'],
        cw:['Bajeti AI','Tsegulani akaunti poyamba. Bajeti AI ndi ya Premium, imayankha mafunso okhudza ndalama zanu.']},
  premium:{icon:'gem', en:['Premium','Create an account to see the Premium plans.'],
        cw:['Premium','Tsegulani akaunti kuti muone mapulani a Premium.']}
};

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
  if(!g('scr-guest-entry') || !g('scr-guest')) return false;
  const open = ['scr-guest-entry','scr-guest','scr-auth'].some(function(id){ return !g(id).classList.contains('hide'); });
  if(open) return true;                                  // a screen is already up: leave it alone
  if(typeof _pendingJoinCode !== 'undefined' && _pendingJoinCode) return false;   // came from an invite link: they need an account
  if(guestIsReturning()) return false;
  guestShowEntry();
  return true;
}
// Called by bootApp() when someone is signed in: remember it, close every guest screen, forget the demo.
function guestNoteSignedIn(){
  try{ localStorage.setItem(GUEST_SEEN_KEY,'1'); }catch(e){}
  hide('scr-guest-entry'); hide('scr-guest'); guestCloseSheet();
  guestEntries = []; guestDemoStarted = false; guestTab = 'home';
  const b = g('a-guest-back'); if(b) b.classList.add('hide');
}

// ── Moving between screens ──────────────────────────────────────────────────
function guestShowEntry(){
  guestCloseSheet(); hide('scr-guest'); show('scr-guest-entry'); guestSyncLangBtns();
}
function guestOpenDemo(){
  guestDemoStarted = true; guestTab = 'home';
  hide('scr-guest-entry'); show('scr-guest'); guestRender();
}
// Hands over to the EXISTING sign-in screen and its existing functions. Nothing is duplicated here.
function guestGoAuth(mode){
  guestCloseSheet(); hide('scr-guest-entry'); hide('scr-guest');
  show('scr-auth'); aTab(mode==='register'?'register':'login');
  const b = g('a-guest-back'); if(b) b.classList.remove('hide');
}
function guestBackFromAuth(){
  const b = g('a-guest-back'); if(b) b.classList.add('hide');
  hide('scr-auth');
  if(guestDemoStarted){ show('scr-guest'); guestRender(); } else guestShowEntry();
}
function guestToggleLang(){
  lang = lang==='en' ? 'cw' : 'en';
  try{ localStorage.setItem('nb_lang',lang); }catch(e){}
  try{ applyStaticLang(); }catch(e){}
  try{ applyLang(); }catch(e){}
  const b = g('lbtn'); if(b) b.textContent = lang==='en' ? 'CW' : 'EN';
  guestSyncLangBtns();
  if(!g('scr-guest').classList.contains('hide')) guestRender();
}
function guestSyncLangBtns(){
  document.querySelectorAll('.gs-lang').forEach(function(b){ b.textContent = lang==='en' ? 'CW' : 'EN'; });
}

// ── Numbers ─────────────────────────────────────────────────────────────────
function guestAll(){
  return guestEntries.concat(GUEST_SAMPLE).sort(function(a,b){ return a.day-b.day; });   // newest first; typed entries stay on top of today's
}
function guestTotals(){
  let income = 0, spent = 0; const byCat = {};
  guestAll().forEach(function(e){
    if(e.income) income += e.amount;
    else { spent += e.amount; byCat[e.cat] = (byCat[e.cat]||0) + e.amount; }
  });
  return {income:income, spent:spent, byCat:byCat, balance:income-spent};
}
function guestCat(c){ return lang==='cw' ? (GUEST_CAT_CW[c]||c) : c; }
function guestName(e){ return lang==='cw' && e.cw ? e.cw : e.item; }
function guestDay(d){
  if(d===0) return L('Today','Lero');
  if(d===1) return L('Yesterday','Dzulo');
  return L(d+' days ago','Masiku '+d+' apitawa');
}
function guestCatIcon(c){
  if(c==='Food') return _ic('wheat','currentColor');
  if(c==='Household') return _ic('flame','currentColor');
  if(c==='Personal') return _ic('graduation-cap','currentColor');
  if(c==='Transport') return _ic('bus','currentColor');
  return _ic('package','currentColor');
}

// ── Drawing ─────────────────────────────────────────────────────────────────
function guestRow(e){
  const ic = e.income ? _ic('trending-up','currentColor') : guestCatIcon(e.cat);
  return '<div class="gs-row"><div class="gs-ic'+(e.income?' inc':'')+'">'+ic+'</div>'
    +'<div class="gs-grow"><b>'+esc(guestName(e))+'</b><small>'+guestDay(e.day)+(e.income?'':' · '+esc(guestCat(e.cat)))+'</small></div>'
    +'<b class="gs-amt'+(e.income?' inc':'')+'">'+(e.income?'+ ':'- ')+MK(e.amount)+'</b></div>';
}
function guestBar(pct,cat){
  const col = pct>=100 ? 'var(--r1)' : pct>=85 ? 'var(--y1)' : (CAT_COLORS[cat]||'var(--p1)');
  return '<div class="gs-bar"><i style="width:'+Math.min(100,pct)+'%;background:'+col+'"></i></div>';
}
function guestAddButtons(){
  return '<div class="gs-actions"><button type="button" class="gs-btn gs-primary" onclick="guestOpenAdd(&quot;expense&quot;)">'+_ic('plus','currentColor')+' '+L('Add expense','Onjezani Zotuluka')+'</button>'
    +'<button type="button" class="gs-btn gs-outline" onclick="guestOpenAdd(&quot;income&quot;)">'+_ic('plus','currentColor')+' '+L('Add income','Onjezani Zolowa')+'</button></div>';
}
function guestPromo(){
  return '<div class="gs-promo"><b>'+L('Ready to track your own money?','Mwakonzeka kulemba ndalama zanu?')+'</b>'
    +'<p>'+L('Create a free account to save your records and share them with your household.','Tsegulani akaunti yaulere kuti musunge zolemba zanu ndi kugawana ndi banja lanu.')+'</p>'
    +'<button type="button" class="gs-btn gs-primary" onclick="guestGoAuth(&quot;register&quot;)">'+L('Create account','Tsegulani akaunti')+'</button>'
    +'<button type="button" class="gs-btn gs-outline" onclick="guestGoAuth(&quot;login&quot;)">'+L('Sign in','Lowani')+'</button></div>';
}
function guestHomeView(){
  const t = guestTotals(), pct = Math.round(t.spent/GUEST_BUDGET*100), left = GUEST_BUDGET - t.spent;
  let h = '<div class="gs-hero"><div class="gs-hero-top"><span>'+L('Balance','Zotsala')+'</span><span class="gs-pill">'+L('Sample data','Chitsanzo')+'</span></div>'
    +'<div class="gs-big">'+MK(t.balance)+'</div>'
    +'<div class="gs-two"><div><small>'+tx().income+'</small><b>'+MK(t.income)+'</b></div><div><small>'+tx().expense+'</small><b>'+MK(t.spent)+'</b></div></div></div>';
  h += guestAddButtons();
  h += '<div class="gs-h">'+L('Monthly budget','Bajeti ya Mwezi')+'</div>'
    +'<div class="gs-card"><div class="gs-line"><span class="gs-mut">'+tx().spent+'</span><b>'+MK(t.spent)+' / '+MK(GUEST_BUDGET)+'</b></div>'
    +guestBar(pct,'')
    +'<div class="gs-line" style="margin-top:10px"><span class="gs-mut">'+L(pct+'% used',pct+'% yagwiritsidwa')+'</span><b style="color:'+(left<0?'var(--r1)':'var(--p1)')+'">'+(left<0?L('Over by ','Yapitirira ')+MK(-left):MK(left)+' '+tx().left.toLowerCase())+'</b></div></div>';
  h += '<div class="gs-h">'+L('Recent','Zaposachedwa')+'<button type="button" class="gs-link" onclick="guestGo(&quot;log&quot;)">'+L('View all','Onani zonse')+'</button></div>'
    +'<div class="gs-card">'+guestAll().slice(0,4).map(guestRow).join('')+'</div>';
  return h + guestPromo();
}
function guestLogView(){
  return guestAddButtons()
    +'<div class="gs-h">'+L('All entries','Zolemba zonse')+'</div>'
    +'<div class="gs-card">'+guestAll().map(guestRow).join('')+'</div>'
    +'<p class="gs-note">'+L('Entries you add here are only for this demo. They disappear when you close or refresh the app.','Zolemba zomwe mwaonjezera apa ndi za chitsanzo chokha. Zimatha mukatseka kapena kutsegulanso pulogalamu.')+'</p>';
}
function guestInsightsView(){
  const t = guestTotals();
  let h = '<div class="gs-h">'+L('Spending by category','Zotuluka potengera gulu')+'</div><div class="gs-card">';
  GUEST_CATS.forEach(function(c){
    const sp = t.byCat[c[0]]||0, pct = Math.round(sp/c[1]*100);
    h += '<div class="gs-cat"><div class="gs-line"><b>'+esc(guestCat(c[0]))+'</b><span class="gs-mut">'+MK(sp)+' / '+MK(c[1])+'</span></div>'+guestBar(pct,c[0])+'</div>';
  });
  h += '</div><div class="gs-h">'+L('Savings goals','Zolinga zosunga')+'</div><div class="gs-card">';
  GUEST_GOALS.forEach(function(x){
    const pct = Math.round(x.saved/x.target*100);
    h += '<div class="gs-cat"><div class="gs-line"><b>'+esc(lang==='cw'?x.cw:x.en)+'</b><span class="gs-mut">'+MK(x.saved)+' / '+MK(x.target)+'</span></div>'+guestBar(pct,'')+'</div>';
  });
  return h + '</div>' + guestPromo();
}
function guestMoreView(){
  const keys = ['household','bills','chip','ai','premium'];
  let h = '<div class="gs-h">'+L('More features','Zina zomwe pulogalamu imachita')+'</div><div class="gs-card">';
  keys.forEach(function(k){
    const d = GUEST_GATES[k], tx2 = lang==='cw' ? d.cw : d.en;
    h += '<button type="button" class="gs-row gs-rowbtn" onclick="guestGate(&quot;'+k+'&quot;)"><div class="gs-ic">'+_ic(d.icon,'currentColor')+'</div>'
      +'<div class="gs-grow"><b>'+esc(tx2[0])+'</b></div>'+_ic('chevron-right','currentColor')+'</button>';
  });
  return h + '</div>' + guestPromo();
}
function guestGo(t){ guestTab = t; guestRender(); const b = g('gs-body'); if(b) b.scrollTop = 0; const s = g('scr-guest'); if(s) s.scrollTop = 0; }
function guestRender(){
  const body = g('gs-body'); if(!body) return;
  body.innerHTML = ({home:guestHomeView, log:guestLogView, insights:guestInsightsView, more:guestMoreView})[guestTab]();
  const tabs = [['home','home',tx().home],['log','plus-circle',tx().log],['insights','pie-chart',L('Insights','Zomwe zikuonetsa')],['more','settings',L('More','Zina')]];
  const nav = g('gs-nav');
  nav.innerHTML = tabs.map(function(t){
    const ic = t[1]==='home' ? _ic('home','currentColor') : t[1]==='plus-circle' ? _ic('plus-circle','currentColor') : t[1]==='pie-chart' ? _ic('pie-chart','currentColor') : _ic('settings','currentColor');
    return '<button type="button" class="'+(t[0]===guestTab?'on':'')+'" onclick="guestGo(&quot;'+t[0]+'&quot;)"'+(t[0]===guestTab?' aria-current="page"':'')+'>'+ic+'<span>'+esc(t[2])+'</span></button>';
  }).join('');
  guestSyncLangBtns();
  try{ if(window.lucide) lucide.createIcons({nodes:[g('scr-guest')]}); }catch(e){}
}

// ── Bottom sheet: add an entry, or "this needs an account" ──────────────────
function guestOpenSheet(html){
  const s = g('gs-sheet'); if(!s) return;
  s.innerHTML = '<div class="gs-sheet-in" role="dialog" aria-modal="true">'+html+'</div>';
  s.classList.remove('hide');
  try{ if(window.lucide) lucide.createIcons({nodes:[s]}); }catch(e){}
  const f = s.querySelector('input'); if(f) setTimeout(function(){ try{ f.focus(); }catch(e){} },60);
}
function guestCloseSheet(){
  const s = g('gs-sheet'); if(!s) return;
  s.classList.add('hide'); s.innerHTML = '';
}
function guestSheetBg(ev){ if(ev && ev.target && ev.target.id==='gs-sheet') guestCloseSheet(); }
function guestOpenAdd(type){
  guestSheetType = type==='income' ? 'income' : 'expense';
  const inc = guestSheetType==='income';
  let h = '<div class="gs-line"><h3>'+(inc?L('Add income','Onjezani Zolowa'):L('Add expense','Onjezani Zotuluka'))+'</h3>'
    +'<button type="button" class="gs-link" onclick="guestCloseSheet()">'+tx().cancel+'</button></div>'
    +'<p class="gs-note" style="text-align:left;margin:0 0 10px">'+L('Demo only. This is not saved anywhere.','Chitsanzo chokha. Sichisungidwa kulikonse.')+'</p>'
    +'<label for="gs-desc">'+L('What was it for? (optional)','Zinali za chiyani? (sikofunikira)')+'</label>'
    +'<input id="gs-desc" type="text" maxlength="40" autocomplete="off" placeholder="'+(inc?L('e.g. Piece work','mwachitsanzo: Ganyu'):L('e.g. Tomatoes','mwachitsanzo: Tomato'))+'">'
    +'<label for="gs-amt">'+L('Amount (MK)','Ndalama (MK)')+'</label>'
    +'<input id="gs-amt" type="number" inputmode="numeric" min="1" max="100000000" placeholder="'+(inc?'50000':'5000')+'">';
  if(!inc){
    h += '<label for="gs-cat">'+L('Category','Gulu')+'</label><select id="gs-cat">'
      +GUEST_CATS.map(function(c){ return '<option value="'+c[0]+'">'+esc(guestCat(c[0]))+'</option>'; }).join('')+'</select>';
  }
  h += '<div class="gs-err" id="gs-err" role="alert"></div>'
    +'<button type="button" class="gs-btn gs-primary" onclick="guestSaveEntry()">'+L('Try it in the demo','Yesani pa chitsanzo')+'</button>'
    +'<button type="button" class="gs-btn gs-outline" onclick="guestGate(&quot;save&quot;)">'+L('How do I save my real records?','Ndingasunge bwanji zolemba zanga zenizeni?')+'</button>';
  guestOpenSheet(h);
}
function guestSaveEntry(){
  const inc = guestSheetType==='income';
  const err = g('gs-err');
  const amount = Math.round(Number(g('gs-amt').value));
  if(!Number.isFinite(amount) || amount<=0 || amount>100000000){
    if(err) err.textContent = L('Enter an amount greater than zero.','Lowetsani ndalama zoposa zero.');
    return false;
  }
  if(guestEntries.length>=30){
    if(err) err.textContent = L('The demo is full. Create an account to keep going.','Chitsanzochi chadzaza. Tsegulani akaunti kuti mupitirize.');
    return false;
  }
  const catEl = g('gs-cat');
  const known = catEl ? GUEST_CATS.filter(function(c){ return c[0]===catEl.value; })[0] : null;
  const cat = inc ? 'Other' : (known ? known[0] : 'Other');
  const typed = (g('gs-desc').value||'').trim().slice(0,40);
  const entry = {amount:amount, cat:cat, income:inc, day:0, item:typed, cw:''};
  if(!typed){
    entry.item = inc ? 'Income' : cat;
    entry.cw = inc ? 'Ndalama Zolowa' : (GUEST_CAT_CW[cat]||cat);
  }
  guestEntries.unshift(entry);
  guestCloseSheet(); guestRender();
  try{ toast(L('Added to the demo. Nothing is saved.','Zawonjezedwa pa chitsanzo. Palibe chosungidwa.'),'s'); }catch(e){}
  return true;
}
// Called wherever a guest taps something that needs a real account.
function guestGate(key){
  const d = GUEST_GATES[key] || GUEST_GATES.save, c = lang==='cw' ? d.cw : d.en;
  guestOpenSheet('<div class="gs-gate"><div class="gs-ic big">'+_ic(d.icon,'currentColor')+'</div><h3>'+esc(c[0])+'</h3><p>'+esc(c[1])+'</p></div>'
    +'<button type="button" class="gs-btn gs-primary" onclick="guestGoAuth(&quot;register&quot;)">'+L('Create account','Tsegulani akaunti')+'</button>'
    +'<button type="button" class="gs-btn gs-outline" onclick="guestGoAuth(&quot;login&quot;)">'+L('Sign in','Lowani')+'</button>'
    +'<button type="button" class="gs-link" style="display:block;margin:12px auto 0" onclick="guestCloseSheet()">'+L('Keep exploring','Pitirizani kuyesa')+'</button>');
}
document.addEventListener('keydown', function(e){ if(e.key==='Escape') guestCloseSheet(); });
