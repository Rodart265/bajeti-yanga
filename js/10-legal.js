// ===============================================
// TERMS OF SERVICE & PRIVACY POLICY PAGES
// ===============================================
function polChips(items){
  let c='<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:18px">';
  items.forEach(function(it){
    c+='<div style="display:inline-flex;align-items:center;gap:5px;background:'+it[1]+'14;border:1px solid '+it[1]+'35;border-radius:var(--cr);padding:5px 12px 5px 9px">'
      +'<i data-lucide="'+it[0]+'" style="width:12px;height:12px;color:'+it[1]+'"></i>'
      +'<span style="font-size:.65rem;font-weight:700;color:'+it[1]+'">'+it[2]+'</span></div>';
  });
  return c+'</div>';
}
function polSection(num,icon,color,title,body,isLast){
  return '<div style="display:flex;gap:12px;padding:14px 0'+(isLast?'':';border-bottom:1px solid #F0EBF8')+'">'
    +'<div style="width:34px;height:34px;border-radius:var(--cr-md);background:'+color+'18;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i data-lucide="'+icon+'" style="width:17px;height:17px;color:'+color+'"></i></div>'
    +'<div style="flex:1;min-width:0"><div style="font-family:Hanken Grotesk,sans-serif;font-size:.86rem;font-weight:800;color:#3D0E7A;margin-bottom:5px">'+num+'. '+title+'</div>'
    +'<div style="font-size:.78rem;color:#555;line-height:1.65">'+body+'</div></div></div>';
}
function polShell(id, iconBadge, heading, subtitle, chipsHtml, sectionsHtml){
  const el = document.getElementById(id);
  if(el){ el.style.display='block'; return; }
  const div = document.createElement('div');
  div.id = id;
  div.style.cssText = 'position:fixed;inset:0;background:#F0EBF8;z-index:9999;overflow-y:auto;padding:0';
  div.innerHTML = '<div style="max-width:640px;margin:0 auto;padding:0 0 40px">'
    +'<div style="background:linear-gradient(135deg,#4A148C,#7B1FA2);padding:24px 20px 22px;margin-bottom:0">'
    +'<button onclick="document.getElementById(\''+id+'\').style.display=\'none\'" style="background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.25);color:#fff;border-radius:var(--cr);padding:7px 14px;font-family:Hanken Grotesk,sans-serif;font-weight:700;font-size:.78rem;cursor:pointer;margin-bottom:16px;display:inline-flex;align-items:center;gap:5px"><i data-lucide="chevron-left" style="width:14px;height:14px"></i> Back</button>'
    +'<div style="display:flex;align-items:center;gap:11px">'
    +'<div style="width:42px;height:42px;border-radius:var(--cr-md);background:rgba(255,255,255,.15);border:1.5px solid rgba(255,255,255,.25);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i data-lucide="'+iconBadge+'" style="width:21px;height:21px;color:#fff"></i></div>'
    +'<div><h1 style="font-family:Hanken Grotesk,sans-serif;font-size:1.25rem;font-weight:800;color:#fff;margin-bottom:2px">'+heading+'</h1>'
    +'<p style="font-size:.7rem;color:rgba(255,255,255,.65)">'+subtitle+'</p></div>'
    +'</div></div>'
    +'<div style="padding:20px">'
    +chipsHtml
    +'<div style="background:#fff;border-radius:var(--cr);padding:6px 18px;box-shadow:0 2px 12px rgba(123,31,162,.08)">'
    +sectionsHtml
    +'</div></div></div>';
  document.body.appendChild(div);
  if(window.lucide) lucide.createIcons({nodes:[div]});
}
function openTerms(){
  const isCW = lang==='cw';
  const chips = polChips([
    ['smartphone','#1565C0',isCW?'Kagwiritsidwe kanu':'Personal use only'],
    ['credit-card','#E65100','PayChangu'],
    ['shield-check','#00695C',isCW?'Deta yanu ndi yanu':'Your data stays yours']
  ]);
  let s = polSection(1,'check-circle','#7B1FA2','Acceptance of Terms','By using Bajeti Yanga, you agree to these terms. If you do not agree, do not use the app.');
  s += polSection(2,'smartphone','#1565C0','Use of the App','Bajeti Yanga is a personal household budgeting tool. You may use it for lawful personal or household financial tracking only. You must not misuse, reverse-engineer, or resell the app.');
  s += polSection(3,'file-text','#00695C','Your Data','All financial data you enter belongs to you. We store it securely on Google Firebase. You are responsible for the accuracy of data you enter.');
  s += polSection(4,'credit-card','#E65100','Premium Features &amp; Payments','Premium features are available via a paid subscription. Payments are processed securely through <strong>PayChangu</strong>. Refunds are at the discretion of Rodart Creatives.');
  s += polSection(5,'alert-triangle','#B71C1C','Disclaimer','Bajeti Yanga is provided as-is. We are not responsible for any financial decisions made based on data in this app. Always verify important financial information independently.');
  s += polSection(6,'mail','#4527A0','Contact','Questions? Email <strong>rodartcreatives@gmail.com</strong> or WhatsApp <strong>+265 888 029 029</strong>.',true);
  polShell('scr-terms','file-text','Terms of Service','Last updated: July 2026 · Rodart Creatives',chips,s);
}

