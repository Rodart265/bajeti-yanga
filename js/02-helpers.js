// ===============================================
// 3. PURE HELPERS
// ===============================================

const fmt = new Intl.NumberFormat('en-MW',{style:'currency',currency:'MWK',minimumFractionDigits:0,maximumFractionDigits:0});
const MK  = n => fmt.format(Math.round(n||0)).replace('MWK','MK');
const MKs = n => { n=Math.round(n||0); if(n>=1e6)return 'MK '+(n/1e6).toFixed(1)+'M'; if(n>=1000)return 'MK '+(n/1e3).toFixed(0)+'K'; return MK(n); };
const tx      = () => TX[lang];
// Local-calendar YYYY-MM-DD. toISOString() is UTC, which is the previous day in Malawi (UTC+2) between 00:00 and 02:00.
const localISO = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const today   = () => localISO(new Date());
// Small stable string hash (base36) used to build deterministic Firestore document ids.
const _hashStr = str => { let h=5381; for(let i=0;i<str.length;i++) h=((h<<5)+h+str.charCodeAt(i))|0; return (h>>>0).toString(36); };
const nowTime = () => { const d=new Date(); return d.toTimeString().slice(0,5); };
// Format ISO date string to DD/MM/YYYY for display (Malawian locale convention)
// Output is HTML-escaped because dates come from Firestore and are interpolated into innerHTML in many places.
// A date-only expiry like "2026-12-31" means "valid through the end of that day" in the user's timezone
// (new Date("2026-12-31") is UTC midnight, which ended Premium ~2 hours into the last day in Malawi).
// Milliseconds since epoch from a Firestore Timestamp, an ISO/date string, a number, or a Date. NaN if unusable.
function _toMs(v){
  if(!v) return NaN;
  if(typeof v.toMillis==='function') return v.toMillis();
  if(typeof v.toDate==='function') return v.toDate().getTime();
  return new Date(v).getTime();
}
function _expiryEnd(e){
  const str=String(e||'');
  if(/^\d{4}-\d{2}-\d{2}$/.test(str)){ const p=str.split('-'); return new Date(+p[0],+p[1]-1,+p[2],23,59,59); }
  return new Date(e);
}
// Notes saved by older versions end with a sparkle emoji (U+2728) after "Added via Magic Log". Show them without it.
function cleanNote(n){ return String(n==null?'':n).replace(/[\u2728\uFE0F]/g,'').trim(); }
function fmtDate(s){ if(!s)return ''; const p=String(s).split('T')[0].split('-'); return esc(p.length===3?p[2]+'/'+p[1]+'/'+p[0]:s); }
// Returns true if the stored item name is a reserved category label (data quality flag)
function isBadItemName(n){ return ['other','ena','food','transport','household','personal','unknown','other income','zina'].includes(String(n||'').toLowerCase().trim()); }
const ico     = name => ITEM_ICONS[name] || '<i data-lucide="shopping-cart" style="margin-right:5px;vertical-align:middle;color:var(--p1)"></i>';
// Displays an item's name in the active language, falling back to the original
// (English) name when no translation exists for it in t.itemNames.
const trName  = name => (TX[lang].itemNames && TX[lang].itemNames[name]) || name;
const catOf = (name, explicitCat) => {
  // 1. Highest priority: the transaction's own stored category (set by the user
  //    when creating a custom item, or by Magic Log/receipt scan extraction).
  //    Previously this was ignored entirely -- catOf() only ever looked at
  //    lCfg.items, so a transaction's own p.cat field was never read on render,
  //    causing custom-categorized items to silently show as "Other" forever.
  if(explicitCat && ['Food','Household','Personal','Transport','Other'].includes(explicitCat) && explicitCat!=='Other'){
    return explicitCat;
  }
  // 1b. What this household chose last time for this item name (list of "name|Category", newest last; see rememberCats in js/12-chat.js).
  const kk = s => String(s||'').toLowerCase().replace(/\s+/g,' ').trim();
  const key = kk(name);
  const mem = lCfg && Array.isArray(lCfg.catMemory) ? lCfg.catMemory : null;
  if(key && mem){ for(let i=mem.length-1;i>=0;i--){ const e=mem[i]; if(typeof e!=='string') continue; const p=e.lastIndexOf('|'); if(p>0 && e.slice(0,p)===key){ const c=e.slice(p+1); if(['Food','Household','Personal','Transport','Other'].includes(c)) return c; break; } } }
  // 2. lCfg.items definition (budget item's own assigned category). Names match ignoring capital letters and extra spaces,
  //    so an item typed or extracted as "Cooking oil" finds "Cooking Oil" instead of falling through to Other.
  const item = lCfg&&lCfg.items ? (lCfg.items.find(it=>it.name===name) || (key ? lCfg.items.find(it=>kk(it.name)===key) : null)) : null;
  if(item&&item.cat&&['Food','Household','Personal','Transport','Other'].includes(item.cat)) return item.cat;
  // 3. Built-in category map
  for(const[c,a] of Object.entries(ITEM_CATS)){ if(a.includes(name) || (key && a.some(x=>kk(x)===key))) return c; }
  // 4. Keyword-based fallback for custom/AI-extracted items
  const n=(name||'').toLowerCase();
  if(['plug','socket','cable','wire','switch','extension','bulb','battery','torch','charger','adaptor','adapter','power bank','powerbank'].some(k=>n.includes(k))) return 'Household';
  if(['airtime','bundles','bundle','recharge','data','wifi','internet','dstv','gotv','prepaid','electricity token','token'].some(k=>n.includes(k))) return 'Household';
  if(['rent','water bill','electricity bill','refuse','garbage','rates'].some(k=>n.includes(k))) return 'Household';
  if(['fertilizer','fertiliser','npk','urea','dap','can','seeds','maize seed','hybrid seed','pesticide','herbicide','insecticide','chemicals'].some(k=>n.includes(k))) return 'Food';
  if(['vegetables','veggies','tomatoes','onions','rape','mustard','cabbage','pumpkin','sweet potato','cassava','groundnuts','soya'].some(k=>n.includes(k))) return 'Food';
  if(['tablets','syrup','medicine','panadol','amoxicillin','antibiotic','malaria','ors','deworming','clinic fee','hospital fee','consultation'].some(k=>n.includes(k))) return 'Personal';
  if(['chitenje','chitengi','wrapper','blouse','dress','shirt','trousers','skirt','uniform','shoes','sandals','slippers','clothes','clothing'].some(k=>n.includes(k))) return 'Personal';
  if(['haircut','salon','barbing','braiding','weave','makeup','lotion','cream','vaseline','perfume','deodorant'].some(k=>n.includes(k))) return 'Personal';
  if(['minibus','motor bike','boda','bicycle','tyre','tube','fuel','petrol','diesel','oil change','vehicle','car wash','parking'].some(k=>n.includes(k))) return 'Transport';
  // Only the five known categories may come back. A stored value outside that list (someone else's data, or an
  // old/odd record) becomes 'Other', so nothing downstream can ever print attacker-chosen text as a category.
  return (explicitCat && ['Food','Household','Personal','Transport','Other'].includes(explicitCat)) ? explicitCat : 'Other';
};

