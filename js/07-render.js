// ===============================================
// 8. NAV, LANG, RENDER
// ===============================================

function go(t){ 
  tab=t; srchQ=''; logType='expense'; 
  if(t!=='stg'){ _stgSection=null; _stopJoinReqListener(); }
  // Reset month view when navigating to Home so users always see current month
  if(t==='home'){ viewMonth=null; _invalidateMemo(); }
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('on')); 
  const nb=g('nb-'+t)||(t==='hist'||t==='sum'?g('nb-insights'):null); 
  if(nb)nb.classList.add('on'); 
  render(); 
  const v=g('view'); if(v)v.scrollTop=0; 
}
// ── Recurring items: auto-add on new budget period ──
function checkAndAddRecurring(){
  if(!hhId||!lPx||!lCfg) return;
  const KEY='nb_recur_last_'+(hhId||'anon');
  const realNow=curM(); // always use the ACTUAL current month, never the viewed month
  const p=getBudgetPeriod(realNow);
  const periodStart=p.startY+'-'+String(p.startM+1).padStart(2,'0')+'-'+String(p.startD).padStart(2,'0');
  if(localStorage.getItem(KEY)===periodStart) return; // already ran this period
  if(today()<periodStart) return; // period hasn't started yet
  // Find recurring expense entries NOT in current period (from previous)
  const prevRecurring=lPx.filter(px=>px.recurring&&px.type!=='income'&&!isTM(px.date,realNow));
  if(!prevRecurring.length){ localStorage.setItem(KEY,periodStart); return; }
  // One entry per unique item name (most recent)
  const seen=new Set(), toAdd=[];
  prevRecurring.forEach(px=>{ if(!seen.has(px.item)){ seen.add(px.item); toAdd.push(px); } });
  // Skip any already added this period
  const actuallyAdd=toAdd.filter(px=>!lPx.some(e=>e.item===px.item&&e.recurring&&isTM(e.date,realNow)));
  if(!actuallyAdd.length){ localStorage.setItem(KEY,periodStart); return; }
  let ts=Date.now();
  const uid=actU().id;
  localStorage.setItem(KEY,periodStart);
  // Deterministic document ids (period + item) make this idempotent across devices: if a second device runs it
  // at the same time it writes the same documents instead of adding duplicates.
  const _h=_hashStr;
  Promise.all(actuallyAdd.map(px=>
    addPx({item:px.item,date:today(),timestamp:ts++,amount:Number(px.amount)||0,
           qty:px.qty||'',unit:px.unit||'',notes:'(auto-recurring)',userId:uid,type:'expense',cat:px.cat||catOf(px.item),recurring:true},
          {docId:'recur_'+periodStart+'_'+_h(String(px.item)), quiet:true})
  )).then(function(r){
    const n=r.filter(Boolean).length;
    if(!n) return;
    toast(lang==='cw'
      ? n+' zinthu zofanananso zaonjezedwa kwa nthawi ino'
      : n+' recurring item'+(n>1?'s':'')+' added for this period',
    's');
  });
}

function render(){
  // When the chat tab is active and a conversation is open, avoid a full rChat() rebuild
  // (which would wipe the DOM and re-fetch async). Just refresh the bubbles.
  if(tab==='chat' && activeChatId && g('chat-msgs')){
    renderBubbles(); return;
  }
  ({home:rHome,log:rLog,hist:rHist,sum:rSum,insights:rInsights,stg:rStg,chat:rChat,chip:rChip})[tab]?.();
}
function toggleLang(){
  if(lang==='en'){ toast('Chichewa is not available right now.','i'); return; } // TEMP -- pause, see note near `let lang` above
  lang=lang==='en'?'cw':'en'; localStorage.setItem('nb_lang',lang); const btn=g('lbtn'); if(btn)btn.textContent=lang==='en'?'CW':'EN'; applyLang(); render();
}
function applyLang(){
  const t=tx();
  const apt=g('apt'); if(apt)apt.textContent=t.appTitle;
  const aps=g('aps'); if(aps)aps.textContent=t.appSub;
  const _ab=g('auth-sub'); if(_ab)_ab.textContent=t.appSub;
  [['nl-h',t.home],['nl-l',t.log],['nl-ins',lang==='cw'?'Zochitika':'Insights'],['nl-ch',lang==='cw'?'Bajeti AI':'Bajeti AI'],['nl-st',lang==='cw'?'Akaunti':'Profile']].forEach(([id,v])=>{const el=g(id);if(el)el.textContent=v;});
  updatePill();
}
function updatePill(){
  const u=actU(); if(!u)return;
  // Avatar removed from topbar -- only update name pill now
  const nm=g('cur-nm');
  if(nm)nm.textContent=u.name;
  const apt=g('apt'),aps=g('aps');
  if(apt)apt.textContent=tx().appTitle;
  if(aps)aps.textContent=tx().appSub;
}

// ── 6-Month Spending Trend ──
function getLast6MonthsData(){
  const cur=curM(); // the budget period containing today, so the chart agrees with the hero numbers
  const months=[];
  for(let i=5;i>=0;i--){
    let m=cur.m-i, y=cur.y;
    while(m<0){m+=12;y--;}
    const prefix=y+'-'+String(m+1).padStart(2,'0');
    const monthPx=lPx.filter(p=>p.date&&!p.deleted&&isTM(p.date,{m:m,y:y}));
    const sp=monthPx.filter(p=>p.type!=='income').reduce((s,p)=>s+Number(p.amount||0),0);
    const inc=monthPx.filter(p=>p.type==='income').reduce((s,p)=>s+Number(p.amount||0),0);
    months.push({label:tx().months[m],month:m,year:y,spent:sp,income:inc,prefix});
  }
  return months;
}