function openPrivacySheet(){
  const isCW = lang==='cw';
  const chips = polChips([
    ['lock','#7B1FA2',isCW?'Zosungidwa motetezeka':'Encrypted storage'],
    ['ban','#E65100',isCW?'Sitigulitsa deta':'No data selling'],
    ['trash-2','#2E7D32',isCW?'Chotsani nthawi iliyonse':'Delete anytime']
  ]);
  let s = polSection(1,'database','#1565C0','Data We Collect','We collect your phone number or email for authentication, your household financial entries (income, expenses, budgets), and device information for app functionality.');
  s += polSection(2,'settings','#00695C','How We Use Your Data','Your data is used exclusively to provide the budgeting features. AI features process spending summaries temporarily; this data is not retained beyond the request.');
  s += polSection(3,'lock','#7B1FA2','Data Storage &amp; Security','All data is stored in Google Firebase Firestore with enforced security rules. Only authenticated members of your household can access your data. Data is encrypted in transit and at rest.');
  s += polSection(4,'users','#E65100','Data Sharing','We do not sell, rent, or share your personal data with advertisers or third parties. Data is shared only with household members who have your household code.');
  s += polSection(5,'check-circle','#2E7D32','Your Rights','You may delete your account and all associated data at any time via Settings. You can also export your data as CSV.');
  s += polSection(6,'mail','#4527A0','Contact','Questions? Email <strong>rodartcreatives@gmail.com</strong> or WhatsApp <strong>+265 888 029 029</strong>.',true);
  polShell('scr-privacy-page','shield-check','Privacy Policy','Last updated: July 2026 · Rodart Creatives',chips,s);
}

