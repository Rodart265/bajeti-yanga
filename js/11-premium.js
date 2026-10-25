// ===============================================
// PREMIUM / TRIAL SYSTEM — Firestore-based
// ===============================================
const TRIAL_DAYS = 14;
const PREMIUM_FEATURES = ['charts','export_pdf','bill_tracker','copy_month','unlimited_ai','trash'];

// Premium is now stored as isPremium:true on the Firestore household document.
// To activate premium for a household:
//   1. Go to Firebase Console → Firestore
//   2. Open households → [your-household-id]
//   3. Add field: isPremium = true (boolean)
//   4. Optionally add: premiumExpiry = "2026-12-31" (string) to set an end date
// No code changes needed — it reads live from Firestore via lCfg.

// FIX 3: Keep a reference to the raw household document data
// so isPremium written to the document root (not inside config) is detected.

function getPremiumStatus(){
  const cfg = lCfg;
  // Check both config.isPremium AND root-level isPremium (Firestore admin may write either)
  const isPrem = cfg.isPremium || (lHHDoc && lHHDoc.isPremium) || false;
  const expiry = cfg.premiumExpiry || (lHHDoc && lHHDoc.premiumExpiry) || null;
  if(isPrem){
    if(expiry){
      const expiryDate = _expiryEnd(expiry);
      const now = new Date();
      const expired = expiryDate < now;
      if(expired) return {isPremium:false, isTrial:false, isExpired:true, daysLeft:0};
      const daysLeft = Math.ceil((expiryDate - now) / 86400000);
      return {isPremium:true, isTrial:false, isExpired:false, isAdmin:false, daysLeft};
    }
    return {isPremium:true, isTrial:false, isExpired:false, isAdmin:false, daysLeft:null};
  }
  // Trial period fallback
  const started = cfg.trialStarted || (lHHDoc && lHHDoc.trialStarted) || null;
  if(!started) return {isPremium:false, isTrial:false, isExpired:false, daysLeft:0};
  const startedMs = _toMs(started);   // root trialStarted is a Firestore Timestamp; legacy config.trialStarted is an ISO string
  if(isNaN(startedMs)) return {isPremium:false, isTrial:false, isExpired:false, daysLeft:0};
  const daysUsed = Math.floor((Date.now() - startedMs) / 86400000);
  const daysLeft = Math.max(0, TRIAL_DAYS - daysUsed);
  return {isPremium:daysLeft>0, isTrial:true, isExpired:false, daysLeft};
}

function hasPremiumFeature(f){
  return getPremiumStatus().isPremium;
}

function premiumGate(featureName, onGranted){
  if(hasPremiumFeature(featureName)){ onGranted(); return; }
  const status = getPremiumStatus();
  showUpgradePrompt(featureName, status);
}

function showUpgradePrompt(feature, status){
  const names = {
    charts:'Visual Charts', export_pdf:'PDF Export', bill_tracker:'Bill Tracker',
    copy_month:'Copy Previous Month', unlimited_ai:'Unlimited Bajeti AI', trash:'Trash / Undo Delete',
    receipt_scan:'Receipt Scanner',
    chat_conversations:'Chat Conversations (Premium)'
  };
  const isCW = lang === 'cw';
  const featureName = names[feature] || feature;
  let h = '<div class="dh"></div>';
  h += '<div style="text-align:center;padding:8px 0 16px">';
  h += '<div style="width:56px;height:56px;border-radius:var(--cr);background:linear-gradient(135deg,#4A148C,#7B1FA2);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;box-shadow:0 6px 20px rgba(74,20,140,.35)"><i data-lucide="gem" style="width:26px;height:26px;color:#fff"></i></div>';
  h += '<h3 style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1.05rem;margin-bottom:6px">'+featureName+' '+(isCW?'ndi ya Premium':'is Premium')+'</h3>';
  h += '<div style="font-size:.78rem;color:var(--mid);margin-bottom:14px;line-height:1.5">'+(isCW?'Sandutsani kuti mutsegule ichi ndi zina zonse.':'Upgrade to unlock this and all other premium features.')+'</div>';
  h += '<div style="font-size:.75rem;color:var(--mid);margin-bottom:16px;text-align:left;background:var(--mist);border-radius:var(--cr-md);padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:6px">';
  [['bar-chart-2','Charts'],['file-text','PDF Export'],['bell','Bill Tracker'],['cpu','Unlimited AI'],['trash-2','Trash & Undo'],['copy','Copy Month']].forEach(function(f){
    h += '<div style="display:flex;align-items:center;gap:5px"><i data-lucide="'+f[0]+'" style="width:12px;height:12px;color:var(--p1);flex-shrink:0"></i><span>'+f[1]+'</span></div>';
  });
  h += '</div>';
  h += '<button class="btnM" style="width:100%;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:6px" onclick="closeM(\'mv-u\');showPremiumPage()"><i data-lucide="gem" style="width:16px;height:16px"></i> '+(isCW?'Pitani ku Premium':'Upgrade to Premium')+'</button>';
  h += '<button onclick="closeM(\'mv-u\')" style="background:none;border:none;color:var(--mid);font-size:.8rem;font-family:inherit;cursor:pointer;padding:8px 16px;display:block;margin:0 auto">'+(isCW?'Mwina Mawa':'Maybe Later')+'</button>';
  h += '</div>';
  g('mb-u').innerHTML = h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-u')]});
  openM('mv-u');
}

function approveJoin(uid){
  if(!hhId||!curUser) return;
  const reqRef = db.collection('households').doc(hhId).collection('joinRequests').doc(uid);
  reqRef.get().then(function(reqSnap){
    const reqData = reqSnap.exists ? reqSnap.data() : {};
    const memberName = (reqData.displayName || (reqData.email?reqData.email.split('@')[0]:'') || 'New Member').trim();
    // Add them as a real member in config — not just Firestore access — so they
    // show up on the Members screen and their purchases attribute to them
    // instead of silently falling back to the owner (u1).
    const cfg = JSON.parse(JSON.stringify(lCfg));
    if(!cfg.users) cfg.users = [];
    if(!cfg.users.find(u=>u.id===uid)){
      const usedColors = cfg.users.map(u=>sC(u.color));
      const color = MEMBER_COLORS.find(c=>!usedColors.includes(c)) || MEMBER_COLORS[cfg.users.length % MEMBER_COLORS.length];
      cfg.users.push({id: uid, name: memberName, color: color});
    }
    const batch = db.batch();
    // Grant Firestore access + add as a config member in one write to the household
    // doc (which the owner is allowed to write). We deliberately never write to
    // users/{uid} here — that's the joining user's own doc, and security rules
    // correctly block anyone else writing to it (this was the "Permission denied"
    // bug). The joining user's own client writes householdId to their own doc once
    // they detect they've been added to memberUids — see pollForApproval / _poll /
    // bootApp / joinHH's already-a-member fast path.
    batch.update(db.collection('households').doc(hhId), {
      memberUids: firebase.firestore.FieldValue.arrayUnion(uid),
      config: cfg
    });
    batch.delete(reqRef);
    // Approval is committed first; the marker that lets the joiner notice it is a best-effort follow-up.
    return batch.commit().then(()=>_markApproved(hhId, uid));
  })
    .then(()=>{
      toast(lang==='cw'?'Membala wavomerezedwa!':'Member approved!','s');
      stgOpenSection('members');
    })
    .catch(e=>toast((lang==='cw'?'Kuvomereza kwalephera: ':'Approval failed: ')+(e&&e.code||'error')+'.','e'));
}