function getSpendingStreak(){
  const bg=lCfg.overallBudget;
  if(!bg||!lPx.length) return 0;
  const weeklyBudget=bg/4.33;
  let streak=0;
  const now=new Date();
  for(let w=0;w<12;w++){
    const wEnd=new Date(now); wEnd.setDate(now.getDate()-w*7);
    const wStart=new Date(wEnd); wStart.setDate(wEnd.getDate()-7);
    const wStr1=localISO(wStart);
    const wStr2=localISO(wEnd);
    // half-open (start, end] so a boundary day isn't counted in two weeks
    const wSpent=lPx.filter(function(p){return p.date&&p.date>wStr1&&p.date<=wStr2&&p.type!=='income'&&!p.deleted;})
      .reduce(function(s,p){return s+Number(p.amount||0);},0);
    if(wSpent<weeklyBudget&&wSpent>0) streak++;
    else if(w>0) break;
    else if(wSpent>0) break; // current week already over budget: no streak
    else continue;
  }
  return streak;
}

function renderTrendChart(months){
  if(!months||!months.length) return '';
  const isCW=lang==='cw';
  // Use max of both spent AND income to scale the chart
  const maxVal=Math.max.apply(null,months.map(function(m){return Math.max(m.spent,m.income||0);}));
  if(maxVal<=0) return '';
  const now=new Date();
  const bg=lCfg.overallBudget||0;
  const BAR_H=104; // chart column height in px
  let h='<div class="card" style="overflow:hidden">';
  h+='<div class="ch">';
  h+='<h2><i data-lucide="trending-up" style="width:16px;height:16px;margin-right:6px;color:var(--p1)"></i>';
  h+=(isCW?'Kuona kwa Miyezi 6':'6-Month Overview')+'</h2>';
  // Inline legend — Spent + Income
  h+='<div style="display:flex;gap:8px;align-items:center">';
  h+='<span style="display:inline-flex;align-items:center;gap:3px;font-size:.58rem;font-weight:700;color:var(--mid)">';
  h+='<span style="width:8px;height:8px;border-radius:2px;background:var(--p1);display:inline-block"></span>'+(isCW?'Zogula':'Spent')+'</span>';
  h+='<span style="display:inline-flex;align-items:center;gap:3px;font-size:.58rem;font-weight:700;color:var(--mid)">';
  h+='<span style="width:8px;height:8px;border-radius:2px;background:#2E7D32;display:inline-block"></span>'+(isCW?'Malipiro':'Income')+'</span>';
  h+='</div></div>';
  h+='<div style="padding:12px 14px 10px">';
  // Chart area with budget reference line
  h+='<div style="position:relative;height:'+BAR_H+'px;margin-bottom:8px">';
  // Dashed budget reference line
  if(bg>0){
    const budgetLineH=Math.min(Math.round(bg/maxVal*BAR_H),BAR_H-4);
    h+='<div style="position:absolute;left:0;right:0;bottom:'+budgetLineH+'px;border-top:1.5px dashed rgba(123,31,162,.35);z-index:1;pointer-events:none">';
    h+='<span style="position:absolute;right:0;top:-9px;font-size:.5rem;font-weight:800;color:var(--p1);opacity:.7;background:var(--surface);padding:0 3px;border-radius:3px">'+(isCW?'Bajeti':'Budget')+'</span>';
    h+='</div>';
  }
  // Bars row
  h+='<div style="display:flex;align-items:flex-end;gap:3px;height:'+BAR_H+'px;position:relative;z-index:2">';
  months.forEach(function(m){
    const _cp=curM();
    const isThis=m.month===_cp.m&&m.year===_cp.y;
    const isOver=bg>0&&m.spent>bg;
    const spH=maxVal>0?Math.max(Math.round(m.spent/maxVal*BAR_H),m.spent>0?3:0):0;
    const incH=maxVal>0?Math.max(Math.round((m.income||0)/maxVal*BAR_H),(m.income||0)>0?3:0):0;
    const spColor=isThis?(isOver?'linear-gradient(180deg,#FF5252,#C62828)':'linear-gradient(180deg,var(--p2),var(--p1))'):(isOver?'rgba(198,40,40,.4)':'rgba(123,31,162,.22)');
    const spShadow=isThis&&!isOver?';box-shadow:0 2px 8px rgba(123,31,162,.35)':'';
    const incColor=isThis?'#2E7D32':'rgba(46,125,50,.3)';
    // Each month column: tappable, navigates to that month in History
    const monthLabel=tx().months[m.month];
    h+='<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer" onclick="viewMonth={m:'+m.month+',y:'+m.year+'};insTab=&quot;hist&quot;;go(&quot;insights&quot;)">';
    h+='<div style="flex:1;width:100%;display:flex;align-items:flex-end;gap:1px;position:relative">';
    // Amount label above current month spend bar only
    if(isThis&&m.spent>0){
      h+='<div style="position:absolute;bottom:calc(100% + 2px);left:0;right:0;text-align:center;font-size:.5rem;font-weight:800;color:var(--p1);white-space:nowrap">'+MKs(m.spent)+'</div>';
    }
    // Spend bar (takes ~60% of column width)
    h+='<div style="flex:3;height:'+spH+'px;background:'+spColor+';border-radius:4px 4px 2px 2px'+spShadow+'"></div>';
    // Income bar (takes ~40% of column width — only shown when income exists)
    if(m.income>0){
      h+='<div style="flex:2;height:'+incH+'px;background:'+incColor+';border-radius:4px 4px 2px 2px"></div>';
    } else {
      h+='<div style="flex:2"></div>';
    }
    h+='</div>';
    h+='<div style="font-size:.58rem;font-weight:700;color:'+(isThis?'var(--p1)':'var(--mid)')+'">'+(isThis?'<strong>':'')+monthLabel+(isThis?'</strong>':'')+'</div>';
    h+='</div>';
  });
  h+='</div></div>'; // close bars row + relative wrapper
  // Footer: month-over-month change badge + current month projection
  h+='<div style="display:flex;justify-content:space-between;align-items:center">';
  const last=months[5],prev=months[4];
  if(last&&prev&&prev.spent>0){
    const chg=Math.round((last.spent-prev.spent)/prev.spent*100);
    const up=chg>0;
    h+='<div class="bdiff-badge '+(up?'bdiff-dn':'bdiff-up')+'">'+(up?'&uarr;':'&darr;')+Math.abs(chg)+'% vs last mo</div>';
  } else {
    h+='<div style="font-size:.63rem;color:var(--mid)"><i data-lucide="bar-chart-2" style="width:11px;height:11px;margin-right:3px;vertical-align:middle;color:var(--p1)"></i>'+(isCW?'Gawani pa mwezi':'Monthly trend')+'</div>';
  }
  // End-of-month spending projection for current month
  if(last&&last.spent>0&&bg>0){
    // Project over the current BUDGET period (calendar month, or salary-day period), not always the calendar month.
    const _bp=getBudgetPeriod(curM());
    const _ps=new Date(_bp.startY,_bp.startM,_bp.startD), _pe=new Date(_bp.endY,_bp.endM,_bp.endD);
    const _t0=new Date(); _t0.setHours(0,0,0,0);
    const daysInMonth=Math.round((_pe-_ps)/86400000)+1;
    const daysPassed=Math.floor((_t0-_ps)/86400000)+1;
    if(daysPassed<daysInMonth&&daysPassed>0){
      const projected=Math.round(last.spent/daysPassed*daysInMonth);
      const projOver=projected>bg;
      h+='<div style="font-size:.6rem;font-weight:800;color:'+(projOver?'#C62828':'#2E7D32')+'">&#8594; '+MKs(projected)+' proj.</div>';
    }
  }
  h+='</div></div></div>';
  return h;
}
function rHome(){
  const t=tx(), sp=totSp(), inc=totIn(), bg=lCfg.overallBudget, rem=bg-sp, pct=Math.min(sp/bg,1);
  const circ=2*Math.PI*32, off=circ*(1-pct), stroke=pct>=1?'#FF5252':pct>=.8?'#FFD54F':'#69F0AE';
  const recent=lPx.filter(p=>isTM(p.date)&&!p.deleted).slice(0,5);
  const over=lCfg.items.filter(it=>iSpent(it.name)>it.budget).length;
  const near=lCfg.items.filter(it=>{const r=iSpent(it.name)/it.budget;return r>=.8&&r<1;}).length;
  const ok=lCfg.items.filter(it=>{const s=iSpent(it.name);return s>0&&s<it.budget*.8;}).length;
  const cnt=lPx.filter(p=>isTM(p.date)&&p.type!=='income'&&!p.deleted).length;
  const streak=getSpendingStreak();
  const isCW=lang==='cw';
  let h='<div class="page">';
  h+=getTrialBanner();
  h+='<div class="mnav"><button class="mnbtn" aria-label="Previous month" onclick="prevM()">&#9664;</button><span class="mnlbl"><i data-lucide="calendar" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i>'+mName()+'</span><button class="mnbtn" aria-label="Next month" onclick="nextM()" style="opacity:'+(isCurM()?'.3':'1')+'">&#9654;</button></div>';
  h+='<div class="hero2">';
  h+='<div class="h2-top">';
  h+='<div class="h2-ring"><svg viewBox="0 0 80 80" width="78" height="78" style="transform:rotate(-90deg)"><circle fill="none" stroke="rgba(255,255,255,.14)" stroke-width="8" cx="40" cy="40" r="32"/><circle fill="none" stroke="'+stroke+'" stroke-width="8" stroke-linecap="round" cx="40" cy="40" r="32" stroke-dasharray="'+circ.toFixed(1)+'" stroke-dashoffset="'+off.toFixed(1)+'"/></svg>';
  h+='<div class="h2-rlbl"><b>'+Math.round(pct*100)+'%</b><span>used</span></div></div>';
  h+='<div class="h2-main">';
  h+='<div class="h2-lbl">'+t.left+' this month</div>';
  h+='<div class="h2-bal'+(rem<0?' danger':'')+'">'+( rem<0?'- '+MKs(-rem):MKs(rem))+'</div>';
  h+='<div class="h2-sub">'+(isCW?'pa bajeti ya ':'of ')+MKs(bg)+' '+t.monthlyBudget+'</div>';
  h+='</div></div>';
  h+='<div class="h2-cols">';
  h+='<div class="h2-col"><div class="h2-cl">'+t.income+'</div><div class="h2-cv gc">'+MKs(inc)+'</div></div>';
  h+='<div class="h2-div"></div>';
  h+='<div class="h2-col"><div class="h2-cl">'+t.spent+'</div><div class="h2-cv rc">'+MKs(sp)+'</div></div>';
  h+='<div class="h2-div"></div>';
  h+='<div class="h2-col"><div class="h2-cl">'+t.entries+'</div><div class="h2-cv">'+cnt+'</div></div>';
  h+='</div></div>';
  h+=renderChipHomeCard();
  if(streak>=2){
    const streakIcon=streak>=8?'flame':streak>=4?'star':'check-circle';
    const streakColor=streak>=8?'#E65100':streak>=4?'#F57F17':'#2E7D32';
    const streakMsg=streak>=8?(isCW?'Masabata '+streak+' opitilira bajeti!':streak+' weeks strong!')
      :streak>=4?(isCW?'Bwino kwambiri! Masabata '+streak:('Great work! '+streak+' wks under budget'))
      :(isCW?'Masabata 2 opitilira bajeti!':'2 weeks under budget!');
    h+='<div class="streak-chip"><div class="streak-ico" style="width:36px;height:36px;border-radius:var(--cr-md);background:'+streakColor+'1A;display:flex;align-items:center;justify-content:center;flex-shrink:0"><i data-lucide="'+streakIcon+'" style="width:18px;height:18px;color:'+streakColor+'"></i></div><div class="streak-main"><div class="streak-ttl">'+(isCW?'Cholowetsa Bajeti':'Budget Streak')+'</div><div class="streak-sub">'+streakMsg+'</div></div></div>';
  }
  h+='<div class="chips"><div class="chip cP"><div class="chip-lbl">'+(isCW?'Zogulidwa':'Purchases')+'</div><div class="chip-val">'+cnt+'</div><div class="chip-sub">'+(isCW?'mwezi uno':'this month')+'</div></div>';
  h+='<div class="chip '+(over>0?'cR':'cG')+'"><div class="chip-lbl">'+(isCW?'Yavuka':'Over Budget')+'</div><div class="chip-val">'+over+'</div><div class="chip-sub">'+t.chipItems+'</div></div>';
  h+='<div class="chip cO"><div class="chip-lbl">'+(isCW?'Pafupi':'Near Limit')+'</div><div class="chip-val">'+near+'</div><div class="chip-sub">'+t.chipItems+'</div></div>';
  h+='<div class="chip cG"><div class="chip-lbl">'+(isCW?'Zabwino':'On Track')+'</div><div class="chip-val">'+ok+'</div><div class="chip-sub">'+t.chipItems+'</div></div></div>';
  const _billsDue=(lCfg.bills||[]).map(function(b){
    const due=new Date(b.dueDate);due.setHours(0,0,0,0);
    const t0=new Date();t0.setHours(0,0,0,0);
    return {b:b,diff:Math.round((due-t0)/86400000)};
  }).filter(function(x){return x.diff<=7;}).sort(function(a,b){return a.diff-b.diff;}).slice(0,3);
  if(getPremiumStatus().isPremium && _billsDue.length){
    h+='<div class="card" style="border:1px solid #FFE0B2;cursor:pointer" onclick="go(&quot;stg&quot;);stgOpenSection(&quot;bills&quot;)">';
    h+='<div class="ch" style="padding-bottom:2px"><h2 style="font-size:.84rem"><i data-lucide="alarm-clock" style="width:14px;height:14px;margin-right:5px;vertical-align:middle;color:#E65100"></i>'+t.billsDueSoon+'</h2><span class="stg-chev">›</span></div>';
    h+='<div class="cb" style="padding:0 15px 10px">';
    _billsDue.forEach(function(x){
      const b=x.b,diff=x.diff,urgent=diff<=3;
      h+='<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:.78rem">';
      h+='<span style="font-weight:700;color:var(--ink)">'+esc(b.name)+'</span>';
      h+='<span style="font-weight:700;color:'+(urgent?'#E65100':'var(--mid)')+'">'+(diff===0?t.todayLbl.replace('!',''):(diff<0?t.overdueLbl.replace('!',''):diff+' '+t.daysLeftLbl))+'</span>';
      h+='</div>';
    });
    h+='</div></div>';
  }
  h+=renderTrendChart(getLast6MonthsData());
  h+='<div class="card"><div class="ch"><h2>'+t.recent+'</h2><button class="btnG" onclick="insTab=&quot;hist&quot;;go(&quot;insights&quot;)" style="padding:5px 10px;font-size:.72rem">'+t.viewAll+'</button></div><div class="cb" style="padding:4px 15px 12px">';
  if(recent.length){
    recent.forEach(p=>{
      const u=uById(p.userId),isI=p.type==='income';
      const cc=isI?'#1B5E20':(CAT_COLORS[catOf(p.item,p.cat)]||'#7B1FA2');
      h+='<div class="pri">';
      h+='<div class="prico2" style="background:'+cc+'1A;border-radius:14px">'+ico(p.item)+'</div>';
      h+='<div class="prinfo"><div class="prname">'+esc(trName(p.item))+(isBadItemName(p.item)?' <i data-lucide="alert-triangle" title="This entry needs a proper name" style="width:12px;height:12px;color:#E65100;vertical-align:middle"></i>':'')+(p.recurring?' <i data-lucide="refresh-cw" style="width:12px;height:12px;margin-right:3px;vertical-align:middle"></i>':'')+'</div>';
      h+=(p.notes?'<div class="prnote">'+esc(p.notes)+'</div>':'');
      h+='<div class="prmeta"><span class="prdate">'+fmtDate(p.date)+'</span>';
      h+='<span class="prwho" style="background:'+sC(u.color)+'">'+esc(u.name)+'</span></div></div>';
      h+='<div class="pramt '+(isI?'inc':'exp')+'">'+(isI?'+ ':'- ')+MK(p.amount)+'</div></div>';
    });
  } else {
    h+='<div class="empty"><div class="ei"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></div>';
    h+='<p><strong>'+(isCW?'Palibe cholemba.':'No transactions yet.')+'</strong><br><span style="font-size:.75rem;color:var(--mid)">'+(isCW?'Dinani + kuti mulowetse.':'Tap + to log your first expense.')+'</span></p></div>';
  }
  h+='</div></div></div>';
  g('view').innerHTML=h;
}
function cpCode(){ if(hhId){navigator.clipboard&&navigator.clipboard.writeText(hhId).then(()=>toast(tx().codeCopied,'i')).catch(()=>toast(tx().codeCopied,'i'));} }
function waCode(){ if(hhId)window.open('https://wa.me/?text='+encodeURIComponent('Join my Bajeti Yanga!\nCode: '+hhId+'\n\nOpen the app and tap Join Household.'),'_blank'); }