// ── FAQ ──────────────────────────────────────────────────────────────────
// Accordion item: collapsed by default, tapping the question reveals the
// answer and flips the chevron. Follows the same visual language as
// polSection (Terms/Privacy) but click-to-expand instead of a flat list,
// since FAQ entries are meant to be scanned, not all read at once.
function faqItem(id, q, a, isLast){
  return '<div style="padding:14px 0'+(isLast?'':';border-bottom:1px solid #F0EBF8')+'">'
    +'<button onclick="faqToggle(\''+id+'\')" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;background:none;border:none;padding:0;text-align:left;cursor:pointer;font-family:Hanken Grotesk,sans-serif">'
    +'<span style="font-size:.84rem;font-weight:700;color:#3D0E7A;flex:1">'+q+'</span>'
    +'<i data-lucide="chevron-down" id="'+id+'-chev" style="width:16px;height:16px;color:#7B1FA2;flex-shrink:0;transition:transform .2s"></i>'
    +'</button>'
    +'<div id="'+id+'" style="display:none;font-size:.78rem;color:#555;line-height:1.65;margin-top:9px;padding-right:26px">'+a+'</div>'
    +'</div>';
}
function faqToggle(id){
  const el = g(id); if(!el) return;
  const chev = g(id+'-chev');
  const wasOpen = el.style.display !== 'none';
  el.style.display = wasOpen ? 'none' : 'block';
  if(chev) chev.style.transform = wasOpen ? 'rotate(0deg)' : 'rotate(180deg)';
}
function openFAQ(){
  const chips = polChips([
    ['sparkles','#7B1FA2','AI features'],
    ['gem','#E65100','Premium'],
    ['shield-check','#00695C','Security']
  ]);
  let s = faqItem('faq-1','How does the Salary Day budget period work?','Set your Salary Day in Settings under Household. Once set, your budget month runs from that day to the day before it in the following month, instead of the 1st-to-end calendar month, so it lines up with when you actually get paid. Totals, budgets, and reports all follow this window.');
  s += faqItem('faq-2','How many households can I create for free?','Free accounts can own up to 3 households. Upgrading any one of your households to Premium unlocks unlimited households across your account.');
  s += faqItem('faq-3','Does Premium cover my whole account, or just one household?','Premium is tied to the specific household you buy it for, not your account as a whole. If you belong to more than one household, each one needs its own Premium subscription to unlock Bill Tracker, PDF export, and unlimited AI use inside that household. (Owning one Premium household does still unlock unlimited household creation, per the question above.)');
  s += faqItem('faq-4','What do I get with Premium?','Bill Tracker, PDF report export, unlimited households, unlimited AI Magic Log / Receipt Scan / AI Summary (free accounts get 5 uses of each per day), and no cap on how many households you can own.');
  s += faqItem('faq-5','What is Magic Log?','An AI-powered way to log entries fast. Scan a receipt, paste an Airtel Money or Mpamba SMS, or just type what you bought in plain language, and it pulls out the items, amounts, and categories for you. Free accounts get 5 uses a day.');
  s += faqItem('faq-6','How do I join an existing household?','Ask the household owner for their household code or join link, then choose "Join a household" during setup, or use Switch/Leave Household in Settings. The owner has to approve your request before you get access.');
  s += faqItem('faq-7','Will I know when someone joins my household?','Yes. As the owner, you get notified as soon as someone requests to join. Once you approve them, everyone already in the household is notified too.');
  s += faqItem('faq-8','How long is the free trial?','New households get a 14-day free trial of Premium features. After it ends, the household drops to the free tier unless you subscribe.');
  s += faqItem('faq-9','Can I export my data?','Yes. CSV export is free for everyone. PDF report export is a Premium feature.');
  s += faqItem('faq-10','What happens if I delete my account?','Your data is kept for 30 days after deletion. Log back in within that window to restore everything. After 30 days, it is gone for good.');
  s += faqItem('faq-11','Is my data secure?','All data is stored in Google Firebase Firestore, gated by security rules so only authenticated members of your household can reach it, and encrypted in transit and at rest. See the Privacy Policy for the full picture.','last');
  polShell('scr-faq','help-circle','FAQ','Frequently Asked Questions · Bajeti Yanga',chips,s);
}

// ===============================================
// 16. BOOT -- this is last, everything is declared
// ===============================================

if(localStorage.getItem('nb_dark')==='1') document.body.classList.add('dark');
const lbtnEl=g('lbtn'); if(lbtnEl)lbtnEl.textContent=lang==='en'?'CW':'EN';
if(!localStorage.getItem('nb_uid')) localStorage.setItem('nb_uid','u1');

// -- Privacy: no gate, policy/terms accessible from auth screen --