function declineJoin(uid){
  if(!hhId) return;
  appConfirm(
    lang==='cw'?'Mukufuna kukana pempho ili?':'Decline this join request?',
    function(){
      db.collection('households').doc(hhId).collection('joinRequests').doc(uid).delete()
        .then(()=>{ toast(lang==='cw'?'Pempho lakanidwa.':'Request declined.','i'); stgOpenSection('members'); })
        .catch(e=>toast((lang==='cw'?'Cholakwika: ':'Error: ')+(e&&e.code||'error')+'.','e'));
    }, null, true
  );
}

// PayChangu payment link
const PAYCHANGU_LINK = 'https://pay.paychangu.com/SC-8UGBUH';

// Currently selected plan: {months, price, label}
let _selectedPlan = null;

function showPremiumPage(){
  const status = getPremiumStatus();
  const isCW = lang === 'cw';

  // PayChangu badge SVG
  const paychanguBadge = '<div style="display:inline-flex;align-items:center;gap:6px;background:#fff;border-radius:var(--cr-md);padding:6px 12px;box-shadow:0 2px 8px rgba(0,0,0,.12)">'
    +'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7B1FA2" stroke-width="2.5"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>'
    +'<span style="font-size:.7rem;font-weight:800;color:#7B1FA2;font-family:Hanken Grotesk,sans-serif">Secure Payment via PayChangu</span>'
    +'</div>';

  let h = '<div class="dh"></div>';

  // Hero header with real app logo
  h += '<div style="margin:-2px -18px 0;padding:28px 20px 24px;background:linear-gradient(145deg,#4A148C 0%,#6A1B9A 45%,#8E24AA 100%);border-radius:0 0 24px 24px;text-align:center;position:relative;overflow:hidden">';
  h += '<div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,.06)"></div>';
  h += '<div style="position:absolute;bottom:-20px;left:-20px;width:80px;height:80px;border-radius:50%;background:rgba(255,255,255,.05)"></div>';
  h += '<div style="width:60px;height:60px;border-radius:var(--cr);background:rgba(255,255,255,.15);border:2px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;margin:0 auto 10px">';
  h += APP_LOGO_SVG(44);
  h += '</div>';
  h += '<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1.3rem;color:#fff;letter-spacing:-.3px;margin-bottom:4px">Bajeti Yanga Premium</div>';
  h += '<div style="font-size:.76rem;color:rgba(255,255,255,.75);max-width:240px;margin:0 auto 12px;line-height:1.5">Unlock the full power of your money. Built in Malawi, for Malawian families.</div>';
  h += paychanguBadge;
  h += '</div>';

  // If already premium — show status (comfortably active: no urgent action needed)
  // If premium but expiring soon, fall through to the plan selector below so
  // there's an actual way to pay — this used to dead-end at a "Close" button.
  if(status.isPremium && !status.isTrial){
    const expiry = lCfg.premiumExpiry || (lHHDoc && lHHDoc.premiumExpiry) || null;
    const expiryStr = expiry ? fmtDate(expiry.split('T')[0]) : (isCW ? 'Palibe tsiku lotha' : 'No expiry set');
    const daysLeft = expiry ? Math.max(0, Math.ceil((_expiryEnd(expiry) - new Date()) / 86400000)) : null;
    const nearExpiry = daysLeft !== null && daysLeft <= 7;
    if(nearExpiry){
      h += '<div style="margin:16px 0;background:linear-gradient(135deg,#FFF3E0,#FFF8E1);border:1.5px solid #FFCC80;border-radius:var(--cr);padding:16px">';
      h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">';
      h += '<div style="width:36px;height:36px;border-radius:var(--cr-md);background:#E6510020;display:flex;align-items:center;justify-content:center"><i data-lucide="clock" style="width:18px;height:18px;color:#E65100"></i></div>';
      h += '<div><div style="font-weight:800;font-size:.88rem;color:#BF360C">'+(isCW?'Premium Yanu Yatsala Masiku '+daysLeft:'Premium Expires in '+daysLeft+' Day'+(daysLeft===1?'':'s'))+'</div>';
      h += '<div style="font-size:.68rem;color:#E65100">'+(isCW?'Idzatha pa':'Expires')+': '+expiryStr+'</div></div></div>';
      h += '<div style="font-size:.76rem;color:#5D4037;line-height:1.6">'+(isCW?'Bwezerani tsopano kuti mupitirize kugwiritsa ntchito zonse za Premium mopanda kusokonezeka.':'Renew now to keep uninterrupted access to Bill Tracker, PDF export, unlimited AI, and more.')+'</div>';
      h += '</div>';
      // fall through — plan selector + Proceed to Payment button render below
    } else {
      h += '<div style="margin:16px 0;background:linear-gradient(135deg,#E8F5E9,#F1F8E9);border:1.5px solid #A5D6A7;border-radius:var(--cr);padding:16px">';
      h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">';
      h += '<div style="width:36px;height:36px;border-radius:var(--cr-md);background:#2E7D3220;display:flex;align-items:center;justify-content:center"><i data-lucide="gem" style="width:18px;height:18px;color:#2E7D32"></i></div>';
      h += '<div><div style="font-weight:800;font-size:.88rem;color:#1B5E20">'+(isCW?'Premium Yanu Ikugwira Ntchito!':'Your Premium is Active!')+'</div>';
      h += '<div style="font-size:.68rem;color:#388E3C">'+(isCW?'Idzatha pa':'Expires')+': '+expiryStr+(daysLeft!==null?' ('+daysLeft+(isCW?' tsiku':'d')+')':'')+'</div></div></div>';
      h += '<button onclick="closeM(\'mv-u\')" style="width:100%;background:none;border:1.5px solid #A5D6A7;border-radius:var(--cr-md);padding:9px;font-family:Hanken Grotesk,sans-serif;font-weight:700;font-size:.8rem;color:#2E7D32;cursor:pointer">'+(isCW?'Tsekani':'Close')+'</button>';
      h += '</div>';
      g('mb-u').innerHTML = h;
      if(window.lucide)lucide.createIcons({nodes:[g('mb-u')]});
      openM('mv-u');
      return;
    }
  }


  // Feature grid
  const feats = [
    ['bar-chart-2','Visual Charts','Pie + bar charts by category','#7B1FA2'],
    ['file-text','PDF Export','Printable branded reports','#1565C0'],
    ['bell','Bill Tracker','ESCOM, water, rent due dates','#E65100'],
    ['cpu','Unlimited AI','No daily message limit','#00695C'],
    ['trash-2','30-Day Trash','Undo accidental deletes','#B71C1C'],
    ['copy','Copy Month','Repeat last month in one tap','#4527A0'],
    ['camera','Receipt Scan','Camera scan receipts','#1B5E20']
  ];
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0 14px">';
  feats.forEach(function(f){
    h += '<div style="background:var(--mist);border-radius:var(--cr-md);padding:10px 11px;display:flex;align-items:flex-start;gap:10px">';
    h += '<div style="width:34px;height:34px;border-radius:var(--cr-md);background:'+f[3]+'18;display:flex;align-items:center;justify-content:center;flex-shrink:0">';
    h += '<i data-lucide="'+f[0]+'" style="width:17px;height:17px;color:'+f[3]+'"></i></div>';
    h += '<div style="padding-top:2px"><div style="font-weight:700;font-size:.78rem;color:var(--ink)">'+f[1]+'</div>';
    h += '<div style="font-size:.65rem;color:var(--mid);margin-top:2px;line-height:1.4">'+f[2]+'</div></div>';
    h += '</div>';
  });
  h += '</div>';

  // Plan selector
  h += '<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.72rem;text-transform:uppercase;letter-spacing:.6px;color:var(--mid);margin-bottom:8px">'+(isCW?'Sankhani Phukusi':'Choose a Plan')+'</div>';
  h += '<div style="display:flex;gap:8px;margin-bottom:16px">';

  // 1 Month plan
  h += '<div id="plan-1m" onclick="selectPlan(1,2500)" style="flex:1;background:var(--white);border:2px solid var(--border);border-radius:var(--cr);padding:14px 10px;text-align:center;cursor:pointer;transition:all .2s">';
  h += '<div style="font-size:.63rem;font-weight:700;color:var(--mid);text-transform:uppercase;letter-spacing:.3px;margin-bottom:5px">'+(isCW?'Mwezi 1':'1 Month')+'</div>';
  h += '<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1.2rem;color:var(--ink)">MK 2,500</div>';
  h += '<div style="font-size:.62rem;color:var(--mid);margin-top:2px">'+(isCW?'pa mwezi':'per month')+'</div>';
  h += '</div>';

  // 3 Month plan — highlighted
  h += '<div id="plan-3m" onclick="selectPlan(3,7000)" style="flex:1;background:linear-gradient(145deg,#4A148C,#7B1FA2);border:2px solid #CE93D8;border-radius:var(--cr);padding:14px 10px;text-align:center;cursor:pointer;position:relative;box-shadow:0 6px 24px rgba(106,27,154,.35)">';
  h += '<div style="position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:linear-gradient(90deg,#FFD700,#FFA000);color:#4A148C;font-size:.58rem;font-weight:900;padding:2px 10px;border-radius:var(--cr-md);white-space:nowrap;letter-spacing:.3px">'+(isCW?'MTENGO WABWINO':'BEST VALUE')+'</div>';
  h += '<div style="font-size:.63rem;font-weight:700;color:rgba(255,255,255,.7);text-transform:uppercase;letter-spacing:.3px;margin-bottom:5px">'+(isCW?'Miyezi 3':'3 Months')+'</div>';
  h += '<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1.2rem;color:#fff">MK 7,000</div>';
  h += '<div style="font-size:.62rem;color:rgba(255,255,255,.65);margin-top:2px">'+(isCW?'Sungani MK 500':'Save MK 500')+'</div>';
  h += '</div>';
  h += '</div>';

  // Why pay
  h += '<div style="border:1.5px solid #A5D6A7;background:linear-gradient(135deg,#F1F8E9,#E8F5E9);border-radius:var(--cr);padding:11px 13px;margin-bottom:16px;font-size:.76rem;color:#1B5E20;line-height:1.6;display:flex;align-items:flex-start;gap:8px">';
  h += '<i data-lucide="heart" style="width:15px;height:15px;color:#2E7D32;flex-shrink:0;margin-top:2px"></i>';
  h += '<div><strong>'+(isCW?'Chifukwa chani kulipira?':'Why pay?')+'</strong> '+(isCW?'Bajeti Yanga yapangidwa ku Malawi, ya mabanja a ku Malawi. Ndalama zomwe mumalipira zimathandiza kuti app ipitirize kugwira ntchito. Palibe zotsatsa, ndipo sitigulitsa deta yanu, konse.':'Bajeti Yanga is built in Malawi, for Malawian families. Your subscription keeps the app running. No ads, no data selling, ever.')+'</div>';
  h += '</div>';

  // Proceed button
  h += '<button onclick="proceedToPayment()" style="width:100%;padding:14px;background:linear-gradient(135deg,#4A148C,#7B1FA2);color:#fff;border:none;border-radius:var(--cr);font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.92rem;cursor:pointer;box-shadow:0 6px 20px rgba(74,20,140,.4);display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px">';
  h += '<i data-lucide="arrow-right-circle" style="width:18px;height:18px"></i> '+(isCW?'Pitani ku Chilipiro':'Proceed to Payment');
  h += '</button>';
  h += '<button onclick="closeM(\'mv-u\')" style="width:100%;background:none;border:none;color:var(--mid);font-size:.8rem;font-family:inherit;cursor:pointer;padding:8px 16px">'+(isCW?'Mwina Mawa':'Maybe Later')+'</button>';

  g('mb-u').innerHTML = h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-u')]});
  openM('mv-u');
}