// ── QR Code generator (no library needed — uses a minimal pure-JS QR encoder) ──
function openQRScanner(){
  const isCW = lang === 'cw';
  let stream = null;
  let scanInterval = null;

  let h = '<div class="dh"></div>';
  h += '<div style="display:flex;align-items:center;gap:10px;padding:4px 0 14px;border-bottom:1.5px solid var(--border);margin-bottom:12px">';
  h += '<div style="width:32px;height:32px;border-radius:var(--cr-sm);background:#F3E5F5;display:flex;align-items:center;justify-content:center"><i data-lucide="scan-line" style="width:16px;height:16px;color:var(--p1)"></i></div>';
  h += '<div style="flex:1"><div style="font-weight:800;font-size:.88rem">'+(isCW?'Skani QR Code':'Scan QR Code')+'</div>';
  h += '<div style="font-size:.65rem;color:var(--mid)">'+(isCW?'Ikani kamera pa QR code ya nyumba':'Point camera at a household QR code')+'</div></div>';
  h += '<button onclick="stopQRScanner()" style="background:none;border:none;color:var(--mid);font-size:.75rem;cursor:pointer;font-family:inherit;padding:4px 8px">'+(isCW?'Lekani':'Cancel')+'</button>';
  h += '</div>';
  h += '<div style="position:relative;width:100%;border-radius:var(--cr);overflow:hidden;background:#000;aspect-ratio:1">';
  h += '<video id="qr-video" autoplay playsinline muted style="width:100%;height:100%;object-fit:cover;display:block"></video>';
  // Scan frame overlay
  h += '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none">';
  h += '<div style="width:65%;height:65%;border:3px solid var(--p1);border-radius:var(--cr);box-shadow:0 0 0 9999px rgba(0,0,0,.45)">';
  h += '<div style="position:absolute;top:-2px;left:-2px;width:20px;height:20px;border-top:3px solid #fff;border-left:3px solid #fff;border-radius:4px 0 0 0"></div>';
  h += '<div style="position:absolute;top:-2px;right:-2px;width:20px;height:20px;border-top:3px solid #fff;border-right:3px solid #fff;border-radius:0 4px 0 0"></div>';
  h += '<div style="position:absolute;bottom:-2px;left:-2px;width:20px;height:20px;border-bottom:3px solid #fff;border-left:3px solid #fff;border-radius:0 0 0 4px"></div>';
  h += '<div style="position:absolute;bottom:-2px;right:-2px;width:20px;height:20px;border-bottom:3px solid #fff;border-right:3px solid #fff;border-radius:0 0 4px 0"></div>';
  h += '</div></div>';
  h += '<canvas id="qr-canvas-scan" style="display:none"></canvas>';
  h += '</div>';
  h += '<div style="text-align:center;margin-top:10px;font-size:.72rem;color:var(--mid)" id="qr-scan-status">'+(isCW?'Ikani kamera pa QR code...':'Positioning camera on the QR code...')+'</div>';

  g('mb-u').innerHTML = h;
  if(window.lucide) lucide.createIcons({nodes:[g('mb-u')]});
  openM('mv-u', _qrCleanup); // ensures the camera stops even if closed via device-back rather than the Cancel button

  // Delay camera start until modal is fully rendered and visible
  // getUserMedia on a non-visible video element silently fails on Chrome Android
  setTimeout(function(){
    navigator.mediaDevices.getUserMedia({video:{facingMode:'environment', width:{ideal:1280}, height:{ideal:720}}})
      .then(function(s){
        const video = g('qr-video');
        if(!video){ s.getTracks().forEach(function(t){ t.stop(); }); return; } // modal closed already
        video.srcObject = s;
        video.play().catch(function(){});

        // Try BarcodeDetector first (native, fast on Chrome Android)
        if(window.BarcodeDetector){
          try {
            const detector = new BarcodeDetector({formats:['qr_code']});
            window._qrScanInterval = setInterval(async function(){
              const vid = g('qr-video');
              if(!vid || vid.readyState < 2) return;
              try {
                const codes = await detector.detect(vid);
                if(codes.length > 0) handleQRResult(codes[0].rawValue);
              } catch(e){}
            }, 250);
          } catch(e){
            // BarcodeDetector threw on init — fall through to jsQR
            _startJsQRScan(video);
          }
        } else {
          _startJsQRScan(video);
        }
      })
      .catch(function(err){
        const status = g('qr-scan-status');
        const isCW2 = lang === 'cw';
        if(status) status.innerHTML = '<span style="color:#E53935">'+(isCW2?'Kamera siilolezedwa. Lolani kamera ndipo yesaninso.':'Camera access denied. Please allow camera access and try again.')+'</span>';
      });
  }, 200);
}

