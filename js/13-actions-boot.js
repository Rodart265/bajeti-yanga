// ===============================================
// DATA-ATTR HELPER FUNCTIONS (click delegates)
// ===============================================
function openEPd(el){ openEP(el.dataset.pid); }
function doDelD(el){ doDel(el.dataset.pid); }
function restoreTrashD(el){ restoreTrash(el.dataset.pid); }
function pickID(el){ pickI(parseInt(el.dataset.i)); }
function pickCustom(){ selItem='custom'; customCat='Other'; rLog(); setTimeout(()=>{const n=g('custom-item-name');if(n)n.focus();},200); }
function pickCustomCat(cat){
  customCat=cat;
  const grid=g('custom-cat-grid'); if(!grid)return;
  grid.querySelectorAll('button[data-cat]').forEach(b=>{const s=b.dataset.cat===cat; b.style.borderColor=s?'var(--p1)':'var(--border)'; b.style.background=s?'var(--p1)':'var(--white)'; b.style.color=s?'#fff':'var(--mid)';});
}
function autoDetectCustomCat(name){
  const n=(name||'').toLowerCase();
  const map=[
    {cat:'Food',keys:['rice','maize','ufa','tomato','onion','oil','sugar','salt','bread','meat','fish','chicken','nsima','flour','milk','egg','beans','grocery','food','vegetables','rape','cabbage','groundnut','soya','cassava','fertilizer','fertiliser','seeds','npk','urea','dap','cane']},
    {cat:'Transport',keys:['bus','taxi','minibus','petrol','fuel','fare','transport','ticket','car','tyre','tube','boda','bicycle','diesel','parking','car wash']},
    {cat:'Household',keys:['soap','washing','detergent','bleach','toilet','paper','broom','rent','electric','water','airtime','data','wifi','internet','prepaid','bill','plug','socket','cable','wire','bulb','battery','torch','charger','dstv','gotv','token','extension','adaptor']},
    {cat:'Personal',keys:['medicine','clinic','hospital','doctor','school','fees','uniform','book','pen','hair','barber','salon','clothes','shoes','phone','chitenje','chitengi','tablets','syrup','panadol','lotion','cream','makeup','deodorant','dress','shirt','blouse','trousers','skirt','sandals']},
  ];
  let det='Other';
  for(const e of map){if(e.keys.some(k=>n.includes(k))){det=e.cat;break;}}
  customCat=det; pickCustomCat(det);
}
function dismissNameNotif(){ var n=document.querySelector('.name-notif'); if(n)n.remove(); }
function delBillD(el){ delBill(parseInt(el.dataset.bi)); }
function swUD(el){ swU(el.dataset.uid); }
function openPxMD(el){ openPxM(el.dataset.pid); }
// Auth for the AI worker: a short-lived Firebase ID token (verified server-side) instead of a shared secret baked into the page.
// Throws (never sends an anonymous request) when there is no usable sign-in token, so the person sees "please sign in
// again" instead of a confusing "AI is busy". aiCode 'auth' is also what stops the retry loops from hammering the Worker.
function _aiErr(msg, code, status){ const e=new Error(msg); e.aiCode=code; if(status) e.status=status; return e; }
async function _authHeaders(){
  const h={'Content-Type':'application/json'};
  if(!(auth && auth.currentUser)) throw _aiErr('not signed in','auth');
  try{ h['Authorization']='Bearer '+(await auth.currentUser.getIdToken()); }
  catch(e){ throw _aiErr('could not refresh sign-in','auth'); }
  return h;
}
// feature: 'msg' | 'magic' | 'scan' | 'summ'. Together with the household id it lets the Worker apply the right daily
// limit (free vs Premium) on the server, where it cannot be reset from the browser.
async function aiHeaders(feature){
  const h=await _authHeaders();
  if(hhId) h['X-Household']=hhId;
  if(feature) h['X-AI-Feature']=feature;
  return h;
}
// Turns a failed Worker response into an Error carrying a machine-readable aiCode: 'auth' (401/403) or 'quota'
// (429 with error.code === 'quota_exceeded'). Everything else is treated as a temporary "busy".
function _aiHttpErr(res, resData){
  const m = resData && resData.error && resData.error.message;
  const e = new Error(m || ('API Error '+res.status));
  e.status = res.status;
  const c = resData && resData.error && (resData.error.code || resData.error.status);
  if(res.status===401 || res.status===403) e.aiCode='auth';
  else if(res.status===429 && c==='quota_exceeded') e.aiCode='quota';
  return e;
}
// Friendly text for an AI failure, or null when it is just "busy" (callers keep their own busy wording).
function aiFailMessage(err, isCW){
  const code = err && err.aiCode;
  if(code==='auth') return isCW?'Chonde lowaninso kuti mugwiritse ntchito Bajeti AI.':'Please sign in again to use Bajeti AI.';
  if(code==='quota' || (err && err.message && /quota/i.test(err.message)))
    return isCW?'Bajeti AI yafika pa malire a lero. Yesaninso mawa.':'Bajeti AI has reached its daily limit. Please try again tomorrow.';
  return null;
}
function viewItemD(el){ viewItem(el.dataset.iid); }
function openPxM(id){ openEP(id); }
function viewItem(name){
  const t=tx();
  const txs=lPx.filter(p=>p.item===name&&p.type!=='income'&&!p.deleted&&isTM(p.date));
  const total=txs.reduce((s,p)=>s+Number(p.amount||0),0);
  const it=lCfg.items.find(i=>i.name===name);
  let h='<div class="dh"></div><h3>'+ico(name)+' '+esc(trName(name))+'</h3>';
  h+='<div style="display:flex;justify-content:space-between;margin-bottom:12px;font-size:.82rem">';
  h+='<span style="color:var(--mid)">Budget: <strong>'+MK(it?it.budget:0)+'</strong></span>';
  h+='<span style="color:var(--r1)">Spent: <strong>'+MK(total)+'</strong></span></div>';
  if(txs.length){
    h+='<div style="display:flex;flex-direction:column;gap:7px">';
    txs.slice().sort((a,b)=>b.timestamp-a.timestamp).forEach(p=>{
      const u=uById(p.userId);
      h+='<div style="display:flex;justify-content:space-between;align-items:center;font-size:.78rem;padding:8px 10px;background:var(--mist);border-radius:10px">';
      h+='<div><div style="font-weight:700">'+fmtDate(p.date)+'</div><div style="color:var(--mid)">'+esc(u.name)+(p.notes?' · '+esc(p.notes):'')+'</div></div>';
      h+='<span style="color:var(--r1);font-weight:700">'+MK(p.amount)+'</span></div>';
    });
    h+='</div>';
  } else {
    h+='<div class="empty"><p>'+(lang==='cw'?'Palibe zolemba mwezi uno.':'No entries this month.')+'</p></div>';
  }
  h+='<button class="btnG" style="width:100%;margin-top:14px" onclick="closeM(&quot;mv-u&quot;)">'+t.cancel+'</button>';
  g('mb-u').innerHTML=h; initIcons(); openM('mv-u');
}
function openEUd(el){ openEU(parseInt(el.dataset.i)); }
function delItd(el){ delIt(el.dataset.i); }
function delMemberd(el){ delMember(parseInt(el.dataset.i)); }
function openEBd(el){ openEB(el.dataset.i); }
function topUpGoald(el){ openTopUp(el.dataset.i); }
function delGoald(el){ delGoal(el.dataset.i); }

// Initialize Lucide icons after every render
function initIcons(){
  try{ 
    if(window.lucide){
      // Scope to current view only to avoid re-processing entire document
      const v=g('view');
      if(v) lucide.createIcons({nodes:[v]});
    } 
  }catch(e){ console.warn('[initIcons] Lucide error:', e); }
}
const _origRender = typeof render==='function' ? render : null;
if(_origRender){
  render = function(){
    _origRender();
    setTimeout(initIcons, 0);
  };
}



// ── BOOT ────────────────────────────────────────────────────────────────────
(function(){
  // Privacy gate removed — auth screen has policy links
  try{ applyStaticLang(); }catch(e){}
  bootApp();
  setTimeout(checkNameChange, 2000);
  setTimeout(requestPushPermission, 8000);
})();