function selectPlan(months, price){
  _selectedPlan = {months, price, label: months === 1 ? '1 Month' : '3 Months'};
  // Visual feedback — highlight selected plan
  const m1 = document.getElementById('plan-1m');
  const m3 = document.getElementById('plan-3m');
  if(months === 1){
    if(m1){ m1.style.border = '2px solid #7B1FA2'; m1.style.background = '#F3E5F5'; }
    if(m3){ m3.style.opacity = '.7'; }
  } else {
    if(m3){ m3.style.opacity = '1'; m3.style.boxShadow = '0 6px 24px rgba(106,27,154,.5)'; }
    if(m1){ m1.style.border = '2px solid var(--border)'; m1.style.background = 'var(--white)'; }
  }
}

function proceedToPayment(){
  if(!_selectedPlan){
    // Default to 3 months if nothing selected
    selectPlan(3, 7000);
  }
  showPaychanguIframe();
}

function showPaychanguIframe(){
  const isCW = lang === 'cw';
  const plan = _selectedPlan || {months:3, price:7000, label:'3 Months'};
  let h = '<div class="dh"></div>';
  h += '<div style="display:flex;align-items:center;gap:10px;padding:4px 0 14px;border-bottom:1.5px solid var(--border);margin-bottom:12px">';
  h += '<div style="width:32px;height:32px;border-radius:var(--cr-sm);background:#F3E5F5;display:flex;align-items:center;justify-content:center"><i data-lucide="lock" style="width:16px;height:16px;color:#7B1FA2"></i></div>';
  h += '<div style="flex:1"><div style="font-weight:800;font-size:.88rem">'+(isCW?'Chilipiro Chotetezeka':'Secure Payment')+'</div>';
  h += '<div style="font-size:.65rem;color:var(--mid)">'+plan.label+' · MK '+plan.price.toLocaleString()+' · PayChangu</div></div>';
  h += '<button onclick="closeM(\'mv-u\');showPremiumPage()" style="background:none;border:none;color:var(--mid);font-size:.75rem;cursor:pointer;font-family:inherit;padding:4px 8px">'+(isCW?'Bwelera':'Back')+'</button>';
  h += '</div>';
  if(PAYMENTS_API){
    h += '<div style="font-size:.74rem;color:var(--mid);margin-bottom:12px;line-height:1.55">'+(isCW?'Tidzakutengerani ku PayChangu kuti mulipire MK <strong style="color:var(--ink)">'+plan.price.toLocaleString()+'</strong> ndi Airtel Money, TNM Mpamba kapena khadi.':'We will take you to PayChangu to pay <strong style="color:var(--ink)">MK '+plan.price.toLocaleString()+'</strong> with Airtel Money, TNM Mpamba or card.')+'</div>';
    h += '<button onclick="startCheckout(this)" style="width:100%;padding:14px;background:linear-gradient(135deg,#4A148C,#7B1FA2);color:#fff;border:none;border-radius:var(--cr);font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.92rem;cursor:pointer;box-shadow:0 6px 20px rgba(74,20,140,.4);display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px"><i data-lucide="lock" style="width:18px;height:18px"></i> '+(isCW?'Lipirani pa PayChangu':'Pay with PayChangu')+'</button>';
    h += '<button onclick="claimPayment(this)" style="width:100%;padding:14px;background:linear-gradient(135deg,#1B5E20,#2E7D32);color:#fff;border:none;border-radius:var(--cr);font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.92rem;cursor:pointer;box-shadow:0 6px 20px rgba(27,94,32,.35);display:flex;align-items:center;justify-content:center;gap:8px"><i data-lucide="gem" style="width:18px;height:18px"></i> '+(isCW?'Ndalipira. Tsegulani Premium':'I\'ve paid. Activate my Premium')+'</button>';
    h += '<div style="font-size:.65rem;color:var(--mid);text-align:center;margin-top:8px;line-height:1.5">'+(isCW?'Premium imatseguka yokha mkati mwa mphindi zochepa mukalipira. Mukavuta, tumizani screenshot pa WhatsApp.':'Premium switches on by itself within a few minutes of paying. If anything goes wrong, send your screenshot on WhatsApp instead.')+'</div>';
    h += '<button onclick="showClaimScreen()" style="width:100%;background:none;border:none;color:var(--mid);font-size:.72rem;font-family:inherit;cursor:pointer;padding:8px 16px;text-decoration:underline">'+(isCW?'Ndavutika. Ndituma pa WhatsApp':'Having trouble? Pay manually instead')+'</button>';
  } else {
    h += '<div style="font-size:.72rem;color:var(--mid);margin-bottom:8px;line-height:1.5">';
    h += (isCW?'Lowetsani MK <strong style="color:var(--ink)">'+plan.price.toLocaleString()+'</strong> pa kalata ya PayChangu:':'Enter <strong style="color:var(--ink)">MK '+plan.price.toLocaleString()+'</strong> as the amount on the PayChangu page:');
    h += '</div>';
    h += '<iframe src="'+PAYCHANGU_LINK+'" style="width:100%;height:420px;border:none;border-radius:var(--cr);background:#f5f5f5" allow="payment" loading="lazy"></iframe>';
    h += '<button onclick="showClaimScreen()" style="width:100%;margin-top:12px;padding:14px;background:linear-gradient(135deg,#1B5E20,#2E7D32);color:#fff;border:none;border-radius:var(--cr);font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.92rem;cursor:pointer;box-shadow:0 6px 20px rgba(27,94,32,.35);display:flex;align-items:center;justify-content:center;gap:8px">';
    h += '<i data-lucide="gem" style="width:18px;height:18px"></i> '+(isCW?'Tsegulani Premium Yanga':'Claim My Premium Access');
    h += '</button>';
    h += '<div style="font-size:.65rem;color:var(--mid);text-align:center;margin-top:6px">'+(isCW?'Dinani \'Tsegulani Premium Yanga\' mukamaliza kulipira pa PayChangu':'Tap Claim after completing payment on PayChangu')+'</div>';
  }

  g('mb-u').innerHTML = h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-u')]});
}