// -- PWA -- manifest is now a static file linked in <head> (./manifest.webmanifest),
// and icons are static PNGs in ./icons/. Both used to be generated as blob: URLs
// at runtime, which is unreliable for the manifest and outright rejected by
// browsers for service worker registration.
(function(){
  // -- Service Worker -- must be a real same-origin file, not a blob: URL.
  // Bump the version string inside sw.js on every deploy to invalidate old caches.
  if('serviceWorker' in navigator && location.protocol!=='file:'){
    navigator.serviceWorker.register('./sw.js', {scope:'./'}).catch(()=>{});
  }

  // -- Update prompt --
  // sw.js calls skipWaiting() and clients.claim(), so when a deploy changes sw.js the new
  // worker takes over the open page and 'controllerchange' fires. The page itself still
  // holds the old HTML/CSS/JS in memory, so offer a one-tap refresh. It never reloads on
  // its own: someone mid-entry would lose what they typed.
  if('serviceWorker' in navigator && location.protocol!=='file:'){
    var _hadController = !!navigator.serviceWorker.controller;
    var _updateBarShown = false;
    var _lastUpdateCheck = 0;

    var showUpdateBar = function(){
      if(_updateBarShown) return;
      var app=document.getElementById('app'), view=document.getElementById('view');
      if(!app || !view) return;
      _updateBarShown = true;
      var cw = (typeof lang!=='undefined' && lang==='cw');
      var bar=document.createElement('div');
      bar.id='sw-update-bar';
      bar.setAttribute('role','status');
      bar.style.cssText='flex-shrink:0;display:flex;align-items:center;gap:8px;margin:8px 12px 0;padding:5px 5px 5px 14px;'
        +'border-radius:16px;background:var(--glass-bg-strong,var(--white,#fff));color:var(--ink,#1A1A2E);'
        +'-webkit-backdrop-filter:saturate(170%) blur(18px);backdrop-filter:saturate(170%) blur(18px);'
        +'border:1px solid var(--glass-border,rgba(123,31,162,.15));box-shadow:0 6px 18px rgba(74,20,140,.14);'
        +'font:700 .78rem Hanken Grotesk,sans-serif;position:relative;z-index:5';
      var msg=document.createElement('span');
      msg.style.cssText='flex:1;min-width:0';
      msg.textContent = cw ? 'Mtundu watsopano wakonzeka.' : 'New version ready.';
      var go=document.createElement('button');
      go.type='button';
      go.textContent = cw ? 'Tsegulaninso' : 'Refresh';
      go.style.cssText='min-height:40px;padding:0 16px;border:0;border-radius:12px;cursor:pointer;color:#fff;'
        +'font:800 .78rem Hanken Grotesk,sans-serif;background:linear-gradient(145deg,var(--p2,#9C27B0),var(--p1,#7B1FA2))';
      go.onclick=function(){ location.reload(); };
      var x=document.createElement('button');
      x.type='button';
      x.setAttribute('aria-label', cw ? 'Siyani' : 'Dismiss');
      x.textContent='\u00D7';
      x.style.cssText='width:40px;min-height:40px;border:0;background:none;cursor:pointer;color:var(--mid,#455A64);font-size:1.3rem;line-height:1';
      x.onclick=function(){ bar.remove(); };
      bar.appendChild(msg); bar.appendChild(go); bar.appendChild(x);
      app.insertBefore(bar, view);
    };

    navigator.serviceWorker.addEventListener('controllerchange', function(){
      // On a first-ever visit clients.claim() fires this once, and there is nothing to update.
      if(!_hadController){ _hadController = true; return; }
      showUpdateBar();
    });

    // An installed app is usually resumed, not reopened, so the browser never re-checks sw.js
    // on its own. Check when the app comes back to the front (at most every 10 minutes).
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState!=='visible') return;
      if(Date.now()-_lastUpdateCheck < 600000) return;
      _lastUpdateCheck = Date.now();
      navigator.serviceWorker.getRegistration().then(function(r){ if(r) r.update().catch(function(){}); }).catch(function(){});
    });
  }

  // -- In-app Install prompt --
  // States: standalone (already installed, show nothing), available (browser gave us a prompt), ios (Safari has
  // no prompt, show steps), other (no prompt yet: the Profile row still explains how). A prompt can only be used
  // once, so after it is shown (accepted or not) the saved event is dropped.
  window._deferredInstall=null;
  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();
    window._deferredInstall=e;
    refreshInstallUI();
  });
  window.addEventListener('appinstalled',function(){
    window._deferredInstall=null;
    window._justInstalled=true;
    if(typeof toast==='function')toast(lang==='cw'?'App yaikidwa!':'App installed!','s');
    refreshInstallUI();
  });
})();