// The budget period that contains today. With a salary day (e.g. 25) the period "May" runs 25 Apr - 24 May,
// so from the 25th onward today already belongs to the NEXT calendar month's period.
function curM()  {
  const d=new Date(); let m=d.getMonth(), y=d.getFullYear();
  const sd = (typeof lCfg!=='undefined' && lCfg && lCfg.salaryDay) ? Math.min(Math.max(parseInt(lCfg.salaryDay,10)||0,0),28) : 0;
  if(sd>1 && d.getDate()>=sd){ m++; if(m>11){ m=0; y++; } }
  return {m,y};
}
function vmObj() { return viewMonth||curM(); }

// ── Budget Period ──
// lCfg.salaryDay (1–28): when set, the budget month runs from
// salaryDay of prev month to (salaryDay−1) of current viewed month.
// e.g. salaryDay=25: period = Apr 25 – May 24 when viewing May.
// All totals, caps, summary, insights, member counts use isTM() so they all respect this.
function getBudgetPeriod(forMonth){
  let sd = lCfg && lCfg.salaryDay ? parseInt(lCfg.salaryDay,10) : 0;
  sd = Math.min(Math.max(sd, 0), 28); // hard clamp — UI allows 1-28 but Firestore may hold legacy values
  const v = forMonth || vmObj();
  if(!sd || sd<=1){
    // Standard: whole calendar month
    return { startY:v.y, startM:v.m, startD:1,
             endY:v.y, endM:v.m, endD:new Date(v.y, v.m+1, 0).getDate() };
  }
  // Period starts on salaryDay of the previous month relative to viewed month
  let startM=v.m-1, startY=v.y;
  if(startM<0){ startM=11; startY=v.y-1; }
  // Period ends on (salaryDay−1) of viewed month (sd is always 2-28 here, since sd<=1 returned above)
  const endD = sd-1;
  const endM = v.m;
  const endY = v.y;
  return { startY, startM, startD:sd, endY, endM, endD };
}
function budgetPeriodLabel(){
  const p=getBudgetPeriod(), mn=tx().months;
  if(!lCfg||!lCfg.salaryDay||lCfg.salaryDay<=1) return mn[p.startM]+' '+p.startY;
  return p.startD+' '+mn[p.startM]+' – '+p.endD+' '+mn[p.endM]+' '+p.endY;
}
function isTM(s, forMonth){
  if(!s)return false;
  try{
    const clean=String(s).split('T')[0].trim();
    const parts=clean.split('-');
    if(parts.length<3) return false;
    const dy=parseInt(parts[0],10), dm=parseInt(parts[1],10)-1, dd=parseInt(parts[2],10);
    if(isNaN(dy)||isNaN(dm)||isNaN(dd)) return false;
    // Use Date objects so year-boundary salary-day periods compare correctly
    const date =new Date(dy, dm, dd);
    const p    =getBudgetPeriod(forMonth);
    const start=new Date(p.startY, p.startM, p.startD);
    const end  =new Date(p.endY,   p.endM,   p.endD);
    return date>=start && date<=end;
  }catch(e){ return false; }
}
function isCurM(){ const v=vmObj(),c=curM(); return v.m===c.m&&v.y===c.y; }
function mName() { const v=vmObj(); return tx().months[v.m]+' '+v.y; }
function prevM() { const v=vmObj(); viewMonth=v.m===0?{m:11,y:v.y-1}:{m:v.m-1,y:v.y}; _invalidateMemo(); render(); if(typeof ensurePxFrom==='function') ensurePxFrom(new Date(viewMonth.y,viewMonth.m,1)); }
function nextM() { if(isCurM())return; const v=vmObj(); viewMonth=v.m===11?{m:0,y:v.y+1}:{m:v.m+1,y:v.y}; _invalidateMemo(); render(); }