// ── Automatic Premium activation (PayChangu) ────────────────────────────────
// Paste the URL printed by `firebase deploy` for the `payments` function to switch this on (see docs/ROLLOUT-2026-10.md).
// While it is empty the app keeps the existing flow: pay on the PayChangu page, then send the screenshot on WhatsApp.
const PAYMENTS_API = '';
async function _paymentsCall(body){
  const res = await fetch(PAYMENTS_API, {method:'POST', headers: await _authHeaders(), body: JSON.stringify(body)});
  let data=null; try{ data=await res.json(); }catch(_){}
  if(!res.ok){ const e=new Error((data&&data.error)||('HTTP '+res.status)); e.status=res.status; throw e; }
  return data||{};
}
async function startCheckout(btn){
  const isCW = lang==='cw';
  const plan = _selectedPlan || {months:3, price:7000, label:'3 Months'};
  if(!hhId || !curUser){ toast((lang==='cw'?'Simunalowe mu akaunti.':'Not signed in.'),'e'); return; }
  if(btn) btn.disabled = true;
  try{
    const r = await _paymentsCall({action:'checkout', householdId:hhId, months:plan.months});
    let host=''; try{ host=new URL(r.checkout_url).hostname; }catch(_){}
    if(!r.tx_ref || !/(^|\.)paychangu\.com$/.test(host)) throw new Error('bad checkout response');
    try{ localStorage.setItem('nb_pay_tx', JSON.stringify({tx:r.tx_ref, hh:hhId, at:Date.now()})); }catch(e){}
    window.open(r.checkout_url, '_blank');
    toast(isCW?'Malizani kulipira, kenako dinani "Ndalipira".':'Finish paying, then come back and tap "I\'ve paid".','i');
  }catch(e){
    toast(aiFailMessage(e,isCW) || (isCW?'Sitinathe kuyamba chilipiro. Yesaninso.':'Could not start the payment. Please try again.'),'e');
  }finally{ if(btn) btn.disabled = false; }
}
// Asks the server to check the payment with PayChangu and, if it really went through, activate Premium.
// The browser never decides this itself: the server verifies with PayChangu and writes the Premium fields.
async function claimPayment(btn, silent){
  const isCW = lang==='cw';
  let pend=null; try{ pend=JSON.parse(localStorage.getItem('nb_pay_tx')||'null'); }catch(e){}
  if(!pend || !pend.tx){ if(!silent) toast(isCW?'Palibe chilipiro chopezeka pa chipangizochi.':'No payment found on this device. Start a payment first.','e'); return false; }
  if(btn) btn.disabled = true;
  try{
    const r = await _paymentsCall({action:'check', txRef:pend.tx});
    if(r.status==='paid'){
      try{ localStorage.removeItem('nb_pay_tx'); }catch(e){}
      closeM('mv-u');
      toast(isCW?'Premium yatsegulidwa! Zikomo.':'Premium activated! Thank you.','s');
      return true;
    }
    if(r.status==='failed'){
      try{ localStorage.removeItem('nb_pay_tx'); }catch(e){}
      if(!silent) toast(isCW?'Chilipiro sichinatheke.':'That payment did not go through.','e');
      return false;
    }
    if(!silent) toast(isCW?'Chilipiro sichinatsimikizidwe. Dikirani miniti ndikuyesanso. Premium imatseguka yokha mukalipira.':'Payment not confirmed yet. Wait a minute and tap again. Premium also switches on by itself once PayChangu confirms.','i');
    return false;
  }catch(e){
    if(!silent) toast(aiFailMessage(e,isCW) || (isCW?'Sitinathe kuyang\'ana chilipiro. Yesaninso.':'Could not check the payment. Please try again.'),'e');
    return false;
  }finally{ if(btn) btn.disabled = false; }
}
function _resumePaymentCheck(){
  if(!PAYMENTS_API) return;
  try{ if(/[?&]paid=1/.test(location.search)) history.replaceState(null,'',location.pathname); }catch(e){}
  let pend=null; try{ pend=JSON.parse(localStorage.getItem('nb_pay_tx')||'null'); }catch(e){}
  if(!pend) return;
  if(!pend.at || Date.now()-pend.at > 48*3600*1000){ try{ localStorage.removeItem('nb_pay_tx'); }catch(e){} return; }
  claimPayment(null, true);
}

