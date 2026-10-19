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
    +'<div style="flex:1;min-width:0"><div style="font-family:Syne,sans-serif;font-size:.86rem;font-weight:800;color:#3D0E7A;margin-bottom:5px">'+num+'. '+title+'</div>'
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
    +'<div><h1 style="font-family:Syne,sans-serif;font-size:1.25rem;font-weight:800;color:#fff;margin-bottom:2px">'+heading+'</h1>'
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
    ['lock','#7B1FA2',isCW?'Yosungidwa mosalala':'Encrypted storage'],
    ['ban','#E65100',isCW?'Sitigulitsa deta':'No data selling'],
    ['trash-2','#2E7D32',isCW?'Chotsani nthawi ina':'Delete anytime']
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

  // -- In-app Install prompt --
  window._deferredInstall=null;
  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();
    window._deferredInstall=e;
    var btn=document.getElementById('install-fab');
    if(btn){btn.style.display='flex';}
  });
  window.addEventListener('appinstalled',function(){
    window._deferredInstall=null;
    var btn=document.getElementById('install-fab');
    if(btn){btn.style.display='none';}
    if(typeof toast==='function')toast('App installed! &#127881;.','s');
  });
})();

function triggerInstall(){
  if(window._deferredInstall){
    window._deferredInstall.prompt();
    window._deferredInstall.userChoice.then(function(r){
      if(r.outcome==='accepted'){window._deferredInstall=null;}
    });
  }
}

// Boot only if privacy already agreed