function iSpent(name){ _ensureMemo(); return _memoByItem[name]||0; }
function totSp()     { _ensureMemo(); return _memoSp; }
function totIn()     { _ensureMemo(); return _memoIn; }
function actU()      { return lCfg.users.find(u=>u.id===localStorage.getItem('nb_uid'))||lCfg.users[0]; }
function uById(id)   { return lCfg.users.find(u=>u.id===id)||lCfg.users[0]; }
// One person in the household: screens skip the member picker, member filter and member tags (they come back with 2+ members).
function isSolo()    { return !lCfg || !lCfg.users || lCfg.users.length<=1; }
function statOf(sp,bg){ if(!sp)return'none'; const r=sp/bg; return r>=1?'over':r>=.8?'near':'ok'; }
// A household / group code as the app generates it. Anything else (quotes, markup, spaces) is refused before it can be
// stored or placed into the page: a code arrives from another person, so it is treated as untrusted input.
function _validCode(c){ return /^[a-z0-9_-]{3,40}$/i.test(String(c||'')); }
function randCode(){
  const chars='abcdefghjkmnpqrstuvwxyz23456789';
  const bytes=crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes).map(b=>chars[b%chars.length]).join('');
}

// ===============================================
// 4. DOM HELPERS
// ===============================================

const g   = id => document.getElementById(id);
const val = id => (g(id)||{}).value||'';
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
// Colours come from Firestore (members set their own), so only allow plain hex before putting them in style attributes.
function sC(c){
  c=String(c||'').trim();
  if(/^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
  // The swatch picker stores el.style.background, which browsers serialise as "rgb(21, 101, 192)"; normalise to hex.
  const m=/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(c);
  if(m){ const h=n=>('0'+Math.min(255,+n).toString(16)).slice(-2); return '#'+h(m[1])+h(m[2])+h(m[3]); }
  return '#176B78';
}
// Lightweight markdown -> HTML for AI-generated text. The AI is told to use
// **bold** and bullet lists; this is the ONLY place that syntax should ever
// reach the user as real formatting instead of literal asterisks. Any screen
// that shows raw AI text must run it through this (not esc() alone).
function mdLite(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/^[-\u2022 ] (.+)/gm,'<li>$1</li>')
    .replace(/\n/g,'<br>');
}
// Plain-language text for a Firestore (or other SDK) error, instead of "Error: Missing or insufficient permissions."
// The real code is logged so it can be diagnosed, and shown only when we have no better words for it.
function fsErrMsg(e){
  const cw=lang==='cw', c=(e&&e.code)||'';
  try{ console.error('[error]', c, e&&e.message); }catch(_){}
  if(c==='permission-denied') return cw?'Mulibe chilolezo chochita izi. Ngati mwangolembetsa kumene, tsimikizani imelo yanu, kenako tulukani ndi kulowanso.':'You do not have permission to do this. If you just signed up, make sure your email is verified, then sign out and back in.';
  if(c==='unavailable'||c==='deadline-exceeded'||c==='network-request-failed') return cw?'Palibe kulumikizana ndi seva. Onani intaneti yanu ndipo yesaninso.':'Cannot reach the server. Check your internet connection and try again.';
  if(c==='unauthenticated') return cw?'Nthawi yanu yatha. Lowaninso.':'Your session has ended. Please sign in again.';
  if(c==='resource-exhausted') return cw?'Ntchito yatanganidwa kapena malire afika. Yesaninso mtsogolo.':'The service is busy or a limit was reached. Please try again later.';
  if(c==='not-found') return cw?'Sichinapezeke. Mwina chachotsedwa.':'That could not be found. It may have been removed.';
  if(c==='aborted'||c==='already-exists'||c==='failed-precondition') return cw?'Zinasintha pamene mukusunga. Yesaninso.':'This changed while you were saving. Please try again.';
  if(c) return (cw?'Chinachake chinalakwika (':'Something went wrong (')+c+(cw?'). Yesaninso.':'). Please try again.');
  return (cw?'Pulogalamu yakumana ndi vuto: ':'The app hit an unexpected problem: ')+(((e&&e.message)||'unknown').toString().slice(0,120));
}
// fetch with a timeout, so a stalled connection ends in an error instead of a screen that never recovers.
function fetchT(url, opts, ms){
  const c = new AbortController();
  const t = setTimeout(function(){ c.abort(); }, ms || 30000);
  return fetch(url, Object.assign({}, opts, { signal: c.signal })).finally(function(){ clearTimeout(t); });
}
function show(id){ const el=g(id); if(el)el.classList.remove('hide'); if(id==='scr-setup' && typeof resetSetupJoinCard==='function') resetSetupJoinCard(); }
function hide(id){ const el=g(id); if(el)el.classList.add('hide'); }
// Pick the English or Chichewa wording for a string that is built outside t / tx().
function L(en,cw){ return lang==='cw'?cw:en; }
// A button for an empty screen: says what to do next. `act` is the onclick code, with double quotes written as &quot;.
function emptyAction(label,act){ return '<button class="btnM" style="margin-top:12px;min-height:44px;padding:10px 18px;width:auto" onclick="'+act+'">'+label+'</button>'; }
function toast(msg,type){
  const el=g('toast'); if(!el)return;
  type = type||'s';
  // Screen readers: say the message through a separate live region that is always on the page. The visible toast is
  // rebuilt on every call, which readers tend to miss. Errors interrupt; everything else waits its turn.
  const live=g('toast-live');
  if(live){ live.setAttribute('aria-live', type==='e'?'assertive':'polite'); live.textContent=''; setTimeout(function(){ live.textContent=msg; },60); }
  const icons = {s:'check-circle', e:'alert-circle', i:'info'};
  el.className = 'toast '+type+(document.querySelector('.ov.open')?' top':'');
  // Duration scales with message length so short messages don't linger and
  // long messages aren't cut off before they can be read.
  const duration = Math.min(6000, Math.max(2400, 1400 + msg.length*45));
  el.innerHTML = '<div class="t-ic-wrap"><i data-lucide="'+icons[type]+'" style="width:13px;height:13px"></i></div>'
    +'<div class="t-msg">'+esc(msg)+'</div>'
    +'<button class="t-close" onclick="event.stopPropagation();dismissToast()" aria-label="'+L('Dismiss','Tsekani')+'"><i data-lucide="x" style="width:13px;height:13px"></i></button>'
    +'<div class="t-bar" style="animation-duration:'+duration+'ms"></div>';
  if(window.lucide) lucide.createIcons({nodes:[el]});
  clearTimeout(window._toastTimer);
  el.classList.add('on');
  window._toastTimer = setTimeout(dismissToast, duration);
}
function dismissToast(){
  const el=g('toast'); if(!el)return;
  el.classList.remove('on');
  clearTimeout(window._toastTimer);
}
function setDot(s){ const d=g('sync-dot'); if(!d)return; d.className='sync-dot'+(s==='off'?' off':s==='spin'?' spin':'');
  const cw=(typeof lang!=='undefined'&&lang==='cw');
  const lbl=s==='off'?(cw?'Palibe kulumikizana':'Not connected'):s==='spin'?(cw?'Ikusunga…':'Saving…'):(cw?'Zasinthidwa':'Synced');
  d.setAttribute('aria-label',lbl); d.title=lbl; d.dataset.lbl=lbl; }