function showClaimScreen(){
  const isCW = lang === 'cw';
  const plan = _selectedPlan || {months:3, price:7000, label:'3 Months'};

  // Confetti animation CSS
  const confettiStyle = '<style>@keyframes confettiFall{0%{transform:translateY(-20px) rotate(0deg);opacity:1}100%{transform:translateY(80px) rotate(360deg);opacity:0}}.confetti-piece{position:absolute;width:8px;height:8px;border-radius:2px;animation:confettiFall .8s ease-out forwards}</style>';

  const confettiColors = ['#7B1FA2','#FFD700','#00E5FF','#4CAF50','#FF5722','#E91E63'];
  let confettiHtml = '<div style="position:relative;height:60px;overflow:hidden;margin-bottom:4px">';
  for(let i=0;i<18;i++){
    const color = confettiColors[i % confettiColors.length];
    const left = (i * 5.5) + '%';
    const delay = (i * 0.06) + 's';
    const size = (Math.random() > 0.5 ? 6 : 9) + 'px';
    confettiHtml += `<div class="confetti-piece" style="left:${left};background:${color};animation-delay:${delay};width:${size};height:${size}"></div>`;
  }
  confettiHtml += '</div>';

  let h = confettiStyle + '<div class="dh"></div>';
  h += confettiHtml;

  // Gem icon instead of emoji
  h += '<div style="text-align:center;margin-bottom:14px">';
  h += '<div style="width:64px;height:64px;border-radius:var(--cr);background:linear-gradient(135deg,#4A148C,#7B1FA2);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;box-shadow:0 8px 24px rgba(74,20,140,.4)">';
  h += '<i data-lucide="gem" style="width:30px;height:30px;color:#fff"></i></div>';
  h += '<div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1.1rem;color:var(--ink);margin-bottom:4px">'+(isCW?'Pafupi Kwambiri!':'You\'re Almost There!')+'</div>';
  h += '<div style="font-size:.76rem;color:var(--mid);line-height:1.5">'+(isCW?'Tumizani kodi ya nyumba yanu kwa ife pa WhatsApp kuti titsegule Premium yanu.':'Share your household code with us on WhatsApp so we can activate your Premium.')+'</div>';
  h += '</div>';

  // Plan summary
  h += '<div style="background:var(--mist);border-radius:var(--cr-md);padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;justify-content:space-between">';
  h += '<div style="font-size:.75rem;color:var(--mid)">'+(isCW?'Purani Yosankhidwa:':'Selected Plan:')+'</div>';
  h += '<div style="font-weight:800;font-size:.82rem;color:var(--p1)">'+plan.label+' · MK '+plan.price.toLocaleString()+'</div>';
  h += '</div>';

  // Household code card
  h += '<div style="background:linear-gradient(135deg,#F3E5F5,#EDE7F6);border:2px solid #CE93D8;border-radius:var(--cr);padding:14px;margin-bottom:14px">';
  h += '<div style="font-size:.65rem;font-weight:700;color:var(--p1);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">'+(isCW?'Nambala ya Nyumba Yanu:':'Your Household Code:')+'</div>';
  h += '<div style="display:flex;align-items:center;gap:10px">';
  h += '<div style="font-family:Hanken Grotesk,sans-serif;font-weight:900;font-size:1.4rem;color:var(--ink);letter-spacing:2px;flex:1">'+esc(hhId)+'</div>';
  h += '<button onclick="navigator.clipboard&&navigator.clipboard.writeText(\''+esc(hhId)+'\').then(()=>toast(\''+(isCW?'Yakopedwa!':'Copied!')+'\')).catch(()=>{})" style="background:#7B1FA2;color:#fff;border:none;border-radius:var(--cr-sm);padding:6px 12px;font-size:.7rem;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;display:flex;align-items:center;gap:4px"><i data-lucide="copy" style="width:13px;height:13px"></i> '+(isCW?'Koperani':'Copy')+'</button>';
  h += '</div></div>';

  // WhatsApp instruction
  h += '<div style="background:#E8F5E9;border:1.5px solid #A5D6A7;border-radius:var(--cr);padding:12px 14px;margin-bottom:14px">';
  h += '<div style="display:flex;align-items:flex-start;gap:10px">';
  h += '<div style="width:32px;height:32px;border-radius:var(--cr-sm);background:#25D36620;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i data-lucide="message-circle" style="width:16px;height:16px;color:#25D366"></i></div>';
  h += '<div>';
  h += '<div style="font-weight:800;font-size:.8rem;color:#1B5E20;margin-bottom:3px">'+(isCW?'Tumizani Screenshot pa WhatsApp':'Send Payment Screenshot on WhatsApp')+'</div>';
  h += '<div style="font-size:.7rem;color:#388E3C;line-height:1.5">'+(isCW?'Tumizani screenshot ya chilipiro chanu ndi nambala ya nyumba kwa +265 888 029 029. Tidzatsegula Premium yanu mkati mwa maola 24.':'Send your payment screenshot and household code to +265 888 029 029. We will activate your Premium within 24 hours.')+'</div>';
  h += '</div></div></div>';

  // WhatsApp CTA button
  const waMsg = encodeURIComponent(
    'Hi Rodart Creatives! I just paid for Bajeti Yanga Premium.\n\n'
    +'Plan: '+plan.label+' (MK '+plan.price.toLocaleString()+')\n'
    +'Household Code: '+hhId+'\n\n'
    +'[Please find my payment screenshot attached]'
  );
  h += '<button onclick="window.open(\'https://wa.me/265888029029?text='+waMsg+'\',\'_blank\')" style="width:100%;padding:14px;background:#25D366;color:#fff;border:none;border-radius:var(--cr);font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.9rem;cursor:pointer;box-shadow:0 6px 20px rgba(37,211,102,.35);display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px">';
  h += '<i data-lucide="message-circle" style="width:18px;height:18px"></i> '+(isCW?'Tsegulani Premium Yanga':'Claim My Premium Access');
  h += '</button>';
  h += '<div style="font-size:.65rem;color:var(--mid);text-align:center;margin-bottom:4px">'+(isCW?'Tidzatsegula mkati mwa maola 24 mukatitumizira uthenga.':'We activate within 24 hours of receiving your message.')+'</div>';
  h += '<button onclick="closeM(\'mv-u\')" style="width:100%;background:none;border:none;color:var(--mid);font-size:.8rem;font-family:inherit;cursor:pointer;padding:8px 16px">'+(isCW?'Zatheka':'Done')+'</button>';

  g('mb-u').innerHTML = h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-u')]});
}

