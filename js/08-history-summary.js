// ===============================================
// 11. HISTORY
// ===============================================

function rHist(){
  var t=tx(), isCW=lang==='cw';
  var sqEsc=srchQ.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  var list=lPx.filter(function(p){return !p.deleted;});
  if(histTime==='month'){
    list=list.filter(function(p){return isTM(p.date);});
  } else {
    list=list.filter(function(p){return isInTimeRange(p.date);});
  }
  if(histFilter==='inc') list=list.filter(function(p){return p.type==='income';});
  else if(histFilter==='exp') list=list.filter(function(p){return p.type!=='income';});
  if(fUser!=='all') list=list.filter(function(p){return p.userId===fUser;});
  if(srchQ) list=list.filter(function(p){return (p.item+' '+(p.notes||'')).toLowerCase().includes(srchQ.toLowerCase());});
  var listInc=list.filter(function(p){return p.type==='income';}).reduce(function(s,p){return s+Number(p.amount||0);},0);
  var listExp=list.filter(function(p){return p.type!=='income';}).reduce(function(s,p){return s+Number(p.amount||0);},0);

  var h='<div class="page">';

  // Month navigation when in month mode
  if(histTime==='month'){
    h+=monthNav('mnav hist-mnav');
  }

  // Action buttons row
  h+='<div style="display:flex;gap:8px;margin-bottom:10px">';
  h+='<button class="bsm be" style="flex:1;padding:10px;font-size:.75rem" onclick="copyPreviousMonth()"><i data-lucide="copy" style="width:13px;height:13px;margin-right:4px;vertical-align:middle;color:var(--p1-text)"></i> '+(isCW?'Koperani za Mwezi Wapita':'Copy Last Month')+lockBadge(10)+'</button>';
  h+='<button class="bsm bd" style="padding:10px;font-size:.75rem" onclick="openTrash()"><i data-lucide="trash-2" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+(isCW?'Zochotsedwa':'Trash')+lockBadge(10)+'</button>';
  h+='</div>';

  // Running totals strip
  if(list.length>0){
    h+='<div style="display:flex;gap:6px;margin-bottom:8px">';
    if(listInc>0) h+='<div style="flex:1;background:var(--pos-bg);border-radius:var(--cr-md);padding:7px 10px;text-align:center"><div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--pos)">'+(lang==='cw'?'Ndalama Zolowa':'Income')+'</div><div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.82rem;color:var(--pos)">+'+MKs(listInc)+'</div></div>';
    if(listExp>0) h+='<div style="flex:1;background:var(--neg-bg);border-radius:var(--cr-md);padding:7px 10px;text-align:center"><div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--neg)">'+(lang==='cw'?'Zotuluka':'Spent')+'</div><div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.82rem;color:var(--neg)">'+MKs(listExp)+'</div></div>';
    h+='<div style="flex:1;background:var(--mist);border-radius:var(--cr-md);padding:7px 10px;text-align:center"><div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.3px;color:var(--mid)">'+(lang==='cw'?'Zolemba':'Entries')+'</div><div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.82rem;color:var(--ink)">'+list.length+'</div></div>';
    h+='</div>';
  }

  // Search
  h+='<div class="srch-wrap"><input type="text" placeholder="'+t.searchPurchases+'" value="'+sqEsc+'" oninput="doSrch(this.value)" aria-label="'+L('Search transactions','Sakani zolemba')+'"></div>';

  // Time range tabs
  h+='<div class="hist-filter" style="margin-bottom:6px">';
  h+='<button class="hf'+(histTime==='week'?' on':'')+'" onclick="setHT(this)" data-t="week"><i data-lucide="calendar" style="width:13px;height:13px;margin-right:4px;vertical-align:middle"></i> '+(isCW?'Sabata':'Week')+'</button>';
  h+='<button class="hf'+(histTime==='month'?' on':'')+'" onclick="setHT(this)" data-t="month"><i data-lucide="calendar-days" style="width:13px;height:13px;margin-right:4px;vertical-align:middle"></i> '+(isCW?'Mwezi':'Month')+'</button>';
  h+='<button class="hf'+(histTime==='year'?' on':'')+'" onclick="setHT(this)" data-t="year"><i data-lucide="calendar-range" style="width:13px;height:13px;margin-right:4px;vertical-align:middle"></i> '+(isCW?'Chaka':'Year')+'</button>';
  h+='<button class="hf'+(histTime==='all'?' on':'')+'" onclick="setHT(this)" data-t="all"><i data-lucide="infinity" style="width:13px;height:13px;margin-right:4px;vertical-align:middle"></i> '+(isCW?'Zonse':'All')+'</button>';
  h+='</div>';
  h+='<div class="hist-filter">';
  h+='<button class="hf'+(histFilter==='all'?' on':'')+'" onclick="setHF(this)" data-f="all"><i data-lucide="copy" style="width:13px;height:13px;margin-right:4px;vertical-align:middle;color:var(--p1-text)"></i> '+(isCW?'Zonse':'All')+'</button>';
  h+='<button class="hf'+(histFilter==='inc'?' on-inc':'')+'" onclick="setHF(this)" data-f="inc"><i data-lucide="trending-up" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+(isCW?'Ndalama Zolowa':'Income')+'</button>';
  h+='<button class="hf'+(histFilter==='exp'?' on-exp':'')+'" onclick="setHF(this)" data-f="exp"><i data-lucide="trending-down" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+(isCW?'Ndalama Zotuluka':'Expenses')+'</button>';
  h+='</div>';

  // User filter tags
  h+='<div class="ftags">';
  h+='<div class="ftag'+(fUser==="all"?" on":"")+'\" onclick="setF(&quot;all&quot;)">'+t.all+'</div>';
  lCfg.users.forEach(function(u){
    var on=fUser===u.id;
    h+='<div class="ftag'+(on?' on':'')+' ftag-u" onclick="setFU(this)" data-uid="'+esc(u.id)+'" style="'+(on?'background:'+sC(u.color)+';border-color:'+sC(u.color):'')+'">'+esc(u.name)+'</div>';
  });
  h+='</div>';

  // List grouped by date
  if(list.length){
    var byDate={};
    list.forEach(function(p){if(!byDate[p.date])byDate[p.date]=[];byDate[p.date].push(p);});
    Object.keys(byDate).sort().reverse().forEach(function(date){
      var dayExp=byDate[date].filter(function(p){return p.type!=='income';}).reduce(function(s,p){return s+Number(p.amount||0);},0);
      h+='<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 2px 4px;border-bottom:1.5px solid var(--border);margin-bottom:4px">';
      h+='<span style="font-size:.72rem;font-weight:800;color:var(--mid);text-transform:uppercase;letter-spacing:.4px">'+fmtDate(date)+'</span>';
      if(dayExp>0)h+='<span style="font-size:.72rem;font-weight:700;color:var(--neg)">− '+MKs(dayExp)+'</span>';
      h+='</div>';
      byDate[date].forEach(function(p){
        var u=uById(p.userId), isI=p.type==='income';
        var cc2=isI?'#1B5E20':(CAT_COLORS[catOf(p.item,p.cat)]||'#7B1FA2');
        var catLabel=catOf(p.item,p.cat);
        var badName=isBadItemName(p.item);
        h+='<div class="pli'+(isI?' income-e':'')+'">';
        h+='<div class="plico" style="background:'+cc2+'1A;border-radius:14px">'+ico(p.item)+'</div>';
        h+='<div class="plb"><div class="pltop">';
        h+='<div class="plname">'+esc(trName(p.item))+(badName?' <i data-lucide="alert-triangle" title="'+L('This entry needs a proper name','Cholembachi chikufunika dzina loyenera')+'" style="width:12px;height:12px;color:var(--gold-ink);vertical-align:middle"></i>':'')+(p.recurring?' <i data-lucide="refresh-cw" style="width:12px;height:12px;margin-right:3px;vertical-align:middle"></i>':'')+' <span style="font-size:.72rem;font-weight:700;background:'+(isI?'#E8F5E9':'#F3E5F5')+';color:'+(isI?'#1B5E20':'var(--p1)')+';padding:1px 5px;border-radius:5px">'+catLabel+'</span></div>';
        h+='<div class="plamt'+(isI?' inc':' exp')+'">'+(isI?'+ ':'− ')+MK(p.amount)+'</div></div>';
        if(p.notes) h+='<div class="plnote">'+esc(p.notes)+'</div>';
        h+='<div class="plrow2"><span class="prwho" style="background:'+sC(u.color)+'">'+esc(u.name)+'</span>'+(p.qty?'<span style="font-size:.72rem;color:var(--mid)">'+esc(p.qty)+' '+esc(p.unit||'')+'</span>':'')+'</div>';
        h+='<div class="plact">';
        h+='<button class="bsm be" onclick="openEPd(this)" data-pid="'+esc(p.id)+'"><i data-lucide="pencil" style="width:11px;height:11px;vertical-align:-1px"></i> '+t.editP+'</button>';
        h+='<button class="bsm bd" onclick="doDelD(this)" data-pid="'+esc(p.id)+'"><i data-lucide="trash-2" style="margin-right:4px"></i> '+t.del+'</button>';
        h+='</div></div></div>';
      });
    });
  } else {
    h+='<div class="empty"><div class="ei"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></div><p><strong>'+(isCW?'Palibe zolemba.':'No entries found.')+'</strong><br><span style="font-size:.75rem;color:var(--mid)">'+(isCW?'Yesani fyuluta ina kapena nthawi ina.':'Try a different filter or time range.')+'</span></p></div>';
  }
  h+='</div>';
  setView(_insBar()+h);
}