function installIsStandalone(){
  try{
    if(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if(window.navigator.standalone) return true;
    if(window._justInstalled) return true;
  }catch(e){}
  return false;
}
function installIsIOS(){
  const ua=navigator.userAgent||'';
  return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints>1);
}
// 'standalone' | 'available' | 'ios' | 'other'
function installState(){
  if(installIsStandalone()) return 'standalone';
  if(window._deferredInstall) return 'available';
  if(installIsIOS()) return 'ios';
  return 'other';
}
const INSTALL_COOLDOWN_MS = 14*24*60*60*1000; // a dismissed banner stays hidden for 14 days
function installBannerDismissed(){
  try{ const t=parseInt(localStorage.getItem('nb_install_dismissed')||'0',10); return !!t && (Date.now()-t)<INSTALL_COOLDOWN_MS; }
  catch(e){ return false; }
}
function dismissInstallBanner(){
  try{ localStorage.setItem('nb_install_dismissed', String(Date.now())); }catch(e){}
  const b=document.getElementById('install-banner'); if(b) b.remove();
}
// Banner shown at the top of Home: only when an install is really possible and not recently dismissed.
function installBannerHtml(){
  const st=installState();
  if(!(st==='available'||st==='ios') || installBannerDismissed()) return '';
  const cw=lang==='cw';
  return '<div class="inst-banner" id="install-banner">'
    +'<div class="inst-ico"><i data-lucide="download"></i></div>'
    +'<div class="inst-body"><div class="inst-ttl">'+(cw?'Ikani Bajeti Yanga':'Install Bajeti Yanga')+'</div>'
    +'<div class="inst-sub">'+(cw?'Imatseguka mwachangu ndipo imagwira ntchito popanda intaneti.':'Opens faster and works offline.')+'</div></div>'
    +'<button type="button" class="inst-btn" onclick="triggerInstall()">'+(cw?'Ikani':'Install')+'</button>'
    +'<button type="button" class="inst-x" onclick="dismissInstallBanner()" aria-label="'+(cw?'Tsekani uthenga woyika':'Dismiss install banner')+'"><i data-lucide="x"></i></button>'
    +'</div>';
}
// Row in Profile > General. Always there until the app is installed, so it works after the banner is dismissed.
function installRowHtml(){
  if(installState()==='standalone') return '';
  const cw=lang==='cw';
  return '<div class="stg-row" onclick="triggerInstall()"><div class="stg-row-ico" style="background:var(--p1-bg)"><i data-lucide="download" style="color:var(--p1)"></i></div>'
    +'<div class="stg-row-body"><div class="stg-row-lbl">'+(cw?'Ikani pulogalamu':'Install app')+'</div>'
    +'<div class="stg-row-sub">'+(cw?'Imatseguka mwachangu ndipo imagwira ntchito popanda intaneti':'Opens faster and works offline')+'</div></div>'
    +'<div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
}
function refreshInstallUI(){
  try{
    const b=document.getElementById('install-banner');
    if(tab==='home'||(tab==='stg'&&!_stgSection)){ if(typeof render==='function') render(); }
    else if(b && installState()==='standalone') b.remove();
  }catch(e){}
}
function triggerInstall(){
  const ev=window._deferredInstall;
  if(ev){
    window._deferredInstall=null; // a saved prompt works only once
    try{
      ev.prompt();
      ev.userChoice.then(function(r){
        if(r && r.outcome!=='accepted'){ try{ localStorage.setItem('nb_install_dismissed', String(Date.now())); }catch(e){} }
        refreshInstallUI();
      }).catch(function(){ refreshInstallUI(); });
    }catch(e){ refreshInstallUI(); showInstallHelp(); }
    return;
  }
  showInstallHelp();
}
// No browser prompt available (iOS, or the prompt was already used): say how to install by hand.
function showInstallHelp(){
  const cw=lang==='cw', ios=installIsIOS();
  const steps = ios
    ? (cw?'Dinani batani la Share, kenako dinani Add to Home Screen.':'Tap the Share button, then tap Add to Home Screen.')
    : (cw?'Tsegulani menyu ya msakatuli (madontho atatu), kenako dinani Install app kapena Add to Home screen.':'Open the browser menu (the three dots), then tap Install app or Add to Home screen.');
  const h='<div class="dh"></div><h3>'+(cw?'Ikani Bajeti Yanga':'Install Bajeti Yanga')+'</h3>'
    +'<p style="font-size:.84rem;line-height:1.5;color:var(--mid);margin:6px 0 14px">'+esc(steps)+'</p>'
    +'<button class="btnM" onclick="closeM(&quot;mv-u&quot;)">'+(cw?'Zatheka':'Got it')+'</button>';
  g('mb-u').innerHTML=h; if(window.lucide) lucide.createIcons({nodes:[g('mb-u')]}); openM('mv-u');
}

// Boot only if privacy already agreed