function confirmPaymentWA(){
  showClaimScreen();
}

// ---- Header status chip (replaces the old full-width banner) ------------------------------------------
// Returns null when there is nothing to say (free plan, or Premium with plenty of time left).
function getPremiumChipState(){
  const s = getPremiumStatus();
  const cw = lang === 'cw';
  const n = s.daysLeft;
  const days = function(){ return n + ' day' + (n === 1 ? '' : 's') + ' left'; };
  if(s.isExpired) return {tone:'ended', icon:'lock', label: cw ? 'Premium yatha' : 'Premium ended', aria: cw ? 'Premium yatha. Dinani kuti mukonze.' : 'Premium ended. Tap for options.'};
  if(s.isTrial && n <= 0) return {tone:'ended', icon:'lock', label: cw ? 'Nthawi yoyesera yatha' : 'Trial ended', aria: cw ? 'Nthawi yoyesera yatha. Dinani kuti mukonze.' : 'Trial ended. Tap for options.'};
  if(s.isTrial && n <= 10) return {tone:'soon', icon:'clock', label: cw ? 'Masiku ' + n + ' otsala' : 'Trial: ' + days(), aria: 'Trial: ' + days() + '. Tap for options.'};
  if(s.isPremium && !s.isTrial && n !== null && n <= 7) return {tone:'soon', icon:'clock', label: cw ? 'Masiku ' + n + ' otsala' : 'Premium: ' + days(), aria: 'Premium: ' + days() + '. Tap for options.'};
  return null;
}

function updatePremiumChip(){
  const chip = g('prem-chip'), bar = g('topbar');
  if(!chip || !bar) return;
  let st = null;
  try{ st = getPremiumChipState(); }catch(e){ st = null; }   // lCfg may not be loaded yet
  if(!st){
    if(chip.dataset.k){ chip.dataset.k = ''; chip.innerHTML = ''; chip.className = 'prem-chip'; }
    bar.classList.remove('has-chip');
    return;
  }
  const key = st.tone + '|' + st.label;
  bar.classList.add('has-chip');
  if(chip.dataset.k === key) return;        // unchanged: skip rebuilding the icon on every render
  chip.dataset.k = key;
  chip.className = 'prem-chip prem-' + st.tone;
  chip.setAttribute('aria-label', st.aria);
  chip.innerHTML = '<i data-lucide="' + st.icon + '"></i><span>' + st.label + '</span>';
  if(window.lucide) lucide.createIcons({nodes:[chip]});
}

// Small lock icon for rows and buttons that need Premium. Empty when the household already has access.
function lockBadge(size){
  if(hasPremiumFeature()) return '';
  size = size || 11;
  return ' <i data-lucide="lock" class="lock-badge" style="width:' + size + 'px;height:' + size + 'px"></i>';
}

// Bottom sheet opened by tapping the header chip.
function showPremiumSheet(){
  const s = getPremiumStatus();
  const cw = lang === 'cw';
  const n = s.daysLeft;
  const ended = s.isExpired || (s.isTrial && n <= 0);
  let title, note;
  if(s.isExpired){
    title = cw ? 'Premium yatha' : 'Your Premium has ended';
    note = 'You are on the free plan. These features stay locked until you renew.';
  } else if(ended){
    title = cw ? 'Nthawi yanu yoyesera yaulere yatha' : 'Your free trial has ended';
    note = 'You are on the free plan. Upgrade to unlock these features again.';
  } else if(s.isTrial){
    title = n + ' day' + (n === 1 ? '' : 's') + ' left in your trial';
    note = 'Upgrade before it ends so nothing gets locked.';
  } else {
    title = 'Premium ends in ' + n + ' day' + (n === 1 ? '' : 's');
    note = 'Renew now so nothing gets locked.';
  }
  let h = '<div class="dh"></div>';
  h += '<div style="text-align:center;padding:8px 0 16px">';
  h += '<div style="width:56px;height:56px;border-radius:var(--cr);background:linear-gradient(135deg,#4A148C,#7B1FA2);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;box-shadow:0 6px 20px rgba(74,20,140,.35)"><i data-lucide="' + (ended ? 'lock' : 'clock') + '" style="width:26px;height:26px;color:#fff"></i></div>';
  h += '<h3 style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1.05rem;margin-bottom:6px">' + title + '</h3>';
  h += '<div style="font-size:.78rem;color:var(--mid);margin-bottom:14px;line-height:1.5">' + note + '</div>';
  h += '<div style="font-size:.75rem;color:var(--mid);margin-bottom:16px;text-align:left;background:var(--mist);border-radius:var(--cr-md);padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:6px">';
  const mark = ended ? 'lock' : 'check';
  [['Charts'],['PDF Export'],['Bill Tracker'],['Unlimited AI'],['Trash & Undo'],['Copy Month']].forEach(function(f){
    h += '<div style="display:flex;align-items:center;gap:5px"><i data-lucide="' + mark + '" style="width:12px;height:12px;color:var(--p1);flex-shrink:0"></i><span>' + f[0] + '</span></div>';
  });
  h += '</div>';
  h += '<button class="btnM" style="width:100%;margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:6px" onclick="closeM(\'mv-u\');showPremiumPage()"><i data-lucide="gem" style="width:16px;height:16px"></i> ' + (s.isExpired || (!s.isTrial && s.isPremium) ? (cw ? 'Konzaninso Premium' : 'Renew Premium') : (cw ? 'Pitani ku Premium' : 'Upgrade to Premium')) + '</button>';
  h += '<button onclick="closeM(\'mv-u\')" style="background:none;border:none;color:var(--mid);font-size:.8rem;font-family:inherit;cursor:pointer;padding:8px 16px;display:block;margin:0 auto">' + (cw ? 'Mwina Mawa' : 'Not now') + '</button>';
  h += '</div>';
  g('mb-u').innerHTML = h;
  if(window.lucide) lucide.createIcons({nodes:[g('mb-u')]});
  openM('mv-u');
}