function doSrch(v){ srchQ=v; _doSrchDebounced(); }
let _srchTimer=null;
// The search box is rebuilt along with the list, so put the cursor back where the person was typing
// (otherwise the keyboard closes after every pause). Does nothing if they have moved to another screen.
function _doSrchDebounced(){
  clearTimeout(_srchTimer);
  _srchTimer=setTimeout(function(){
    if(!(tab==='hist'||(tab==='insights'&&insTab==='hist'))) return;
    const a=document.activeElement;
    const hadFocus=!!(a&&a.closest&&a.closest('.srch-wrap'));
    const pos=hadFocus&&typeof a.selectionStart==='number'?a.selectionStart:null;
    rHist();
    if(hadFocus){
      const inp=document.querySelector('#view .srch-wrap input');
      if(inp){ inp.focus(); try{ const p=pos===null?inp.value.length:pos; inp.setSelectionRange(p,p); }catch(e){} }
    }
  },180);
}
function isInTimeRange(dateStr){
  if(histTime==='all') return true;
  const d=new Date(dateStr), now=new Date();
  if(histTime==='week'){
    const wk=new Date(now); wk.setDate(now.getDate()-7);
    return d>=wk;
  }
  if(histTime==='month'){
    return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
  }
  if(histTime==='year'){
    return d.getFullYear()===now.getFullYear();
  }
  return true;
}
function setF(uid){ fUser=uid; rHist(); }
function setFU(el){ setF(el.dataset.uid); }
function doDel(id){
  const p=lPx.find(x=>x.id===id); if(!p)return;
  const label = esc(trName(p.item)) + (p.amount?' ('+MK(p.amount)+')':'');
  appConfirm(
    '<div style="text-align:center;padding:4px 0 8px">'
    +'<div style="width:48px;height:48px;border-radius:var(--cr);background:var(--neg-bg);display:flex;align-items:center;justify-content:center;margin:0 auto 10px">'
    +'<i data-lucide="trash-2" style="width:24px;height:24px;color:var(--neg)"></i></div>'
    +'<div style="font-size:.84rem;color:var(--mid);line-height:1.5">'+(lang==='cw'?'Chotsani':'Delete')+' <strong style="color:var(--ink)">'+label+'</strong>? '+(lang==='cw'?'Chidzasamutsidwa ku zochotsedwa ndipo mutha kuchibweza mkati mwa masiku 30.':'It will be moved to trash and recoverable for 30 days.')+'</div></div>',
    function(){
      db.collection('households').doc(hhId).collection('purchases').doc(id)
        .update({deletedAt:new Date().toISOString(),deleted:true})
        .then(function(){ _invalidateMemo(); toast((lang==='cw'?'Chasamutsidwa ku zochotsedwa.':'Moved to trash.'),'i'); })
        .catch(function(e){ toast((lang==='cw'?'Sitinathe kuchisamutsira ku zochotsedwa (':'Could not move to trash (')+(e&&e.code||'error')+'). Nothing was deleted.','e'); });
    }, null, true
  );
}

function openTrash(){
  premiumGate('trash', function(){
    const trashed=lPx.filter(function(p){return p.deleted;});
    let h='<div class="dh"></div><h3><i data-lucide="trash-2" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> Trash</h3>';
    if(!trashed.length){
      h+='<div class="empty" style="padding:14px 0"><div class="ei"><i data-lucide="check-circle" style="width:32px;height:32px;color:var(--g2)"></i></div><p>'+(lang==='cw'?'Palibe zochotsedwa':'Trash is empty')+'</p></div>';
    } else {
      h+='<p style="font-size:.72rem;color:var(--mid);margin-bottom:10px">Items are permanently deleted after 30 days.</p>';
      trashed.forEach(function(p){
        const u=uById(p.userId);
        const daysLeft=p.deletedAt?Math.max(0,30-Math.floor((Date.now()-new Date(p.deletedAt).getTime())/86400000)):30;
        h+='<div class="trash-item">';
        h+='<div class="trash-ico" style="background:'+((CAT_COLORS[catOf(p.item,p.cat)])||'#7B1FA2')+'1A">'+ico(p.item)+'</div>';
        h+='<div class="trash-info"><div class="trash-name">'+esc(trName(p.item))+'</div>';
        h+='<div class="trash-meta">'+p.date+' · '+esc(u.name)+' · '+daysLeft+'d left in trash</div></div>';
        h+='<div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end">';
        h+='<div class="trash-amt">'+MK(p.amount)+'</div>';
        h+='<div style="display:flex;gap:4px">';
        h+='<button class="bsm be" onclick="restoreTrashD(this)" data-pid="'+esc(p.id)+'" style="font-size:.72rem;padding:2px 8px">↩ Restore</button>';
        h+='<button class="bsm be" onclick="permaDeleteD(this)" data-pid="'+esc(p.id)+'" style="font-size:.72rem;padding:2px 8px;color:var(--neg);border-color:var(--neg)"><i data-lucide="x" style="width:10px;height:10px;vertical-align:middle;margin-right:2px"></i>'+(lang==='cw'?'Kwamuyaya':'Forever')+'</button>';
        h+='</div></div></div>';
      });
    }
    g('mb-u').innerHTML=h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-u')]}); initIcons(); openM('mv-u');
  });
}