function _startJsQRScan(video){
  if(!window.jsQR){
    const status = g('qr-scan-status');
    if(status) status.textContent = lang==='cw'?'Skani siilolezedwa pa browser iyi. Lowetsani kodi mwine.':'QR scanning not supported on this browser. Enter the code manually.';
    return;
  }
  const canvas = g('qr-canvas-scan');
  const ctx = canvas ? canvas.getContext('2d') : null;
  if(!ctx) return;
  window._qrScanInterval = setInterval(function(){
    const vid = g('qr-video');
    if(!vid || vid.readyState < 2 || vid.videoWidth === 0) return;
    canvas.width = vid.videoWidth;
    canvas.height = vid.videoHeight;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(imgData.data, imgData.width, imgData.height, {inversionAttempts:'dontInvert'});
    if(code) handleQRResult(code.data);
  }, 250);
}

function _qrCleanup(){
  try {
    const video = g('qr-video');
    if(video && video.srcObject){
      video.srcObject.getTracks().forEach(function(t){ t.stop(); });
      video.srcObject = null;
    }
  } catch(e){}
  if(window._qrScanInterval){ clearInterval(window._qrScanInterval); window._qrScanInterval = null; }
}
function stopQRScanner(){
  _qrCleanup();
  closeM('mv-u');
}