// Builds the document for a brand-new household. The free trial starts from a SERVER timestamp at the ROOT of the
// document: the security rules reject a trial date inside config and reject any client-supplied date, so it cannot
// be back-dated. The trial is offered once per account: if users/{uid}.trialClaimedAt is set (stamped by the
// onHouseholdCreated Cloud Function), no trial is started for this household.
function _newHouseholdDoc(uData, cfg, extra){
  const FV = firebase.firestore.FieldValue;
  ensureRecIds(cfg);   // new households start with ids on every item
  const doc = Object.assign({config:cfg, createdAt:FV.serverTimestamp(), owner:curUser.uid, memberUids:[curUser.uid]}, extra||{});
  if(!(uData && uData.trialClaimedAt)) doc.trialStarted = FV.serverTimestamp();
  return doc;
}


function copyPreviousMonth(){
  premiumGate('copy_month', function(){
    // previous BUDGET period (respects salary day), and never copy entries sitting in the trash
    const _cm=curM(), _pm={m:_cm.m===0?11:_cm.m-1, y:_cm.m===0?_cm.y-1:_cm.y};
    let prevPx=lPx.filter(p=>p.date&&!p.deleted&&p.type!=='income'&&isTM(p.date,_pm));
    if(!prevPx.length){toast(lang==='cw'?'Palibe zogula za mwezi wapita':'No expenses found from last month','e');return;}
    if(prevPx.length>200){
      toast(lang==='cw'?'Kukopera 200 mwa '+prevPx.length+' (malire a chitetezo).':'Copying 200 of '+prevPx.length+' entries (limit for safety).','i');
      prevPx=prevPx.slice(0,200);
    }
    
    const todayStr=today();
    const batch=db.batch();
    prevPx.forEach(function(p){
      const ref=db.collection('households').doc(hhId).collection('purchases').doc();
      batch.set(ref,{item:p.item,amount:p.amount,date:todayStr,timestamp:Date.now(),
        qty:p.qty||'',unit:p.unit||'',notes:p.notes||'',userId:p.userId,
        cat:p.cat||catOf(p.item),type:'expense',recurring:p.recurring||false});
    });
    batch.commit().then(function(){ toast(lang==='cw'?prevPx.length+' zolemba zakopedwa!':prevPx.length+' entries copied!','s'); }).catch(function(e){ toast((lang==='cw'?'Cholakwika: ':'Error: ')+e.message+'.','e'); });
  });
}


// Name change notification (shows once to existing users)
function checkNameChange(){
  if(localStorage.getItem('nb_name_notif_v5')) return;
  // Only show if they are an existing user (have a household already)
  if(!localStorage.getItem('nb_household')) return;
  localStorage.setItem('nb_name_notif_v5','1');
  const div=document.createElement('div');
  div.className='name-notif';
  var notifHTML='<h4>&#127881; We have a new name!</h4>';
  notifHTML+='<p>Bajeti Yanga is the new name for Nyumba Budget -- same app, fresh identity!</p>';
  notifHTML+='<div class="name-notif-btns"><button style="background:#fff;color:#7B1FA2" onclick="dismissNameNotif()">Got it! ✓</button></div>';
  div.innerHTML=notifHTML;
  document.body.appendChild(div);
  setTimeout(()=>{ if(div.parentNode)div.remove(); },8000);
}

// ── PUSH NOTIFICATIONS — FCM shell (activate in Firebase Console) ──────────
// To enable real push: add firebase-messaging-compat.js, set VAPID key below,
// and deploy the Cloud Function in /functions/index.js
const FCM_VAPID = ''; // paste your VAPID key here when ready

async function requestPushPermission(){
  if(!('Notification' in window)||!('serviceWorker' in navigator))return;
  if(Notification.permission==='granted'){ setupFCMToken(); return; }
  if(Notification.permission==='denied')return;
  const perm=await Notification.requestPermission();
  if(perm==='granted') setupFCMToken();
}

async function setupFCMToken(){
  // FCM token registration — no-op until firebase-messaging is loaded
  // and VAPID key is set. Kept as a shell so enabling is just adding the
  // SDK script and VAPID key above.
  try{
    if(!window.firebase||!firebase.messaging)return;
    const messaging=firebase.messaging();
    if(FCM_VAPID){
      const token=await messaging.getToken({vapidKey:FCM_VAPID});
      if(token&&hhId){
        db.collection('households').doc(hhId).update({
          [`pushTokens.${curUser?curUser.uid:'anon'}`]:token
        }).catch(()=>{});
      }
    }
  }catch(e){}
}

// In-app budget alert: show a browser Notification if tab is not visible
// Returns true only if a system notification was actually requested, so callers can avoid marking a reminder as "sent" when it wasn't.
function maybeNotify(title,body){
  if(document.visibilityState==='visible') return false; // in-app toast handles it
  if(!('Notification' in window) || Notification.permission!=='granted') return false;
  const opts={body:body,icon:'./icons/icon-192.png',badge:'./icons/icon-96.png'};
  try{
    // Android Chrome throws "Illegal constructor" for new Notification(); the service worker route works everywhere.
    if('serviceWorker' in navigator && navigator.serviceWorker.ready){
      navigator.serviceWorker.ready.then(function(reg){ return reg.showNotification(title,opts); })
        .catch(function(){ try{ new Notification(title,opts); }catch(e){} });
    } else { new Notification(title,opts); }
  }catch(e){ return false; }
  return true;
}