function restoreTrash(id){
  db.collection('households').doc(hhId).collection('purchases').doc(id)
    .update({deletedAt:null,deleted:false})
    .then(function(){ closeM('mv-u'); toast((lang==='cw'?'Zabwezeretsedwa!':'Restored!'),'s'); })
    .catch(function(e){ toast((lang==='cw'?'Cholakwika: ':'Error: ')+e.message+'.','e'); });
}
function permaDeleteD(el){ permaDelete(el.dataset.pid); }
function permaDelete(id){
  const p=lPx.find(x=>x.id===id);
  const label=p?(esc(trName(p.item))+' ('+MK(p.amount)+')'):'this entry';
  appConfirm(
    (lang==='cw'
      ? 'Kuchotsa <b>'+label+'</b> nthawi zonse? Simungathe kuibwezeretsanso.'
      : 'Permanently delete <b>'+label+'</b>? This cannot be undone.'),
    function(){
      delPx(id).then(function(){
        toast(lang==='cw'?'Yachotsedwa nthawi zonse.':'Permanently deleted.','s');
        openTrash(); // re-render the trash list with this item gone
      }).catch(function(){
        // delPx already showed its own "Delete failed" toast -- just refresh
        // the list so it accurately reflects that the item is still there.
        openTrash();
      });
    },
    (lang==='cw'?'Inde, Chotsani Nthawi Zonse':'Yes, Delete Forever'),
    true
  );
}
function openEP(id){
  const p=lPx.find(x=>x.id===id); if(!p)return;
  const t=tx(), isI=p.type==='income';
  const pt=p.timestamp?new Date(p.timestamp).toTimeString().slice(0,5):'12:00';
  let h='<div class="dh"></div><h3><i data-lucide="pencil" style="width:14px;height:14px;vertical-align:-2px;margin-right:3px"></i> Edit Entry</h3><input type="hidden" id="ep-id" value="'+esc(id)+'"><input type="hidden" id="ep-uid" value="'+(p.userId||lCfg.users[0].id)+'">';
  h+='<div class="fsec"><label class="fl">'+t.selUser+'</label><div class="usel">'+lCfg.users.map(u=>'<div class="usb'+((p.userId||lCfg.users[0].id)===u.id?' on':'')+'" data-uid="'+esc(u.id)+'" onclick="epU(this,this.dataset.uid)"><div class="usav" style="background:'+sC(u.color)+'">'+esc(u.name[0])+'</div><div class="usnm">'+esc(u.name)+'</div></div>').join('')+'</div></div>';
  if(!isI){
    // Entries logged under a custom item or a bill (e.g. "ESCOM") aren't in lCfg.items; include the entry's own item so saving doesn't silently switch it.
    const _opts=lCfg.items.map(it=>it.name);
    if(p.item && _opts.indexOf(p.item)<0) _opts.unshift(p.item);
    h+='<div class="fsec"><label class="fl">'+(lang==='cw'?'Chinthu':'Item')+'</label><select class="fs" id="ep-item">'+_opts.map(n=>'<option value="'+esc(n)+'" '+(p.item===n?'selected':'')+'>'+esc(trName(n))+'</option>').join('')+'</select></div>';
  }
  h+='<div class="frow"><div class="fsec"><label class="fl">'+t.amount+'</label><input type="number" class="fi" id="ep-amt" value="'+esc(p.amount)+'" inputmode="numeric"></div></div>';
  h+='<div class="frow"><div class="fsec"><label class="fl">'+t.date+'</label><input type="date" class="fi" id="ep-date" value="'+esc(p.date)+'"></div><div class="fsec"><label class="fl">'+t.time+'</label><input type="time" class="fi" id="ep-time" value="'+esc(pt)+'"></div></div>';
  if(!isI)h+='<div class="frow"><div class="fsec"><label class="fl">'+t.qty+'</label><input type="number" class="fi" id="ep-qty" value="'+esc(p.qty||'')+'" inputmode="decimal"></div><div class="fsec"><label class="fl">'+t.unit+'</label><select class="fs" id="ep-unit">'+t.units.map(u=>'<option '+(p.unit===u?'selected':'')+'>'+u+'</option>').join('')+'</select></div></div>';
  h+='<div class="fsec"><label class="fl">'+t.notes+'</label><input type="text" class="fi" id="ep-notes" value="'+esc(p.notes||'')+'"></div>';
  h+='<div style="display:flex;gap:8px"><button class="btnG" style="flex:1" onclick="closeM(&quot;mv-ep&quot;)">'+t.cancel+'</button><button class="btnM" style="flex:2" onclick="saveEP('+isI+')"><i data-lucide="save" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+t.save+'</button></div>';
  g('mb-ep').innerHTML=h; initIcons(); openM('mv-ep');
}
function epU(el,uid){ g('ep-uid').value=uid; el.closest('.usel').querySelectorAll('.usb').forEach(b=>b.classList.remove('on')); el.classList.add('on'); }
function saveEP(isI){
  const id=val('ep-id'), a=Math.round(parseFloat(val('ep-amt'))*100)/100;
  if(!a||isNaN(a)||a<=0||a>99999999){toast((lang==='cw'?'Lowetsani ndalama yolondola.':'Enter a valid amount.'),'e');return;}
  const dStr=val('ep-date'), tStr=val('ep-time')||'12:00', ts=new Date(dStr+'T'+tStr).getTime();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dStr) || isNaN(ts)){toast((lang==='cw'?'Sankhani tsiku lolondola.':'Pick a valid date.'),'e');return;}
  const data={date:dStr,timestamp:ts,amount:a,notes:val('ep-notes'),userId:val('ep-uid')};
  if(!isI){
    const orig=lPx.find(x=>x.id===id);
    data.item=val('ep-item'); data.qty=val('ep-qty'); data.unit=val('ep-unit');
    // keep the stored category unless the item actually changed
    if(!orig || orig.item!==data.item) data.cat=catOf(data.item);
  }
  updPx(id,data); closeM('mv-ep'); toast(tx().updated);
}

// ===============================================
// 12. SUMMARY
// ===============================================

function toggleSumZero(){
  const el = g('sum-zero-items');
  const btn = g('sum-show-all-btn');
  const chev = g('sum-chevron');
  const isCW = lang === 'cw';
  if(!el) return;
  const isHidden = el.classList.contains('hide');
  if(isHidden){
    el.classList.remove('hide');
    if(chev) chev.setAttribute('data-lucide','chevron-up');
    if(btn){
      const zeroCount = lCfg.items.filter(it=>iSpent(it.name)<=0).length;
      btn.innerHTML = '<i data-lucide="chevron-up" style="width:14px;height:14px" id="sum-chevron"></i>'
        +(isCW?'Onetsani zochepa':'Show less');
    }
  } else {
    el.classList.add('hide');
    if(btn){
      const total = lCfg.items.length;
      btn.innerHTML = '<i data-lucide="chevron-down" style="width:14px;height:14px" id="sum-chevron"></i>'
        +(isCW?'Onani zinthu zonse '+total:'Show all '+total+' items');
    }
  }
  if(window.lucide) lucide.createIcons({nodes:[btn||document.body]});
}

