'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const LIMIT = 300;
  let auth, db, currentPage = 'overview';
  const cache = { users: [], households: [], payments: [], chipereganyu: [], logs: [] };
  const fmt = v => { const n = toMs(v); return n === null ? '—' : new Date(n).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}); };
  const toMs = v => { if(v===null||v===undefined||v==='') return null; if(v&&typeof v.toMillis==='function') return v.toMillis(); if(typeof v==='number') return v; const n=new Date(v).getTime(); return Number.isNaN(n)?null:n; };
  const money = n => new Intl.NumberFormat('en-MW',{style:'currency',currency:'MWK',maximumFractionDigits:0}).format(Number(n)||0);
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const badge = s => `<span class="badge ${esc(String(s||'').toLowerCase())}">${esc(String(s||'unknown').replaceAll('_',' '))}</span>`;
  const showNotice = msg => { $('notice').textContent=msg; $('notice').hidden=!msg; };
  function firebaseInit(){
    if(!window.firebase) throw new Error('Firebase could not load. Check your internet connection.');
    if(!firebase.apps.length) firebase.initializeApp({apiKey:'AIzaSyA5TdvAFE0cFkme7O--LtJNKIikM-KXFdM',authDomain:'bajeti-yanga.firebaseapp.com',projectId:'bajeti-yanga',storageBucket:'bajeti-yanga.firebasestorage.app',messagingSenderId:'585037359165',appId:'1:585037359165:web:01b831d5277faed34be254'});
    auth=firebase.auth(); db=firebase.firestore();
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
  }
  function setUser(user){
    $('loginView').hidden=!!user; $('appView').hidden=!user;
    if(user){$('adminName').textContent=user.displayName||'Administrator';$('adminEmail').textContent=user.email||'';$('avatar').textContent=(user.displayName||user.email||'A').slice(0,1).toUpperCase();}
  }
  async function signIn(){
    $('loginError').textContent='';$('googleLogin').disabled=true;$('googleLogin').textContent='Connecting…';
    try { const p=new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({prompt:'select_account'}); await auth.signInWithRedirect(p); }
    catch(e){$('loginError').textContent=cleanAuthError(e);$('googleLogin').disabled=false;$('googleLogin').textContent='Continue with Google';}
  }
  function cleanAuthError(e){ return e && e.code==='auth/unauthorized-domain' ? 'This GitHub Pages domain is not authorised in Firebase Authentication.' : (e.message||'Google sign-in failed. Please try again.'); }
  async function verifyAdmin(user){
    const tokenResult=await user.getIdTokenResult(true);
    const signInProvider=tokenResult.claims&&tokenResult.claims.firebase&&tokenResult.claims.firebase.sign_in_provider;
    if(signInProvider!=='google.com' || !user.emailVerified){ await auth.signOut(); throw new Error('Use the approved Google account. Email/password sign-in is not accepted.'); }
    let snap;
    try { snap=await db.collection('adminUsers').doc(user.uid).get(); }
    catch(e){ await auth.signOut(); throw new Error('Admin access could not be checked. Publish the updated Firestore rules, then try again.'); }
    if(!snap.exists || snap.data().enabled!==true){ await auth.signOut(); throw new Error('This Google account has not been authorised as an administrator yet.'); }
  }
  async function rows(collection){ let q=db.collection(collection); if(collection==='payments') q=q.orderBy('createdAtMs','desc'); if(collection==='adminLog') q=q.orderBy('atMs','desc'); const s=await q.limit(LIMIT).get(); return s.docs.map(d=>({id:d.id,...d.data()})); }
  function premiumState(h, now=Date.now()){
    const expiry=toMs(h.premiumExpiry);
    if(h.isPremium===true) return (!h.premiumExpiry||expiry===null||expiry>=now)?'premium':'premium_expired';
    const trial=toMs(h.trialStarted)||(h.config&&toMs(h.config.trialStarted));
    if(trial) return now-trial<14*86400000?'trial':'trial_ended';
    return 'free';
  }
  async function loadAll(){
    showNotice('Loading up to '+LIMIT+' records per section.');
    const names=['users','households','payments','chipereganyu_groups','adminLog'];
    const settled=await Promise.allSettled(names.map(rows));
    const keys=['users','households','payments','chipereganyu','logs'];
    const errors=[];
    settled.forEach((r,i)=>{ if(r.status==='fulfilled') cache[keys[i]]=r.value; else {cache[keys[i]]=[];errors.push(names[i]+': '+(r.reason&&r.reason.message||'read denied'));} });
    showNotice(errors.length?'Some sections could not be read. Check that the Spark Firestore rules were published: '+errors.join(' · '):'Showing a maximum of '+LIMIT+' records per section to limit free-plan usage.');
    renderOverview(); renderPage(currentPage);
  }
  function renderOverview(){
    const users=cache.users, hhs=cache.households.filter(h=>!h.deletedAt), pays=cache.payments;
    const states={}; hhs.forEach(h=>{const s=premiumState(h);states[s]=(states[s]||0)+1;});
    const paid=pays.filter(p=>p.status==='paid'); const revenue=paid.reduce((n,p)=>n+(Number(p.amount)||0),0);
    $('stats').innerHTML=stat('User profiles loaded',users.length.toLocaleString(),'Firestore user documents','♙')+stat('Active households',hhs.length.toLocaleString(),'From the latest household records','⌂')+stat('Recorded paid value',money(revenue),'From up to '+LIMIT+' payment records','↗')+stat('Premium households',(states.premium||0).toLocaleString(),(states.trial||0)+' currently in trial','◇');
    const labels=[['premium','Premium'],['trial','Trial'],['free','Free'],['premium_expired','Expired Premium'],['trial_ended','Trial ended']]; const total=Math.max(1,labels.reduce((s,[k])=>s+(states[k]||0),0));
    $('stateBreakdown').innerHTML=labels.map(([k,l])=>`<div class="state-row"><span>${l}</span><div class="track"><div class="fill ${k.includes('expired')||k==='trial_ended'?'expired':k}" style="width:${(states[k]||0)/total*100}%"></div></div><b>${states[k]||0}</b></div>`).join('');
    const by={}; pays.forEach(p=>by[p.status||'unknown']=(by[p.status||'unknown']||0)+1);
    $('paymentSummary').innerHTML=Object.entries(by).map(([k,v])=>`<div class="summary-row"><span>${badge(k)}</span><b>${v}</b></div>`).join('')||'<p class="muted">No payment records could be loaded.</p>';
    const pending=pays.filter(p=>p.status==='pending'&&Date.now()-(toMs(p.createdAtMs)||0)>3600000).length;
    const legacy=hhs.filter(h=>h.config&&h.config.isPremium===true&&h.isPremium!==true).length;
    $('attentionList').innerHTML=[['Pending payments older than one hour',pending],['Legacy Premium records',legacy],['Chipereganyu groups loaded',cache.chipereganyu.length]].map(([l,n])=>`<div class="attention-row"><span>${l}</span><span class="num">${n}</span></div>`).join('');
    $('coverageInfo').innerHTML=`<p>Each section loads at most <b>${LIMIT}</b> documents.</p><p>This dashboard does not list Firebase Authentication accounts or last sign-in times. It reads only the user profile documents the app stores in Firestore.</p><p>It does not read individual household purchases or Chipereganyu contribution details.</p>`;
  }
  function stat(label,value,note,icon){return `<article class="stat"><div class="stat-top"><span class="stat-label">${esc(label)}</span><i class="stat-icon">${icon}</i></div><div class="stat-value">${esc(value)}</div><div class="stat-foot">${esc(note)}</div></article>`;}
  function navigate(page){currentPage=page;document.querySelectorAll('.page').forEach(x=>x.hidden=x.id!=='page-'+page);document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===page));const title=({overview:'Overview',users:'Users',households:'Households',payments:'Payments',chipereganyu:'Chipereganyu',logs:'Admin activity'})[page]||'Overview';$('pageTitle').textContent=title;$('crumb').textContent='WORKSPACE / '+title.toUpperCase();renderPage(page);}
  function renderPage(page){if(page==='users')renderUsers();if(page==='households')renderHouseholds();if(page==='payments')renderPayments();if(page==='chipereganyu')renderChip();if(page==='logs')renderLogs();}
  function renderUsers(){const q=$('userSearch').value.toLowerCase();const rows=cache.users.filter(u=>[u.displayName,u.email,u.id,u.householdId].join(' ').toLowerCase().includes(q));$('userCount').textContent=`${rows.length} of ${cache.users.length} loaded`;$('usersBody').innerHTML=rows.map(u=>`<tr><td><div class="cell-main">${esc(u.displayName||'Unnamed user')}</div><div class="cell-sub">${esc(u.email||u.id)}</div></td><td>${esc(u.householdId||'—')}</td><td>${Array.isArray(u.ownedHouseholds)?u.ownedHouseholds.length:0}</td><td>${fmt(u.premiumUntil)}</td><td>${u.pendingDeletion?badge('pending deletion'):badge('registered')}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No matching user profiles.</td></tr>';}
  function renderHouseholds(){const q=$('householdSearch').value.toLowerCase();const rows=cache.households.filter(h=>[h.id,h.owner,h.name].join(' ').toLowerCase().includes(q));$('householdCount').textContent=`${rows.length} of ${cache.households.length} loaded`;$('householdsBody').innerHTML=rows.map(h=>`<tr><td><div class="cell-main">${esc(h.name||h.id)}</div><div class="cell-sub">${esc(h.id)}</div></td><td>${esc(h.owner||'—')}</td><td>${Array.isArray(h.memberUids)?h.memberUids.length:0}</td><td>${badge(premiumState(h))}</td><td>${h.deletedAt?badge('deleted'):badge('active')}</td><td><button class="row-btn" data-detail="${esc(h.id)}">Details</button></td></tr>`).join('')||'<tr><td colspan="6" class="empty">No matching households.</td></tr>';}
  function renderPayments(){const q=$('paymentSearch').value.toLowerCase(),f=$('paymentFilter').value;const rows=cache.payments.filter(p=>(f==='all'||p.status===f)&&[p.id,p.uid,p.householdId,p.status].join(' ').toLowerCase().includes(q));$('paymentCount').textContent=`${rows.length} of ${cache.payments.length} loaded`;$('paymentsBody').innerHTML=rows.map(p=>`<tr><td><div class="cell-main">${esc(p.id)}</div><div class="cell-sub">${esc(p.source||'paychangu')}</div></td><td><div>${esc(p.uid||'—')}</div><div class="cell-sub">${esc(p.householdId||'—')}</div></td><td>${money(p.amount)}</td><td>${p.months||'—'} months</td><td>${fmt(p.paidAtMs||p.createdAtMs)}</td><td>${badge(p.status)}</td></tr>`).join('')||'<tr><td colspan="6" class="empty">No payment records found or access not enabled.</td></tr>';}
  function renderChip(){const q=$('chipSearch').value.toLowerCase();const rows=cache.chipereganyu.filter(g=>[g.id,g.name,g.title,g.createdBy].join(' ').toLowerCase().includes(q));$('chipCount').textContent=`${rows.length} of ${cache.chipereganyu.length} loaded`;$('chipBody').innerHTML=rows.map(g=>`<tr><td><div class="cell-main">${esc(g.name||g.title||g.id)}</div><div class="cell-sub">${esc(g.id)}</div></td><td>${esc(g.createdBy||'—')}</td><td>${Array.isArray(g.memberUids)?g.memberUids.length:0}</td><td>${badge(g.status||'unknown')}</td><td>${fmt(g.createdAt||g.created)}</td></tr>`).join('')||'<tr><td colspan="5" class="empty">No groups found or access not enabled.</td></tr>';}
  function renderLogs(){const rows=cache.logs.sort((a,b)=>(toMs(b.atMs)||0)-(toMs(a.atMs)||0));$('logsBody').innerHTML=rows.map(x=>`<tr><td>${fmt(x.atMs)}</td><td>${esc(x.by||'—')}</td><td>${esc(x.action||'—')}</td><td>${esc(x.target||'—')}</td></tr>`).join('')||'<tr><td colspan="4" class="empty">No admin activity records are available.</td></tr>';}
  async function householdDetail(id){$('detailTitle').textContent=id;$('detailContent').innerHTML='<p class="muted">Loading household details…</p>';$('detailModal').hidden=false;try{const snap=await db.collection('households').doc(id).get();if(!snap.exists)throw new Error('Household not found.');const h=snap.data();$('detailContent').innerHTML=`<div class="detail-grid"><div class="detail-item"><small>Owner UID</small><b>${esc(h.owner||'—')}</b></div><div class="detail-item"><small>Members</small><b>${Array.isArray(h.memberUids)?h.memberUids.length:0}</b></div><div class="detail-item"><small>Subscription</small><b>${esc(premiumState(h))}</b></div><div class="detail-item"><small>Deleted</small><b>${h.deletedAt?'Yes':'No'}</b></div></div><p class="fine">For privacy, this screen intentionally does not display household budget configuration or individual purchases.</p>`;}catch(e){$('detailContent').innerHTML=`<p class="error">${esc(e.message)}</p>`;}}
  async function refreshPage(page){try{const col=({users:'users',households:'households',payments:'payments',chipereganyu:'chipereganyu_groups',logs:'adminLog'})[page];cache[page]=await rows(col);renderPage(page);if(page==='overview')renderOverview();showNotice('Refreshed '+page+'. Showing at most '+LIMIT+' documents.');}catch(e){showNotice('Could not refresh '+page+': '+e.message);}}
  function bind(){
    $('googleLogin').addEventListener('click',signIn);$('signOut').addEventListener('click',()=>auth.signOut());
    $('nav').addEventListener('click',e=>{const b=e.target.closest('[data-page]');if(b)navigate(b.dataset.page);});
    $('refreshOverview').addEventListener('click',loadAll);
    document.querySelectorAll('[data-refresh]').forEach(b=>b.addEventListener('click',()=>refreshPage(b.dataset.refresh)));
    ['userSearch','householdSearch','paymentSearch','chipSearch'].forEach(id=>$(id).addEventListener('input',()=>({userSearch:renderUsers,householdSearch:renderHouseholds,paymentSearch:renderPayments,chipSearch:renderChip}[id])()));
    $('paymentFilter').addEventListener('change',renderPayments);
    $('householdsBody').addEventListener('click',e=>{const b=e.target.closest('[data-detail]');if(b)householdDetail(b.dataset.detail);});
    $('closeDetail').addEventListener('click',()=>$('detailModal').hidden=true);$('detailModal').addEventListener('click',e=>{if(e.target===$('detailModal'))$('detailModal').hidden=true;});
  }
  try{
    firebaseInit();bind();
    auth.onAuthStateChanged(async user=>{
      if(!user){setUser(null);$('googleLogin').disabled=false;$('googleLogin').textContent='Continue with Google';return;}
      try{await verifyAdmin(user);setUser(user);await loadAll();}
      catch(e){setUser(null);$('loginError').textContent=e.message;$('googleLogin').disabled=false;$('googleLogin').textContent='Continue with Google';}
    });
  }catch(e){$('loginError').textContent=e.message;}
})();