// Call on boot after household connects
function scheduleInAppAlerts(){
  const sp=totSp(), bg=lCfg.overallBudget, pct=sp/bg;
  if(pct>=1) maybeNotify('Bajeti Yanga: Over Budget!',`You've spent MK ${Math.round(sp).toLocaleString()} of your MK ${bg.toLocaleString()} budget.`);
  else if(pct>=0.8) maybeNotify('Bajeti Yanga: Budget Warning',`${Math.round(pct*100)}% of your monthly budget used.`);
  lCfg.items.forEach(it=>{
    const s=iSpent(it.name);
    if(s>it.budget) maybeNotify(`${it.name} over budget`,`Spent MK ${Math.round(s).toLocaleString()} of MK ${it.budget.toLocaleString()}`);
  });
}

// Notify once per bill per day when a tracked bill is due soon, due today, or overdue.
// Dedup key is per-household + per-day so this is safe to call repeatedly (e.g. on
// every household doc refresh) without spamming the same reminder over and over.
function checkBillReminders(){
  if(!lCfg || !lCfg.bills || !lCfg.bills.length) return;
  const KEY = 'nb_bill_notif_'+(hhId||'anon')+'_'+today();
  let notifiedToday = [];
  try { notifiedToday = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch(e){ notifiedToday = []; }
  const today2 = new Date(); today2.setHours(0,0,0,0);
  let changed = false;
  lCfg.bills.forEach(function(b){
    if(!b.dueDate || notifiedToday.includes(b.name)) return;
    const due = new Date(String(b.dueDate).split('T')[0]+'T00:00:00'); // local midnight (date-only strings parse as UTC otherwise)
    const diff = Math.round((due - today2)/86400000);
    if(diff > 3) return; // not due soon enough yet
    let _title, _body;
    if(diff < 0){ _title='Bajeti Yanga: Bill Overdue'; _body=b.name+' (MK '+Math.round(b.amount).toLocaleString()+') was due '+b.dueDate+'.'; }
    else if(diff === 0){ _title='Bajeti Yanga: Bill Due Today'; _body=b.name+' (MK '+Math.round(b.amount).toLocaleString()+') is due today.'; }
    else { _title='Bajeti Yanga: Bill Reminder'; _body=b.name+' (MK '+Math.round(b.amount).toLocaleString()+') is due in '+diff+' day'+(diff>1?'s':'')+'.'; }
    let _shown = maybeNotify(_title,_body);
    // App is open (the usual case at boot): a system notification is suppressed, so show it in-app instead of silently dropping the day's reminder.
    if(!_shown && document.visibilityState==='visible'){ toast(_body,'i'); _shown = true; }
    if(!_shown) return; // not delivered: try again on the next check instead of marking it done
    notifiedToday.push(b.name);
    changed = true;
  });
  if(changed){ try{ localStorage.setItem(KEY, JSON.stringify(notifiedToday)); }catch(e){} }
}

// -- Android Back Button Fix --
// Onboarding screens (auth/setup/pin/welcome/verify) and the waiting-for-approval
// screen sit outside the tab system, so they never had a history entry — device
// back on them fell straight out of the app. _pushOnboardScreen() gives each one a
// real entry; the popstate handler below reacts to it before falling through to
// the normal tab logic.
function _pushOnboardScreen(name, from){
  try{ history.pushState({screen:name, from:from||null},'',(location.pathname||'/')); }catch(e){}
}
(function(){
  function pushState(t){ try{ history.pushState({tab:t},'',(location.pathname||'/')); }catch(e){} }
  var _go = window.go;
  window.go = function(t){ _go(t); pushState(t); };
  window.addEventListener('popstate', function(e){
    // A modal being open always wins: close the topmost one and stay right
    // where we are, instead of letting the screen/tab underneath change
    // while the modal keeps floating on top of it (it never had its own
    // history entry, so without this the modal would just get left behind).
    if(_openModalStack.length){
      closeM(_openModalStack[_openModalStack.length-1]);
      try{ history.pushState(e.state||{tab:tab},'',(location.pathname||'/')); }catch(err){}
      return;
    }
    var st = e.state;
    if(st && st.screen){
      if(st.screen==='waiting-approval'){
        // Back on the waiting screen = cancel the request, same as the Cancel button.
        cancelPendingJoin();
        return;
      }
      if(st.screen==='pin' && st.from==='welcome'){
        // Reached PIN entry from "Welcome back" (a returning, already-signed-in
        // user) -- back should return there, not force them through the
        // sign-in form again as if they were never logged in.
        hide('scr-pin'); g('app').classList.add('hide');
        show('scr-welcome');
        return;
      }
      // PIN (any other origin) / welcome / verify / setup are all pre-app
      // gates — the safe universal "back" from any of them is the sign-in
      // screen, same as if nothing was ever entered, rather than trying to
      // reconstruct exact prior sub-state.
      hide('scr-setup'); hide('scr-pin'); hide('scr-welcome'); hide('scr-verify');
      g('app').classList.add('hide');
      show('scr-auth'); aTab('login');
      return;
    }
    var t = (st&&st.tab) || 'home';
    // Just call internal render without pushing another state
    tab=t;
    document.querySelectorAll('.nb').forEach(function(b){b.classList.remove('on');});
    var nb=g('nb-'+t); if(nb)nb.classList.add('on');
    render();
    var v=g('view'); if(v)v.scrollTop=0;
    // Push state again so next back still works
    pushState(t);
  });
  // Initial state
  setTimeout(function(){ pushState('home'); }, 800);
})();

// -- Live connectivity feedback --
// Previously there was no in-app signal at all when the connection dropped or came
// back mid-session -- the first sign of trouble was a "sync failed" toast on whatever
// action the user happened to try next. This gives an immediate, explicit heads-up
// either way, and if offline persistence never enabled on this device (see the
// enablePersistence().catch() above), says so plainly instead of failing quietly.
window.addEventListener('offline', function(){
  const isCW = lang==='cw';
  const persistFailed = window._offlinePersistenceOk===false;
  const msg = isCW
    ? (persistFailed ? 'Simulumikizidwa, ndipo chipangizo ichi sichikhoza kusunga zambiri popanda intaneti -- zosintha zina zitha kusasungidwa mpaka mutalumikizidwanso.' : 'Simulumikizidwa ndi intaneti. Zosintha zidzasungidwa mukalumikizidwanso.')
    : (persistFailed ? 'You\'re offline, and this device can\'t cache data for offline use -- some changes may not save until you\'re back online.' : 'You\'re offline. Changes will sync once you\'re back online.');
  toast(msg,'i');
});
window.addEventListener('online', function(){
  toast(lang==='cw' ? 'Mwalumikizidwanso -- deta ikusungidwa...' : 'Back online -- syncing...','s');
});