function rSum(){
  const t=tx(), tB=lCfg.items.reduce((s,it)=>s+it.budget,0), tS=totSp();
  let h='<div class="page">'+monthNav('mnav');
  
  h+='<button class="magic-btn" id="ai-sum-btn" onclick="generateAiSummary()" style="background:linear-gradient(135deg,var(--p1),var(--p2));color:white;border:none;"><i data-lucide="zap" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i>'+(lang==='cw'?'Chidule cha AI':'Get AI Financial Review')+'</button>';
  h+='<div id="ai-sum-box" class="hide"></div>';
  
  // FIX 5: Modern donut chart + category breakdown cards
  const catSpend={};
  // Aggregate from the transactions themselves (not lCfg.items) so custom items and bill payments are included,
  // and the slices add up to totSp() just like History and the PDF report.
  lPx.forEach(p=>{ if(p.deleted||p.type==='income'||!isTM(p.date)) return; const c=catOf(p.item,p.cat); catSpend[c]=(catSpend[c]||0)+(Number(p.amount)||0); });
  const cats=Object.entries(catSpend).sort((a,b)=>b[1]-a[1]);
  h+='<div class="card" style="overflow:hidden"><div class="ch"><h2><i data-lucide="pie-chart" style="width:16px;height:16px;margin-right:6px;color:var(--p1-text)"></i> Category Breakdown</h2></div><div style="padding:16px">';
  if(cats.length&&tS>0){
    const PC={Food:'#7B1FA2',Household:'#1565C0',Personal:'#E91E63',Transport:'#E65100',Other:'#5D4037'};
    // Build donut SVG
    const R=54,cx=70,cy=70,circumference=2*Math.PI*R;
    let offset=0;
    let donutSegs='';
    cats.forEach(([cat,val_],i)=>{
      const pct=val_/tS;
      const dash=pct*circumference;
      const gap=circumference-dash;
      const clr=PC[cat]||PIE_COLORS[i%PIE_COLORS.length];
      // rotate so each segment starts after the previous
      const rotation=-90+(offset/circumference)*360;
      donutSegs+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${clr}" stroke-width="20"
        stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
        stroke-dashoffset="0"
        transform="rotate(${rotation.toFixed(2)} ${cx} ${cy})"
        style="transition:stroke-dasharray .6s cubic-bezier(.4,0,.2,1)"/>`;
      offset+=dash;
    });
    // Center stat
    h+='<div style="display:flex;flex-direction:column;align-items:center;margin-bottom:14px;max-width:100%;overflow:hidden">';
    h+=`<svg viewBox="0 0 140 140" width="100%" style="max-width:160px;height:auto;filter:drop-shadow(0 4px 18px rgba(0,0,0,.13))">
      ${donutSegs}
      <circle cx="${cx}" cy="${cy}" r="34" fill="var(--white)"/>
      <text x="${cx}" y="${cy-6}" text-anchor="middle" font-family="Hanken Grotesk" font-weight="800" font-size="12" fill="var(--ink)">${MKs(tS)}</text>
      <text x="${cx}" y="${cy+9}" text-anchor="middle" font-size="7.5" fill="var(--mid)">${lang==='cw'?'zonse zotuluka':'total spent'}</text>
    </svg>`;
    h+='</div>';
    // Category cards with animated progress bars
    h+='<div style="display:flex;flex-direction:column;gap:10px">';
    cats.forEach(([cat,val_],i)=>{
      const clr=PC[cat]||PIE_COLORS[i%PIE_COLORS.length];
      const pct=Math.round(val_/tS*100);
      const catIcon={Food:'utensils',Household:'home',Personal:'user',Transport:'bus',Other:'package'}[cat]||'circle';
      h+=`<div style="background:var(--mist);border-radius:var(--cr);padding:12px 13px">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
          <div style="width:34px;height:34px;border-radius:var(--cr-md);background:${clr}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-lucide="${catIcon}" style="width:16px;height:16px;color:${clr}"></i>
          </div>
          <div style="flex:1">
            <div style="font-size:.82rem;font-weight:700;color:var(--ink)">${t.cats[cat]||cat}</div>
            <div style="font-size:.72rem;color:var(--mid);margin-top:1px">${pct}% of spending</div>
          </div>
          <div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:.88rem;color:${clr}">${MK(val_)}</div>
        </div>
        <div style="height:6px;background:rgba(0,0,0,.07);border-radius:6px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${clr};border-radius:6px;transition:width .7s cubic-bezier(.4,0,.2,1)"></div>
        </div>
      </div>`;
    });
    h+='</div>';
  } else { h+='<div class="empty" style="padding:10px"><div class="ei"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div><p><strong>'+(lang==='cw'?'Palibe zolemba.':'No spending data yet.')+'</strong><br><span style="font-size:.75rem;color:var(--mid)">'+L('Log a few expenses to see your insights.','Lembani zogula zingapo kuti muone chidule.')+'</span>'+emptyAction(L('Log an expense','Lowetsani zogula'),'go(&quot;log&quot;)')+'</p></div>'; }
  h+='</div></div>';
  // Budget bars — split into active (spent > 0) and zero-spend
  const activeItems = lCfg.items.filter(it => iSpent(it.name) > 0);
  const zeroItems   = lCfg.items.filter(it => iSpent(it.name) <= 0);

  function renderSumItem(it){
    const sp=iSpent(it.name),st=statOf(sp,it.budget),pct=Math.min(sp/it.budget,1),rem=it.budget-sp;
    const mp={ok:['pfok','bok',t.ok],near:['pfnear','bnear',t.near],over:['pfover','bover',t.over],none:['pfok','bnone',t.none]};
    const arr=mp[st];
    return '<div class="sumi"><div class="sir1"><div class="sil"><span style="font-size:1.05rem">'+ico(it.name)+'</span><span class="siname">'+esc(trName(it.name))+'</span></div><span class="sibadge '+arr[1]+'">'+arr[2]+'</span></div><div class="sir2"><span>'+t.budget+': <strong>'+MK(it.budget)+'</strong></span><span>'+t.spent+': <strong>'+MK(sp)+'</strong></span><span style="color:'+(rem<0?'var(--r1)':'inherit')+'">'+t.left+': <strong>'+MK(rem)+'</strong></span></div><div class="pb"><div class="pf '+arr[0]+'" style="width:'+Math.min(pct*100,100)+'%"></div></div></div>';
  }

  h+='<div class="card" style="overflow:hidden"><div class="ch"><h2><i data-lucide="bar-chart-2" style="margin-right:5px;vertical-align:middle;color:var(--p1-text)"></i> '+t.sumTitle+'</h2></div>';

  if(activeItems.length === 0){
    // No spending yet — show a helpful empty state instead of 31 zero rows
    h += '<div class="empty" style="padding:16px"><div class="ei"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></div>'
      +'<p><strong>'+(lang==='cw'?'Palibe zogula m\'nthawi ino.':'No spending logged this period.')+'</strong><br>'
      +'<span style="font-size:.75rem;color:var(--mid)">'+(lang==='cw'?'Onjezerani zogula kuti muwone chidule.':'Log some expenses to see your budget breakdown.')+'</span>'+emptyAction(L('Log an expense','Lowetsani zogula'),'go(&quot;log&quot;)')+'</p></div>';
  } else {
    // Render only items with spending
    activeItems.forEach(it => { h += renderSumItem(it); });
    // "Show all" toggle for zero-spend items
    if(zeroItems.length > 0){
      h += '<div id="sum-zero-items" class="hide">';
      zeroItems.forEach(it => { h += renderSumItem(it); });
      h += '</div>';
      h += '<div style="text-align:center;padding:10px 0 6px">'
        +'<button id="sum-show-all-btn" onclick="toggleSumZero()" style="background:none;border:none;color:var(--p1-text);font-size:.76rem;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;display:inline-flex;align-items:center;gap:4px">'
        +'<i data-lucide="chevron-down" style="width:14px;height:14px" id="sum-chevron"></i>'
        +(lang==='cw'?'Onani zinthu zonse '+lCfg.items.length:'Show all '+lCfg.items.length+' items')
        +'</button></div>';
    }
  }

  h+='<div class="sumfoot"><div class="sfg"><div class="sfl">'+t.total+' '+t.budget+'</div><div class="sfv">'+MK(tB)+'</div></div><div class="sfg"><div class="sfl">'+t.total+' '+t.spent+'</div><div class="sfv">'+MK(tS)+'</div></div><div class="sfg"><div class="sfl">'+t.left+'</div><div class="sfv" style="color:'+(tS>tB?'#FF8A80':'#A5D6A7')+'">'+MK(tB-tS)+'</div></div></div></div>';
  if(lCfg.goals&&lCfg.goals.length){
    h+='<div class="card"><div class="ch"><h2><i data-lucide="target" style="margin-right:5px;vertical-align:middle;color:var(--a1)"></i> '+t.goals+'</h2></div><div class="cb">';
    lCfg.goals.forEach((gl,i)=>{
      const pct=Math.min(gl.saved/gl.target,1),done=gl.saved>=gl.target,mn=goalMonthlyNeed(gl),ml=goalMonthsLeft(gl.deadline);
      h+='<div class="goal-card" onclick="go(&quot;stg&quot;);stgOpenSection(&quot;goals&quot;)" style="cursor:pointer'+(done?';background:var(--pos-bg)':'')+'">';
      h+='<div class="goal-top"><div class="goal-name"'+(done?' style="color:var(--pos)"':'')+'>'+( done?'&#127881; ':'')+esc(gl.name)+'</div><div class="goal-pct"'+(done?' style="color:var(--pos)"':'')+'>'+Math.round(pct*100)+'%</div></div>';
      h+='<div class="goal-bar"><div class="goal-fill" style="width:'+Math.round(pct*100)+'%'+(done?';background:linear-gradient(90deg,#2E7D32,#43A047)':'')+'"></div></div>';
      h+='<div class="goal-meta"><span>'+MK(gl.saved)+' '+(lang==='cw'?'yosungidwa':'saved')+'</span><span>'+(lang==='cw'?'Cholinga':'Target')+': '+MK(gl.target)+'</span></div>';
      if(!done&&mn!==null)h+='<div style="margin-top:5px;font-size:.72rem;color:var(--gold-ink);font-weight:700"><i data-lucide="calendar" style="margin-right:3px;vertical-align:middle;color:var(--a1)"></i> '+MK(mn)+'/'+(lang==='cw'?'mwezi':'mo')+(ml?' · '+ml+(lang==='cw'?' miyezi':' mths'):'')+'</div>';
      h+='</div>';
    });
    h+='</div></div>';
  }
  h+='</div>';
  setView(_insBar()+h);
}

// ── Insights (merged History + Summary) ──
let insTab='summary'; // default sub-tab
// Summary / History tab bar. rHist and rSum add it themselves while the Insights tab is open, so a filter or
// search that redraws History directly keeps the bar.
function _insBar(){
  if(tab!=='insights') return '';
  const isCW=lang==='cw';
  const tabs=[
    {k:'summary',lbl:isCW?'<i data-lucide="pie-chart" style="width:14px;height:14px;vertical-align:middle;margin-right:4px"></i> Chidule':'<i data-lucide="pie-chart" style="width:14px;height:14px;vertical-align:middle;margin-right:4px"></i> Summary'},
    {k:'hist',   lbl:isCW?'<i data-lucide="history" style="width:14px;height:14px;vertical-align:middle;margin-right:4px"></i> Mbiri':'<i data-lucide="history" style="width:14px;height:14px;vertical-align:middle;margin-right:4px"></i> History'}
  ];
  return '<div class="ins-tabs">'+tabs.map(t=>'<button class="ins-tab'+(insTab===t.k?' on':'')+'" onclick="insTab=\''+t.k+'\';rInsights()">'+t.lbl+'</button>').join('')+'</div>';
}
function rInsights(){
  if(insTab==='hist') rHist(); else rSum();
}
function rMGI(it,i){
  const k=recKey(it,i);
  const sp=iSpent(it.name),st=statOf(sp,it.budget),pct=Math.min(sp/it.budget,1)*100;
  const pfcls=st==='over'?'pfover':st==='near'?'pfnear':'pfok';
  const bcls=st==='over'?'bover':st==='near'?'bnear':st==='ok'?'bok':'bnone';
  const t=tx(),btxt=st==='over'?t.over:st==='near'?t.near:st==='ok'?t.ok:t.none;
  const cc=CAT_COLORS[catOf(it.name)]||'#607D8B';
  return '<div class="mgi"><div class="mgi-ico" style="background:'+cc+'18">'+ico(it.name)+'</div><div class="mgi-info"><div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap"><span class="mgname">'+esc(trName(it.name))+'<span class="sibadge '+bcls+'" style="font-size:.72rem">'+btxt+'</span></div><div class="mgrow2"><span class="mgbudget">'+MK(it.budget)+'</span><span class="mgspent">'+t.spent+': '+MK(sp)+'</span></div><div class="mg-pb"><div class="mg-pf '+pfcls+'" style="width:'+pct+'%"></div></div></div><div class="mgi-acts"><button class="bsm be" onclick="openEB(\''+k+'\')" aria-label="'+t.editP+'"><i data-lucide="pencil" style="width:13px;height:13px"></i></button><button class="bsm bd" onclick="delIt(\''+k+'\')" aria-label="'+t.del+'"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button></div></div>';
}

function goalMonthsLeft(dl){ if(!dl)return null; const n=new Date(),d=new Date(dl+'T00:00:00'); const m=(d.getFullYear()-n.getFullYear())*12+(d.getMonth()-n.getMonth()); return Math.max(m,0); }
function goalMonthlyNeed(gl){ const ml=goalMonthsLeft(gl.deadline); if(ml===null||ml===0)return null; const rem=gl.target-gl.saved; if(rem<=0)return 0; return Math.ceil(rem/ml); }
const BILL_ICON_OPTS=[{key:'zap',label:'Electricity',dfltName:'ESCOM'},{key:'droplet',label:'Water',dfltName:'Water Board'},{key:'home',label:'Rent',dfltName:'Rent'},{key:'smartphone',label:'Airtime',dfltName:'Airtime'},{key:'wifi',label:'Internet',dfltName:'Internet'},{key:'tv',label:'DSTV',dfltName:'DSTV'},{key:'landmark',label:'Loan',dfltName:'Loan'},{key:'receipt',label:'Other',dfltName:''}];
function _billIconGridHtml(selected){
  return BILL_ICON_OPTS.map(function(o){
    const sel = o.key===selected;
    return '<button type="button" data-k="'+o.key+'" onclick="pickBillIcon(this.dataset.k)" style="display:flex;align-items:center;gap:5px;padding:6px 10px;border-radius:var(--cr-sm);border:1.5px solid '+(sel?'var(--p1)':'var(--border)')+';background:'+(sel?'var(--p1)':'var(--white)')+';color:'+(sel?'#fff':'var(--mid)')+';font-size:.72rem;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif"><i data-lucide="'+o.key+'" style="width:13px;height:13px"></i> '+o.label+'</button>';
  }).join('');
}
function pickBillIcon(key){
  window._billIconPick = key;
  const grid = g('bl-ic-grid');
  if(grid){ grid.innerHTML = _billIconGridHtml(key); if(window.lucide) lucide.createIcons({nodes:[grid]}); }
  // Suggest a name for this bill type, but only if the field is still empty or
  // still holds a previous auto-suggestion — never overwrite something the user typed.
  const nmEl = g('bl-nm');
  const opt = BILL_ICON_OPTS.find(o=>o.key===key);
  if(nmEl && opt && (nmEl.value.trim()==='' || nmEl.value===window._billNamePreset)){
    nmEl.value = opt.dfltName;
    window._billNamePreset = opt.dfltName;
  }
}
function openAddBill(editKey){
  premiumGate('bill_tracker', function(){
    const isEdit = typeof editKey === 'string' && editKey !== '';
    const ei = isEdit ? recIdx(lCfg.bills, editKey) : -1;
    if(isEdit && ei < 0){ _staleRec('bill'); return; }
    const existing = ei >= 0 ? lCfg.bills[ei] : null;
    const t=tx();
    window._billEditKey = isEdit ? editKey : null;
    window._billIconPick = (existing && existing.icon) || 'zap';
    window._billNamePreset = null;
    var h='<div class="dh"></div><h3><i data-lucide="alarm-clock" style="margin-right:6px;vertical-align:middle"></i>'+(isEdit?t.editBillT:t.addBill)+'</h3>';
    h+='<div class="fsec"><label class="fl">'+t.billName+'</label><input type="text" class="fi" id="bl-nm" placeholder="'+t.billNamePH+'" value="'+(existing?esc(existing.name):'')+'"></div>';
    h+='<div class="fsec"><label class="fl">'+t.iconLbl+'</label><div id="bl-ic-grid" style="display:flex;flex-wrap:wrap;gap:6px">'+_billIconGridHtml(window._billIconPick)+'</div></div>';
    h+='<div class="fsec"><label class="fl">'+t.amountMKLbl+'</label><input type="number" class="fi" id="bl-amt" inputmode="numeric" placeholder="0" value="'+esc(existing?existing.amount:'')+'"></div>';
    h+='<div class="fsec"><label class="fl">'+t.dueDateLbl+'</label><input type="date" class="fi" id="bl-due" value="'+esc(existing?existing.dueDate:'')+'"></div>';
    h+='<div style="display:flex;gap:8px"><button class="btnG" style="flex:1" onclick="closeM(&quot;mv-u&quot;)">'+t.cancel+'</button><button class="btnM" style="flex:2" onclick="saveBill()"><i data-lucide="save" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+t.save+'</button></div>';
    g('mb-u').innerHTML=h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-u')]}); initIcons(); openM('mv-u');
  });
}
function editBill(key){ openAddBill(key); }

function saveBill(){
  const t=tx();
  var nm=val('bl-nm').trim(), amt=parseFloat(val('bl-amt')), due=val('bl-due'), ic=window._billIconPick||'zap';
  if(!nm||!amt||!due){toast(t.fillAllFields,'e');return;}
  var cfg=JSON.parse(JSON.stringify(lCfg));
  if(!cfg.bills)cfg.bills=[];
  const key = window._billEditKey;
  const editing = typeof key === 'string' && key !== '';
  if(editing){
    const idx = recIdx(cfg.bills, key);       // looked up now, not when the dialog opened
    if(idx < 0){ window._billEditKey = null; closeM('mv-u'); _staleRec('bill'); return; }
    cfg.bills[idx] = Object.assign({}, cfg.bills[idx], {name:nm,amount:amt,dueDate:due,icon:ic});   // keeps its id
  } else {
    cfg.bills.push({name:nm,amount:amt,dueDate:due,icon:ic});   // saveCfg gives it an id
  }
  cfg.bills.sort(function(a,b){return a.dueDate.localeCompare(b.dueDate);});
  window._billEditKey = null;
  saveCfg(cfg); closeM('mv-u'); toast(editing?t.billUpdated:t.billAdded); _stgRefresh();
}

function delBill(key){
  const t=tx();
  const bi = recIdx(lCfg.bills, key);
  if(bi < 0){ _staleRec('bill'); return; }
  const bill = lCfg.bills[bi];
  const label = bill ? bill.name : (lang==='cw'?'bili iyi':'this bill');
  appConfirm(
    '<div style="text-align:center;padding:4px 0 8px">'
    +'<div style="width:48px;height:48px;border-radius:var(--cr);background:var(--neg-bg);display:flex;align-items:center;justify-content:center;margin:0 auto 10px">'
    +'<i data-lucide="trash-2" style="width:24px;height:24px;color:var(--neg)"></i></div>'
    +'<div style="font-size:.84rem;color:var(--mid);line-height:1.5">'+t.removeBillQ+' <strong style="color:var(--ink)">'+esc(label)+'</strong> '+t.removeBillQ2+'</div></div>',
    function(){
      var cfg=JSON.parse(JSON.stringify(lCfg));
      const i = recIdx(cfg.bills, key);       // looked up again now: the list may have changed while the dialog was open
      if(i < 0){ _staleRec('bill'); return; }
      cfg.bills.splice(i,1); saveCfg(cfg); toast(t.billRemoved,'i'); _stgRefresh();
    }, null, true
  );
}

// Adds one calendar month to a 'YYYY-MM-DD' date string, clamping to the
// last day of the target month when the original day doesn't exist there
// (e.g. 31 Jan -> 28/29 Feb, not an accidental roll into March).
function addMonthClamped(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth()+1);
  const daysInTarget = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  d.setDate(Math.min(day, daysInTarget));
  return localISO(d);
}

function markBillPaid(key){
  const t=tx();
  const bi = recIdx(lCfg.bills, key);
  if(bi < 0){ _staleRec('bill'); return; }
  const bill = lCfg.bills[bi];
  appConfirm(
    '<div style="text-align:center;padding:4px 0 8px">'
    +'<div style="width:48px;height:48px;border-radius:var(--cr);background:var(--pos-bg);display:flex;align-items:center;justify-content:center;margin:0 auto 10px">'
    +'<i data-lucide="check-circle" style="width:24px;height:24px;color:var(--pos)"></i></div>'
    +'<div style="font-size:.84rem;color:var(--ink);font-weight:700;margin-bottom:4px">'+esc(bill.name)+' -- '+t.confirmMarkPaid+'</div>'
    +'<div style="font-size:.74rem;color:var(--mid);line-height:1.5">'+t.confirmMarkPaidSub+'</div></div>',
    function(){
      // Re-find the bill by its id: its position may have changed while the dialog was open.
      const idx=recIdx(lCfg.bills, key);
      const amt=Number(bill.amount);
      if(idx<0){ toast(lang==='cw'?'Bilu iyi yasintha. Yesaninso.':'This bill changed. Please try again.','e'); _stgRefresh(); return; }
      if(!amt||amt<=0){ toast(lang==='cw'?'Ndalama ya bilu ndi yolakwika.':'This bill has no valid amount.','e'); return; }
      const prevCfg=lCfg;
      const cfg=JSON.parse(JSON.stringify(lCfg));
      cfg.bills[idx]={...cfg.bills[idx],dueDate:addMonthClamped(bill.dueDate)};
      cfg.bills.sort(function(a,b){return a.dueDate.localeCompare(b.dueDate);});
      // ONE atomic batch: the expense entry and the rolled due date succeed or fail together
      // (they used to be two separate writes, so a failure could log the expense without rolling the date, or the reverse).
      const hhRef=db.collection('households').doc(hhId);
      const batch=db.batch();
      batch.set(hhRef.collection('purchases').doc(),{item:bill.name,date:today(),timestamp:Date.now(),amount:Math.round(amt*100)/100,qty:'',unit:'',notes:t.billTracker,userId:actU().id,type:'expense',cat:'Other',createdAt:firebase.firestore.FieldValue.serverTimestamp()});
      batch.update(hhRef,{'config.bills':cfg.bills});
      lCfg=cfg; _invalidateMemo(); setDot('spin');
      batch.commit().then(function(){ setDot(''); toast(t.billPaidToast,'s'); })
        .catch(function(e){ lCfg=prevCfg; _invalidateMemo(); setDot('off'); toast((lang==='cw'?'Sitinathe kulemba kuti yalipidwa (':'Could not mark as paid (')+(e&&e.code||'error')+'). Nothing was changed.','e'); render(); });
      _stgRefresh();
    }, null, false
  );
}

// ── Monthly budget cap field (one component, used in Profile and in Items & Budgets) ──
const CAP_MAX = 99999999;
function _capFmt(n){ return Number(n||0).toLocaleString('en-US'); }
function budgetCapField(id){
  const cw=lang==='cw';
  return '<span class="cap-field"><span class="cap-mk" aria-hidden="true">MK</span>'
    +'<input type="text" inputmode="numeric" autocomplete="off" class="cap-inp" id="'+id+'" value="'+esc(_capFmt(lCfg.overallBudget))+'"'
    +' aria-label="'+(cw?'Malire a Mwezi (MK)':'Monthly budget cap (MK)')+'" aria-describedby="'+id+'-st"'
    +' oninput="capInput(this)" onchange="commitBudgetCap(this)" onkeydown="if(event.key===&quot;Enter&quot;){this.blur();}">'
    +'<span class="cap-st" id="'+id+'-st" role="status" aria-live="polite"></span></span>';
}
// Shows thousands separators while typing; only digits are kept.
function capInput(el){
  const digits=el.value.replace(/[^\d]/g,'').slice(0,8);
  el.value=digits?_capFmt(parseInt(digits,10)):'';
}
function _capStatus(el,txt,kind){
  const st=document.getElementById(el.id+'-st'); if(!st) return;
  st.textContent=txt||''; st.className='cap-st'+(kind?' '+kind:'');
  clearTimeout(st._t); if(kind==='ok') st._t=setTimeout(function(){ st.textContent=''; st.className='cap-st'; },2500);
}
function commitBudgetCap(el){
  const cw=lang==='cw';
  const n=parseInt(el.value.replace(/[^\d]/g,''),10);
  const prev=lCfg.overallBudget;
  if(!n||isNaN(n)||n<=0||n>CAP_MAX){
    toast(cw?'Lowetsani ndalama yolondola':'Enter a valid budget','e');
    el.value=_capFmt(prev); _capStatus(el,cw?'Sizinasungidwe':'Not saved','err'); return;
  }
  el.value=_capFmt(n);
  if(n===prev) return;
  const offline = typeof navigator!=='undefined' && navigator.onLine===false;
  _capStatus(el, offline?(cw?'Zidzasungidwa mukalumikizidwa':'Will sync when online'):(cw?'Kusunga…':'Saving…'), 'busy');
  const id=el.id;
  Promise.resolve(saveCfg({...lCfg,overallBudget:n})).then(function(ok){
    const cur=document.getElementById(id); if(!cur) return;
    if(ok===false){ cur.value=_capFmt(lCfg.overallBudget); _capStatus(cur,cw?'Sizinasungidwe':'Not saved','err'); }
    else _capStatus(cur,cw?'Zasungidwa':'Saved','ok');
  });
}
function toggleSalaryPanel(){ _sdPanelOpen = !_sdPanelOpen; _stgRefresh(); }
function updSalaryDay(v){
  if(v===''||v===null||v===undefined||v==='0'){
    saveCfg({...lCfg,salaryDay:0});
    toast((lang==='cw'?'Yabwerera ku mwezi wa kalendala.':'Reset to calendar month.'),'s'); render(); return;
  }
  const n=parseInt(v,10);
  if(isNaN(n)||n<1||n>28){ toast((lang==='cw'?'Lowetsani tsiku pakati pa 1 ndi 28.':'Enter a day between 1 and 28.'),'e'); return; }
  saveCfg({...lCfg,salaryDay:n});
  toast((lang==='cw'?'Nthawi ya malipiro yakhazikitsidwa: ':'Salary period set: ')+budgetPeriodLabel()+'.','s'); render();
}
// Shown when the record a button pointed at is gone or was replaced (another device edited the list meanwhile).
function _staleRec(kind){
  const cw=lang==='cw';
  toast(kind==='bill'?(cw?'Bilu iyi yasintha. Yesaninso.':'This bill changed. Please try again.')
       :kind==='goal'?(cw?'Cholinga ichi chasintha. Yesaninso.':'This goal changed. Please try again.')
       :(cw?'Chinthu ichi chasintha. Yesaninso.':'This item changed. Please try again.'),'e');
  _stgRefresh();
}
function delIt(key){
  const i0=recIdx(lCfg.items,key);
  if(i0<0){ _staleRec('item'); return; }
  appConfirm(tx().confirmDelItem+' "'+esc(lCfg.items[i0].name)+'"?', function(){
    const cfg=JSON.parse(JSON.stringify(lCfg));
    const i=recIdx(cfg.items,key);          // looked up again now: the list may have changed while the dialog was open
    if(i<0){ _staleRec('item'); return; }
    cfg.items.splice(i,1); saveCfg(cfg); toast(tx().itemDeleted); _stgRefresh();
  }, null, true);
}
function openAddM(){
  const t=tx();
  let h='<div class="dh"></div><h3><i data-lucide="user" style="margin-right:5px;vertical-align:middle;color:var(--p1-text)"></i> '+t.addMember+'</h3><div class="fsec"><label class="fl">'+t.memberName+'</label><input type="text" class="fi" id="nm-nm" placeholder="e.g. Son, Helper..."></div><div class="fsec"><label class="fl">Colour</label><div class="cpick" id="cp-new">'+MEMBER_COLORS.map((c,i)=>'<div class="cp'+(i===0?' on':'')+'" style="background:'+c+'" onclick="pickC(this,\'cp-new\',\'nm-col\')"></div>').join('')+'</div><input type="hidden" id="nm-col" value="'+MEMBER_COLORS[0]+'"></div><div style="display:flex;gap:8px"><button class="btnG" style="flex:1" onclick="closeM(\'mv-e\')">'+t.cancel+'</button><button class="btnM" style="flex:2" onclick="saveMember()"><i data-lucide="save" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+t.add+'</button></div>';
  g('mb-e').innerHTML=h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-e')]}); initIcons(); openM('mv-e');
}
function pickC(el,pid,hid){ g(hid).value=sC(el.style.background); document.querySelectorAll('#'+pid+' .cp').forEach(cp=>cp.classList.remove('on')); el.classList.add('on'); }
function saveMember(){ const nm=val('nm-nm').trim(); if(!nm){toast(lang==='cw'?'Lembani dzina.':'Enter a name.','e');return;} const cfg=JSON.parse(JSON.stringify(lCfg)); cfg.users.push({id:'u'+Date.now(),name:nm,color:val('nm-col')||'#7B1FA2'}); saveCfg(cfg); closeM('mv-e'); toast(tx().nameUpdated); _stgRefresh(); }
function openEU(i){ const u=lCfg.users[i],t=tx(); let h='<div class="dh"></div><h3><i data-lucide="user" style="margin-right:5px;vertical-align:middle;color:var(--p1-text)"></i> '+t.editUser+'</h3><div class="fsec"><label class="fl">Name</label><input type="text" class="fi" id="eu-nm" value="'+esc(u.name)+'"></div><div class="fsec"><label class="fl">Colour</label><div class="cpick" id="cp-edit">'+MEMBER_COLORS.map(c=>'<div class="cp'+(sC(u.color).toLowerCase()===String(c).toLowerCase()?' on':'')+'" style="background:'+c+'" onclick="pickC(this,\'cp-edit\',\'eu-col\')"></div>').join('')+'</div><input type="hidden" id="eu-col" value="'+sC(u.color)+'"></div><div style="display:flex;gap:8px"><button class="btnG" style="flex:1" onclick="closeM(\'mv-e\')">'+t.cancel+'</button><button class="btnM" style="flex:2" onclick="svEU('+i+')"><i data-lucide="save" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+t.save+'</button></div>'; g('mb-e').innerHTML=h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-e')]}); initIcons(); openM('mv-e'); }
function svEU(i){ const nm=val('eu-nm').trim(); if(!nm)return; const cfg=JSON.parse(JSON.stringify(lCfg)); cfg.users[i].name=nm; cfg.users[i].color=val('eu-col')||cfg.users[i].color; saveCfg(cfg); closeM('mv-e'); updatePill(); toast(tx().nameUpdated); _stgRefresh(); }
function delMember(i){
  if(!curUser || !lHHDoc || curUser.uid !== lHHDoc.owner){
    toast(lang==='cw'?'Ndi mwini nyumba yekha amene angachotse membala.':'Only the household owner can remove a member.','e');
    return;
  }
  const member = lCfg.users[i];
  appConfirm(tx().confirmDelMember, function(){
    const cfg=JSON.parse(JSON.stringify(lCfg));
    cfg.users.splice(i,1);
    saveCfg(cfg);
    // Members added via join-request approval have their real Firebase auth uid
    // as their `id` and are present in the household's memberUids. Splicing them
    // out of cfg.users only removed their display entry -- they could still read
    // and write to the household indefinitely. Revoke actual access here too, so
    // they'd need to be re-approved to use the household again. Local-only profile
    // members (e.g. "Person 2" added via +Add Member, no separate login) won't be
    // in memberUids, so this is a no-op for them -- and the owner is never touched.
    if(member && hhId && lHHDoc && lHHDoc.memberUids && lHHDoc.memberUids.includes(member.id) && member.id!==lHHDoc.owner){
      db.collection('households').doc(hhId).update({
        memberUids: firebase.firestore.FieldValue.arrayRemove(member.id)
      }).catch(function(e){ toast((lang==='cw'?'Kuchotsa chilolezo kwalephera: ':'Access revoke failed: ')+(e&&e.code||'error')+'.','e'); });
    }
    toast(tx().deleted);
    _stgRefresh();
  }, null, true);
}
function openEB(key){ const i=recIdx(lCfg.items,key); if(i<0){ _staleRec('item'); return; } const it=lCfg.items[i],t=tx(); g('mb-e').innerHTML='<div class="dh"></div><h3>'+ico(it.name)+' '+esc(trName(it.name))+'</h3><input type="hidden" id="eb-i" value="'+esc(key)+'"><div class="fsec"><label class="fl">'+t.mbudget+'</label><input type="number" class="fi" id="eb-v" value="'+it.budget+'" inputmode="numeric"></div><div style="display:flex;gap:8px"><button class="btnG" style="flex:1" onclick="closeM(&quot;mv-e&quot;)">'+t.cancel+'</button><button class="btnM" style="flex:2" onclick="svEB()"><i data-lucide="save" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+t.save+'</button></div>'; if(window.lucide)lucide.createIcons({nodes:[g('mb-e')]}); openM('mv-e'); }
function svEB(){ const key=val('eb-i'),v=parseFloat(val('eb-v')); if(!v||isNaN(v)||v<=0||v>99999999){toast(lang==='cw'?'Lowetsani bajeti yolondola':'Enter a valid budget','e');return;} const cfg=JSON.parse(JSON.stringify(lCfg)); const i=recIdx(cfg.items,key); if(i<0){ closeM('mv-e'); _staleRec('item'); return; } cfg.items[i].budget=v;saveCfg(cfg);toast(tx().budgetUpdated); closeM('mv-e'); _stgRefresh(); }
function openAddGoal(){
  const t=tx(), isCW=lang==='cw';
  const minDate=new Date(); minDate.setDate(minDate.getDate()+7);
  const minDateStr=localISO(minDate);
  let h='<div class="dh"></div>';
  h+='<h3><i data-lucide="target" style="margin-right:5px;vertical-align:middle;color:var(--a1)"></i> '+t.addGoal+'</h3>';
  h+='<div class="fsec"><label class="fl" for="g-nm">'+t.goalName+'</label>';
  h+='<input type="text" class="fi" id="g-nm" placeholder="'+(lang==='cw'?'Mwachitsanzo: TV yatsopano, Ndalama za sukulu...':'e.g. New TV, School Fees...')+'"></div>';
  h+='<div class="fsec"><label class="fl" for="g-tg">'+t.goalTarget+'</label>';
  h+='<input type="number" class="fi" id="g-tg" inputmode="numeric" placeholder="e.g. 150000"></div>';
  h+='<div class="fsec"><label class="fl" for="g-sv">'+t.goalSaved+' (optional)</label>';
  h+='<input type="number" class="fi" id="g-sv" inputmode="numeric" placeholder="0"></div>';
  h+='<div class="fsec"><label class="fl" for="g-dl">'+(isCW?'Tsiku Lomaliza (Ngati mukufuna)':'Target Deadline (optional)')+'</label>';
  h+='<input type="date" class="fi" id="g-dl" min="'+minDateStr+'"></div>';
  h+='<div style="display:flex;gap:8px">';
  h+='<button class="btnG" style="flex:1" onclick="closeM(&quot;mv-gl&quot;)">'+t.cancel+'</button>';
  h+='<button class="btnM" style="flex:2" onclick="saveGoal()"><i data-lucide="save" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+t.add+'</button></div>';
  g('mb-gl').innerHTML=h;
  if(window.lucide) lucide.createIcons({nodes:[g('mb-gl')]});
  openM('mv-gl');
}
function saveGoal(){
  const nm=val('g-nm').trim(), tg=parseFloat(val('g-tg')), sv=parseFloat(val('g-sv'))||0, dl=val('g-dl')||'';
  const isCW=lang==='cw';
  if(!nm){toast(isCW?'Lowetsani dzina la cholinga':'Enter a goal name','e');return;}
  if(!tg||isNaN(tg)||tg<=0||tg>99999999){toast(isCW?'Lowetsani ndalama yolondola':'Enter a valid target amount','e');return;}
  if(sv<0||sv>tg){toast(isCW?'Ndalama yosungidwa siyenera kupitirira cholinga':'Saved amount cannot exceed target','e');return;}
  const cfg=JSON.parse(JSON.stringify(lCfg));
  if(!cfg.goals) cfg.goals=[];
  const goal={name:nm,target:tg,saved:sv};
  if(dl) goal.deadline=dl;
  cfg.goals.push(goal);
  saveCfg(cfg); closeM('mv-gl'); toast((lang==='cw'?'Cholinga chaonjezedwa!':'Goal added!')); _stgRefresh();
}
function openTopUp(key){ const gi=recIdx(lCfg.goals,key); if(gi<0){ _staleRec('goal'); return; } const gl=lCfg.goals[gi],t=tx(); g('mb-gl').innerHTML='<div class="dh"></div><h3><i data-lucide="arrow-up" style="width:15px;height:15px;vertical-align:-2px;margin-right:4px;color:var(--pos)"></i>'+t.topup+': '+esc(gl.name)+'</h3><div class="fsec" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--mid);margin-bottom:6px"><span>'+(lang==='cw'?'Yosungidwa':'Saved')+': <strong>'+MK(gl.saved)+'</strong></span><span>'+(lang==='cw'?'Cholinga':'Target')+': <strong>'+MK(gl.target)+'</strong></span></div><label class="fl">'+(lang==='cw'?'Ndalama Yowonjezera (MK)':'Amount to Add (MK)')+'</label><input type="number" class="fi" id="tu-amt" inputmode="numeric" placeholder="0"></div><div style="display:flex;gap:8px"><button class="btnG" style="flex:1" onclick="closeM(&quot;mv-gl&quot;)">'+(lang==='cw'?'Siyani':t.cancel)+'</button><button class="btnM" style="flex:2;background:linear-gradient(135deg,#1B5E20,#388E3C)" onclick="topUpGoal(\''+key+'\')"><i data-lucide="save" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+t.topup+'</button></div>'; if(window.lucide)lucide.createIcons({nodes:[g('mb-gl')]}); openM('mv-gl'); }
function topUpGoal(key){
  const amt=parseFloat(val('tu-amt'));
  if(!amt||amt<=0){toast(lang==='cw'?'Lowetsani ndalama':'Enter an amount','e');return;}
  const cfg=JSON.parse(JSON.stringify(lCfg));
  const gi=recIdx(cfg.goals,key); if(gi<0){ closeM('mv-gl'); _staleRec('goal'); return; }
  const gl=cfg.goals[gi];
  const actual=Math.min(amt, gl.target-gl.saved);
  gl.saved=Math.min(gl.saved+amt,gl.target);
  saveCfg(cfg); closeM('mv-gl');
  if(gl.saved>=gl.target) toast(lang==='cw'?'Cholinga chakwaniritsidwa: '+gl.name+'!':'Goal complete! '+gl.name+' reached!','s');
  else toast(lang==='cw'?'Cholinga chasinthidwa! Ndalama '+MK(actual)+' yawonjezedwa.':'Goal updated! '+MK(actual)+' added.','s');
  _stgRefresh();
}
function openWithdraw(key){
  const wi=recIdx(lCfg.goals,key); if(wi<0){ _staleRec('goal'); return; }
  const gl=lCfg.goals[wi];
  const isCW=lang==='cw';
  g('mb-gl').innerHTML='<div class="dh"></div><h3>&#8595; '+(isCW?'Tengani Ndalama':'Withdraw')+': '+esc(gl.name)+'</h3>'
    +'<div class="fsec" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:.78rem;color:var(--mid);margin-bottom:6px"><span>'+(isCW?'Yosungidwa':'Saved')+': <strong>'+MK(gl.saved)+'</strong></span><span>'+(isCW?'Cholinga':'Target')+': <strong>'+MK(gl.target)+'</strong></span></div>'
    +'<label class="fl">'+(isCW?'Ndalama Yochotsedwa (MK)':'Amount to Withdraw (MK)')+'</label>'
    +'<input type="number" class="fi" id="wd-amt" inputmode="numeric" placeholder="0"></div>'
    +'<div style="display:flex;gap:8px"><button class="btnG" style="flex:1" onclick="closeM(\'mv-gl\')">'+(isCW?'Letsani':tx().cancel)+'</button>'
    +'<button class="btnM" style="flex:2;background:linear-gradient(135deg,#B71C1C,#E53935)" onclick="doWithdraw(\''+key+'\')"><i data-lucide="arrow-down-circle" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+(isCW?'Tengani':'Withdraw')+'</button></div>';
  openM('mv-gl');
}
function doWithdraw(key){
  const amt=parseFloat(val('wd-amt')); if(!amt||amt<=0){toast(lang==='cw'?'Lowetsani ndalama':'Enter an amount','e');return;}
  const wi=recIdx(lCfg.goals,key); if(wi<0){ closeM('mv-gl'); _staleRec('goal'); return; }
  if(amt>lCfg.goals[wi].saved){toast(lang==='cw'?'Yapitirira zomwe mwasungira':'Exceeds saved amount','e');return;}
  const cfg=JSON.parse(JSON.stringify(lCfg));
  const i=recIdx(cfg.goals,key);
  cfg.goals[i].saved=Math.max(cfg.goals[i].saved-amt,0);
  saveCfg(cfg); closeM('mv-gl'); toast(lang==='cw'?'Ndalama yatengedwa':'Withdrawn'); _stgRefresh();
}
function delGoal(key){
  if(recIdx(lCfg.goals,key)<0){ _staleRec('goal'); return; }
  appConfirm(lang==='cw'?'Mukufuna kuchotsa cholinga ichi?':'Delete this goal?', function(){
    const cfg=JSON.parse(JSON.stringify(lCfg));
    const i=recIdx(cfg.goals,key);
    if(i<0){ _staleRec('goal'); return; }
    cfg.goals.splice(i,1); saveCfg(cfg); _stgRefresh();
  }, null, true);
}