function tgPW(id,btn){ const el=g(id); if(!el)return; const sh=el.type==='text'; el.type=sh?'password':'text'; btn.innerHTML=sh?'<i data-lucide="eye"></i>':'<i data-lucide="eye-off"></i>'; btn.setAttribute('aria-label', sh?L('Show password','Show password'):L('Hide password','Hide password')); if(window.lucide)lucide.createIcons({nodes:[btn]}); }



// ── Stable ids for budget items, bills and goals ────────────────────────────
// These live in arrays inside households/{code}.config. Buttons used to carry a list POSITION, which points at a
// different record as soon as anyone adds, deletes or re-sorts (bills re-sort on every save) while a card or
// dialog is open. Every record now carries an `id`, and handlers look the record up by id at the moment of the
// action. Records written before ids existed have none until the owner's app (or any save) assigns one; until
// then recKey() hands out "~<position>", which recIdx() accepts only while that record still has no id.
function newRecId(prefix){ return (prefix||'r')+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function ensureRecIds(cfg){
  let changed=false;
  [['items','i'],['bills','b'],['goals','g']].forEach(function(p){
    if(cfg && Array.isArray(cfg[p[0]])) cfg[p[0]].forEach(function(r){
      // An id that is missing, or not a plain id (letters, digits, - _ only), is replaced. Real ids are always plain;
      // anything else was written by hand and must never be placed inside a button's onclick.
      if(r && typeof r==='object' && !(r.id && /^[A-Za-z0-9_-]{1,40}$/.test(String(r.id)))){ r.id=newRecId(p[1]); changed=true; }
    });
  });
  return changed;
}
function cfgNeedsRecIds(cfg){
  return !!cfg && ['items','bills','goals'].some(function(k){ return Array.isArray(cfg[k]) && cfg[k].some(function(r){ return r && typeof r==='object' && !(r.id && /^[A-Za-z0-9_-]{1,40}$/.test(String(r.id))); }); });
}
function recKey(rec,i){ return rec && rec.id && /^[A-Za-z0-9_-]{1,40}$/.test(String(rec.id)) ? String(rec.id) : '~'+i; }
function recIdx(arr,key){
  if(!Array.isArray(arr) || key===null || key===undefined || key==='') return -1;
  key=String(key);
  if(key.charAt(0)==='~'){ const n=parseInt(key.slice(1),10); return (arr[n] && !(arr[n].id && /^[A-Za-z0-9_-]{1,40}$/.test(String(arr[n].id)))) ? n : -1; }
  return arr.findIndex(function(r){ return r && r.id===key; });
}

// Work out which records of the three lists (items, bills, goals) changed between two copies of the settings, so each
// changed record can also be saved as its own document (households/{code}/items|bills|goals/{id}). Pure function: it
// only returns what to write; js/05-household.js does the writing. Records without a plain id are skipped.
// A list that is missing from `next` is left alone (never treated as "everything was deleted").
// Each record is written with its list position as `order`, so a re-ordered list is saved in the new order too.
function recMirrorOps(prev,next){
  const out={set:[],del:[]}, plain=/^[A-Za-z0-9_-]{1,40}$/;
  ['items','bills','goals'].forEach(function(k){
    if(!next || !Array.isArray(next[k])) return;
    const a=(prev && Array.isArray(prev[k]))?prev[k]:[], old={}, seen={};
    a.forEach(function(r,i){ if(r && typeof r==='object' && r.id && plain.test(String(r.id))) old[String(r.id)]={json:JSON.stringify(r),idx:i}; });
    next[k].forEach(function(r,i){
      if(!r || typeof r!=='object' || !r.id || !plain.test(String(r.id))) return;
      const id=String(r.id); seen[id]=1;
      const o=old[id];
      if(!o || o.json!==JSON.stringify(r) || o.idx!==i) out.set.push({col:k,id:id,data:JSON.parse(JSON.stringify(Object.assign({},r,{order:i})))});
    });
    Object.keys(old).forEach(function(id){ if(!seen[id]) out.del.push({col:k,id:id}); });
  });
  return out;
}