function handleQRResult(raw){
  stopQRScanner();
  const isCW = lang === 'cw';
  // Extract household code from deep link URL or treat as raw code
  let code = raw.trim();
  try {
    const url = new URL(raw);
    const joinParam = url.searchParams.get('join');
    if(joinParam) code = joinParam.trim().toUpperCase();
  } catch(e){
    // Not a URL — use as-is, uppercase
    code = code.toUpperCase();
  }
  if(!code){ toast(isCW?'QR code yolakwika':'Invalid QR code','e'); return; }
  // Pre-fill the join code input
  const joinInp = g('join-code');
  if(joinInp){
    joinInp.value = code;
    joinInp.focus();
  }
  toast(isCW?'Kodi yapet seka ku QR! Lowani "Lowani Nyumba Iyi".':'Code scanned! Tap "Join This Household" to continue.','s');
}

function openQRCode(){
  if(!hhId){ toast('No household code.','e'); return; }
  const isCW=lang==='cw';
  const joinUrl=APP_BASE_URL+'?join='+encodeURIComponent(hhId);
  let h='<div class="dh"></div>';
  h+='<h3><i data-lucide="qr-code" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;color:var(--p1)"></i>'+(isCW?'Kodi ya QR':'QR Code')+'</h3>';
  h+='<p style="font-size:.76rem;color:var(--mid);margin-bottom:14px;line-height:1.5">';
  h+=(isCW?'Gwiritsani ntchito QR code kuti musonkhanitsa anthu a nyumba yanu msanga.':'Scan this QR code to join your household instantly. Opens Bajeti Yanga with the code pre-filled.')+'</p>';
  h+='<div style="display:flex;justify-content:center;margin-bottom:16px">';
  h+='<div style="background:#fff;border-radius:var(--cr);padding:16px;box-shadow:0 4px 24px rgba(123,31,162,.15);border:2px solid var(--border)">';
  h+='<div id="qr-canvas" style="width:200px;height:200px;border-radius:var(--cr-sm);display:flex;align-items:center;justify-content:center"></div>';
  h+='</div></div>';
  h+='<div style="background:var(--mist);border-radius:var(--cr-md);padding:10px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:8px">';
  h+='<div><div style="font-size:.66rem;font-weight:700;color:var(--mid);text-transform:uppercase;margin-bottom:2px">'+(isCW?'Kodi ya Nyumba':'Household Code')+'</div>';
  h+='<div style="font-family:monospace;font-weight:800;font-size:1.1rem;color:var(--ink);letter-spacing:2px">'+hhId+'</div></div>';
  h+='<button onclick="cpCode()" style="background:linear-gradient(135deg,var(--p1),var(--p2));color:#fff;border:none;border-radius:var(--cr-md);padding:8px 14px;font-family:Hanken Grotesk,sans-serif;font-weight:700;font-size:.75rem;cursor:pointer;display:flex;align-items:center;gap:5px">';
  h+='<i data-lucide="copy" style="width:13px;height:13px"></i> '+(isCW?'Koperani':'Copy')+'</button>';
  h+='</div>';
  h+='<button onclick="waCode();closeM(&quot;mv-u&quot;)" style="width:100%;padding:12px;background:#25D366;color:#fff;border:none;border-radius:var(--cr-md);font-family:Hanken Grotesk,sans-serif;font-weight:700;font-size:.84rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px">';
  h+='<i data-lucide="send" style="width:14px;height:14px"></i> '+(isCW?'Tumizani pa WhatsApp':'Share via WhatsApp')+'</button>';
  h+='<button onclick="closeM(&quot;mv-u&quot;)" class="btnG" style="width:100%">'+(isCW?'Lekani':'Close')+'</button>';
  g('mb-u').innerHTML=h;
  if(window.lucide) lucide.createIcons({nodes:[g('mb-u')]});
  openM('mv-u');
  // Generate real scannable QR code using qrcode.js
  setTimeout(function(){
    const el = g('qr-canvas');
    if(!el) return;
    if(window.QRCode){
      try {
        new QRCode(el, {
          text: joinUrl,
          width: 200,
          height: 200,
          colorDark: '#4A148C',
          colorLight: '#ffffff',
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch(e) {
        el.innerHTML = '<div style="text-align:center;padding:20px;font-size:.75rem;color:#607D8B">'
          +'<div style="font-weight:800;margin-bottom:6px;font-family:monospace;font-size:1.1rem;letter-spacing:2px">'+esc(hhId)+'</div>'
          +'<div>QR unavailable offline.<br>Copy the code above.</div></div>';
      }
    } else {
      // qrcode.js not loaded — show code as fallback
      el.innerHTML = '<div style="text-align:center;padding:20px;font-size:.75rem;color:#607D8B">'
        +'<div style="font-weight:800;margin-bottom:6px;font-family:monospace;font-size:1.2rem;letter-spacing:2px;color:#4A148C">'+esc(hhId)+'</div>'
        +'<div>Copy the code above to share.</div></div>';
    }
  }, 100);
}
function rLog(){
  const t=tx(), hint=selItem!==null?lCfg.items[selItem]:null;
  let h='<div class="page" style="padding-bottom:16px"><div class="card"><div class="ch"><h2><i data-lucide="shopping-cart" style="margin-right:5px;vertical-align:middle;color:var(--p1)"></i> '+t.logTitle+'</h2></div><div class="cb">';
  h+='<div class="magic-wrap"><button class="magic-btn" onclick="openMagicLog()"><span class="mb-ico"><i data-lucide="sparkles" style="width:16px;height:16px;color:#2A1400"></i></span><span class="mb-txt">'+(lang==='cw'?'Kulemba Mwachangu':'Magic Log')+'<span class="mb-sub">'+(lang==='cw'?'Mothandizidwa ndi AI — jambulani, koperani SMS, kapena lembani.':'AI-powered — scan, paste SMS, or type.')+'</span></span><i data-lucide="chevron-right" style="width:16px;height:16px;color:#D8B4E8"></i></button></div>';
  h+='<div class="type-tog"><button class="tt exp'+(logType==='expense'?' on':'')+'" onclick="setLT(&quot;expense&quot;)"><i data-lucide="trending-down" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+t.expense+'</button><button class="tt inc'+(logType==='income'?' on':'')+'" onclick="setLT(&quot;income&quot;)"><i data-lucide="trending-up" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+t.income+'</button></div>';
  h+='<div class="fsec"><label class="fl">'+t.selUser+'</label><div class="usel">'+lCfg.users.map(u=>'<div class="usb'+(actU().id===u.id?' on':'')+'" data-uid="'+esc(u.id)+'" onclick="setU(this.dataset.uid)">'+'<div class="usav" style="background:'+sC(u.color)+'">'+esc(u.name[0])+'</div><div class="usnm">'+esc(u.name)+'</div></div>').join('')+'</div></div>';
  if(logType==='expense'){
    const picks=QUICK_PICKS.map(name=>{const i=lCfg.items.findIndex(it=>it.name===name);return i<0?'':'<div class="qsb'+(selItem===i?' on':'')+'" onclick="pickID(this)" data-i="'+i+'">'+ico(name)+' '+trName(name)+'</div>';}).join('');
    if(picks)h+='<div class="fsec"><label class="fl"><i data-lucide="zap" style="width:11px;height:11px;vertical-align:-1px;color:#F9A825"></i> '+t.quickPick+'</label><div class="qsugg">'+picks+'</div></div>';
    h+='<div class="fsec"><label class="fl">'+t.selItem+'</label>'
      +'<input type="text" class="fi" id="log-srch" placeholder="'+t.searchPurchases+'" oninput="filterLogItems(this.value)" value="'+esc(logSrch)+'" style="margin-bottom:8px;font-size:.84rem">'
      +'<div id="log-search-results"></div>';
    if(selItem!==null&&selItem!=='custom'){
      const si=lCfg.items[selItem];
      if(si)h+='<div style="display:flex;align-items:center;gap:8px;background:var(--mist);border-radius:var(--cr-md);padding:8px 12px;margin-bottom:8px"><div style="font-size:1.05rem">'+ico(si.name)+'</div><div style="flex:1;font-weight:700;font-size:.82rem;color:var(--ink)">'+esc(trName(si.name))+'</div><button onclick="pickI(null)" style="border:none;background:none;color:var(--mid);cursor:pointer;padding:2px" aria-label="Clear selection"><i data-lucide="x" style="width:15px;height:15px"></i></button></div>';
    }
    h+='<div class="ic'+(selItem==='custom'?' on':'')+'" onclick="pickCustom()" style="border-style:dashed;flex-direction:row;justify-content:flex-start;text-align:left;padding:9px 10px"><div class="ic-ico"><i data-lucide="pencil" style="width:16px;height:16px"></i></div><div class="ic-nm">'+(lang==='cw'?'Chinthu Chinanso':'Custom item')+'</div></div>'
      +'</div>';
    if(selItem==='custom'){
      h+='<div class="fsec" style="background:var(--mist);border-radius:var(--cr-md);padding:12px;margin-bottom:4px">'
        +'<label class="fl" style="margin-bottom:6px"><i data-lucide="pencil" style="width:10px;height:10px;vertical-align:-1px"></i> '+(lang==='cw'?'Dzina la Chinthu':'Item Name')+'</label>'
        +'<input type="text" class="fi" id="custom-item-name" placeholder="e.g. Medicine, Bus fare..." style="margin-bottom:8px" oninput="autoDetectCustomCat(this.value)">'
        +'<label class="fl" style="margin-bottom:6px">'+(lang==='cw'?'Gulu':'Category')+'</label>'
        +'<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px" id="custom-cat-grid">'
        +CAT_OPTS.map(ct=>'<button data-cat="'+ct.key+'" onclick="pickCustomCat(\''+ct.key+'\')" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:var(--cr-sm);border:1.5px solid '+(customCat===ct.key?'var(--p1)':'var(--border)')+';background:'+(customCat===ct.key?'var(--p1)':'var(--white)')+';color:'+(customCat===ct.key?'#fff':'var(--mid)')+';font-size:.68rem;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif"><i data-lucide="'+ct.icon+'" style="width:12px;height:12px"></i>'+ct.label+'</button>').join('')
        +'</div>'
        +'<label style="display:flex;align-items:center;gap:7px;font-size:.75rem;font-weight:600;color:var(--mid);cursor:pointer">'
        +'<input type="checkbox" id="custom-save-perm" onchange="g(\'custom-budget-row\').style.display=this.checked?\'block\':\'none\'" style="width:16px;height:16px;accent-color:var(--p1)">'
        +(lang==='cw'?'Sungani mu mndandanda wanga':'Save to my items list')+'</label>'
        +'<div id="custom-budget-row" style="display:none;margin-top:8px"><input type="number" class="fi" id="custom-budget" placeholder="Monthly budget (MK)" inputmode="numeric"></div>'
        +'</div>';
    }
    if(hint){const sp=iSpent(hint.name);h+='<div class="bhint"><div class="bh"><div class="bhl">'+t.budget+'</div><div class="bhv">'+MK(hint.budget)+'</div></div><div class="bh"><div class="bhl">'+t.spent+'</div><div class="bhv">'+MK(sp)+'</div></div><div class="bh"><div class="bhl">'+t.left+'</div><div class="bhv" style="color:'+(hint.budget-sp<0?'#B71C1C':'inherit')+'">'+MK(hint.budget-sp)+'</div></div></div>';}
  } else {
    h+='<div class="fsec"><label class="fl">'+(lang==='cw'?'Mtundu wa Ndalama':'Income Type')+'</label><div class="type-tog" style="margin-bottom:8px"><button class="tt inc" id="inc-t-ot" onclick="setIncType(this,0)"><i data-lucide="receipt" style="margin-right:3px"></i> '+(lang==='cw'?'Kamodzi Basi':'One Time')+'</button><button class="tt inc" id="inc-t-rc" onclick="setIncType(this,1)"><i data-lucide="refresh-cw" style="width:12px;height:12px;margin-right:3px;vertical-align:middle"></i> '+(lang==='cw'?'Nthawi Zonse':'Recurring')+'</button></div></div>';
    h+='<div class="fsec"><label class="fl">'+(lang==='cw'?'Gwero la Ndalama':'Source')+'</label><select class="fs" id="inc-src"><option value="Salary/Income">Salary / Income</option><option value="Business Income">Business Income</option><option value="Farm Income">Farm Income</option><option value="Other Income">Other Income</option></select></div>';
  }
  h+='<div class="fsec"><label class="fl">'+t.amount+'</label><input type="number" class="fi" id="fa" placeholder="0" inputmode="numeric" onkeydown="if(event.key===&quot;Enter&quot;){event.preventDefault();saveP();}"></div>';
  h+='<div class="frow"><div class="fsec"><label class="fl">'+t.date+'</label><input type="date" class="fi" id="fd" value="'+today()+'"></div><div class="fsec"><label class="fl">'+t.time+'</label><input type="time" class="fi" id="ft" value="'+nowTime()+'"></div></div>';
  if(logType==='expense'){const _hn=selItem!==null?(lCfg.items[selItem]||{}).name:'';if(!NO_QTY_ITEMS.includes(_hn))h+='<div class="frow"><div class="fsec"><label class="fl">'+t.qty+'</label><input type="number" class="fi" id="fq" placeholder="1" inputmode="decimal"></div><div class="fsec"><label class="fl">'+t.unit+'</label><select class="fs" id="fu">'+t.units.map(u=>'<option>'+u+'</option>').join('')+'</select></div></div>';}
  h+='<div class="fsec"><label class="fl">'+t.notes+'</label><input type="text" class="fi" id="fn" onkeydown="if(event.key===&quot;Enter&quot;){event.preventDefault();saveP();}" placeholder="e.g. Bought at Chipiku..."></div>';
  if(logType==='expense')h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:11px"><input type="checkbox" id="frc" style="width:17px;height:17px;accent-color:var(--p1)"><label for="frc" style="font-size:.78rem;font-weight:600;color:var(--mid)"><i data-lucide="refresh-cw" style="width:12px;height:12px;margin-right:3px;vertical-align:middle"></i> '+t.recurrYes+'</label></div>';
  h+='</div></div></div>';
  h+='<div class="log-save-bar"><button class="btnM" onclick="saveP()" style="background:'+(logType==='income'?'linear-gradient(135deg,#1B5E20,#388E3C)':'')+'"><i data-lucide="save" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> '+t.save+'</button></div>';
  g('view').innerHTML=h;
  if(window.lucide) lucide.createIcons({nodes:[g('view')]});
  if(logSrch) filterLogItems(logSrch);
}
function setLT(t){ logType=t; selItem=null; logSrch=''; rLog(); }
function setU(id){ localStorage.setItem('nb_uid',id); updatePill(); rLog(); }
function pickI(i){ selItem=i; rLog(); }
function filterLogItems(q){
  logSrch=q;
  const box=document.getElementById('log-search-results'); if(!box)return;
  const term=q.toLowerCase().trim();
  if(!term){box.innerHTML='';return;}
  const matches=lCfg.items.map((it,i)=>({it,i})).filter(o=>o.it.name.toLowerCase().includes(term)).slice(0,8);
  if(!matches.length){box.innerHTML='<div style="padding:10px 4px;font-size:.74rem;color:var(--mid);text-align:center">'+(lang==='cw'?'Palibe chotsatana.':'No matches.')+'</div>';return;}
  box.innerHTML='<div style="display:flex;flex-direction:column;gap:5px;margin-bottom:8px">'+matches.map(o=>'<div class="ic'+(selItem===o.i?' on':'')+'" style="flex-direction:row;justify-content:flex-start;text-align:left;padding:8px 10px" onclick="pickID(this)" data-i="'+o.i+'"><div class="ic-ico">'+ico(o.it.name)+'</div><div class="ic-nm">'+esc(trName(o.it.name))+'</div></div>').join('')+'</div>';
  if(window.lucide) lucide.createIcons({nodes:[box]});
}
function saveP(){
  const t=tx(), a=parseFloat(val('fa'));
  if(!a||isNaN(a)||a<=0){toast(lang==='cw'?'Lowetsani ndalama yabwino':'Enter a valid amount','e');return;}
  if(a>99999999){toast(lang==='cw'?'Ndalama yakula kwambiri':'Amount is too large','e');return;}
  const dStr=val('fd')||today(), tStr=val('ft')||'12:00';
  const ts=new Date(dStr+'T'+tStr).getTime();
  if(logType==='expense'){
    if(selItem===null){toast(t.selItem,'e');return;}
    if(selItem==='custom'){
      const cName=(val('custom-item-name')||'').trim();
      if(!cName){toast(lang==='cw'?'Lowetsani dzina':'Enter item name','e');return;}
      if((g('custom-save-perm')||{}).checked){
        const cB=parseFloat(val('custom-budget')||'0');
        const cfg2=JSON.parse(JSON.stringify(lCfg));
        if(cB>0&&!cfg2.items.find(it=>it.name.toLowerCase()===(cName||'').toLowerCase())){
          cfg2.items.push({name:cName,budget:cB,cat:customCat}); saveCfg(cfg2);
        }
      }
      addPx({item:cName,date:dStr,timestamp:ts,amount:a,qty:val('fq')||'',unit:val('fu')||'',notes:val('fn')||'',userId:actU().id,type:'expense',cat:customCat,recurring:(g('frc')||{}).checked||false});
      selItem=null; customCat='Other'; toast(t.saved); rLog(); return;
    }
    if(!lCfg.items[selItem]){toast('Item no longer exists. Please re-select.','e');selItem=null;rLog();return;}
    addPx({item:lCfg.items[selItem].name,date:dStr,timestamp:ts,amount:a,qty:val('fq'),unit:val('fu'),notes:val('fn'),userId:actU().id,type:'expense',recurring:(g('frc')||{}).checked||false});
  } else {
    addPx({item:val('inc-src')||'Salary/Income',date:dStr,timestamp:ts,amount:a,notes:val('fn'),userId:actU().id,type:'income'});
  }
  selItem=null; toast(t.saved); rLog();
}

