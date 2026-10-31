// ===============================================
// CHAT -- Bajeti AI Budget Assistant
// ===============================================

// -- Chat state --
let chatHistory = [];
let chatConversations = [];
let activeChatId = null;
let chatBusy = false;

// Firestore-backed usage counters (source of truth — not localStorage)
const FREE_MAX_CONVOS=3;
const FREE_DAILY_MSGS=10;
const FREE_DAILY_MAGIC=5;
const FREE_DAILY_SCAN=5;
const FREE_DAILY_SUMM=5;
let _aiInFlight=false;

function chatStorageKey(){ return 'nb_chat_'+(hhId||'anon'); }

// Cache-only: localStorage is display cache, Firestore is truth
function loadChatHistory(){
  try{ chatHistory = JSON.parse(localStorage.getItem(chatStorageKey())||'[]'); }catch(e){ chatHistory=[]; }
}
function saveChatHistory(){
  try{ localStorage.setItem(chatStorageKey(), JSON.stringify(chatHistory.slice(-50))); }catch(e){ /* storage full or blocked: chat still lives in memory and Firestore */ }
}

// ── Firestore usage helpers ──
function hhUsageRef(){ return db.collection('households').doc(hhId).collection('_usage').doc('ai'); }
async function getHHUsage(){
  if(!hhId) return {msgCount:0,msgDate:'',convoCount:0,magicCount:0,scanCount:0,summCount:0};
  try{ const s=await hhUsageRef().get(); return s.exists?s.data():{msgCount:0,msgDate:'',convoCount:0,magicCount:0,scanCount:0,summCount:0}; }
  catch(e){ return {msgCount:0,msgDate:'',convoCount:0,magicCount:0,scanCount:0,summCount:0}; }
}
async function getAiUsageTodayFS(feature){
  const d=await getHHUsage(); if(d.msgDate!==today()) return 0;
  return d[{msg:'msgCount',magic:'magicCount',scan:'scanCount',summ:'summCount'}[feature||'msg']]||0;
}
async function incAiUsageTodayFS(feature){
  if(!hhId) return;
  const d=await getHHUsage(); const isT=d.msgDate===today();
  const key={msg:'msgCount',magic:'magicCount',scan:'scanCount',summ:'summCount'}[feature||'msg'];
  const upd={msgDate:today(),convoCount:d.convoCount||0,[key]:(isT?(d[key]||0):0)+1};
  if(!isT){upd.msgCount=0;upd.magicCount=0;upd.scanCount=0;upd.summCount=0;upd[key]=1;}
  await hhUsageRef().set(upd,{merge:true}).catch(()=>{});
}

// Legacy localStorage AI usage — kept only as fallback display; Firestore is truth
function getAiUsageToday(){
  const key='nb_ai_'+today();
  return parseInt(localStorage.getItem(key)||'0');
}
function incAiUsageToday(){
  const key='nb_ai_'+today();
  localStorage.setItem(key,String(getAiUsageToday()+1));
}

// Show paywall when free user hits conversation limit
function showConvoLimitWall(count){
  let h='<div class="dh"></div>';
  h+='<div style="text-align:center;padding:10px 0 16px">';
  h+='<div style="margin-bottom:8px"><i data-lucide="message-circle" style="width:38px;height:38px;color:var(--mid);opacity:.6"></i></div>';
  h+='<h3 style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1rem;margin-bottom:6px">'+(lang==='cw'?'Mwafika pa Malire a Zokambirana':'Conversation Limit Reached')+'</h3>';
  h+='<div style="font-size:.78rem;color:var(--mid);margin-bottom:14px;line-height:1.5">'+(lang==='cw'?'Akaunti zaulere zimasunga zokambirana mpaka <strong>'+FREE_MAX_CONVOS+'</strong>. Mwagwiritsa '+count+'/'+FREE_MAX_CONVOS+'.':'Free accounts can save up to <strong>'+FREE_MAX_CONVOS+' conversations</strong>. You have '+count+'/'+FREE_MAX_CONVOS+' used.')+'</div>';
  h+='<div style="background:var(--mist);border-radius:var(--cr-md);padding:10px 12px;margin-bottom:14px;font-size:.76rem;color:var(--mid);text-align:left">';
  h+='To start a new conversation, either:<br>';
  h+='<strong style="color:var(--ink)">• Delete</strong> an existing conversation<br>';
  h+='<strong style="color:var(--p1-text)">• Upgrade to Premium</strong> for unlimited conversations';
  h+='</div>';
  h+='<button class="btnM" style="width:100%;margin-bottom:8px" onclick="closeM(&quot;mv-u&quot;);showPremiumPage()">'+(lang==='cw'?'Pitani ku Premium kuti musunge zokambirana zopanda malire':'Upgrade for Unlimited Chats')+'</button>';
  h+='<button onclick="closeM(&quot;mv-u&quot;);openConvoList()" style="background:none;border:none;color:var(--mid);font-size:.8rem;font-family:inherit;cursor:pointer;padding:8px 16px;display:block;margin:0 auto">'+(lang==='cw'?'Sinthani Zokambirana Zomwe Zilipo':'Manage Existing Chats')+'</button>';
  h+='</div>';
  g('mb-u').innerHTML=h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-u')]});
  openM('mv-u');
}

const CHAT_SUGGESTIONS    = ['How am I doing this month?','Where am I overspending?','Can I afford my savings goals?','Give me tips to cut costs'];
const CHAT_SUGGESTIONS_CW = ['Ndikuyenda bwanji mwezi uno?','Ndikuononga kwambiri ndalama zambiri kuti?','Ndingakwanitse zolinga zanga?','Ndipatseni malangizo ochepetsera kuononga ndalama'];

function rChat(){
  const isCW=lang==='cw';
  const placeholder=isCW?'Funsani funso pa bajeti yanu...':'Ask anything about your budget...';
  const sendIcon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
  const attachIcon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';
  const firstName = curUser&&curUser.displayName ? curUser.displayName.split(' ')[0] : (isCW?'kumeneko':'there');
  const greeting = isCW ? (curUser&&curUser.displayName ? 'Moni, '+firstName+'!' : 'Moni kumeneko!') : 'Hey, '+firstName+'!';
  const subText = isCW ? 'Ine ndine Bajeti AI. Funsani chilichonse pa bajeti yanu!' : "I'm Bajeti AI, your personal budget partner!";
  const suggestions = isCW ? [
    {icon:'trending-up',color:'#1B5E20',txt:'Kodi ndikuchita bwanji mwezi uno?'},
    {icon:'alert-triangle',color:'#E65100',txt:'Kodi ndikupita kupitirira bajeti yanga?'},
    {icon:'target',color:'#1565C0',txt:'Kodi ndingathe malipiro anga?'},
    {icon:'lightbulb',color:'#F57F17',txt:'Ndipatseni malangizo obisa ndalama'},
  ] : [
    {icon:'trending-up',color:'#1B5E20',txt:'How am I doing this month?'},
    {icon:'alert-triangle',color:'#E65100',txt:'Where am I overspending?'},
    {icon:'target',color:'#1565C0',txt:'Can I afford my savings goals?'},
    {icon:'lightbulb',color:'#F57F17',txt:'Give me tips to cut costs'},
  ];
  // Build the chrome — renderBubbles() owns #chat-msgs content entirely, no heroHtml here
  g('view').innerHTML =
    '<div style="position:relative;display:flex;flex-direction:column;height:100%;padding:0;overflow:hidden">'
    +'<div class="chat-wrap"><div class="chat-msgs" id="chat-msgs"></div>'
    +'<div class="chat-footer" style="position:relative">'
    +'<button class="chat-attach-btn" id="chat-attach" onclick="toggleChatSheet(event)" title="'+L('More options','Zina zambiri')+'" aria-label="'+L('More options','Zina zambiri')+'" style="background:linear-gradient(135deg,var(--p1),#9C27B0);color:#fff;border-radius:50%;width:42px;height:42px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 3px 10px rgba(123,31,162,.35)">'+attachIcon+'</button>'
    +'<textarea class="chat-input" id="chat-inp" rows="1" placeholder="'+placeholder+'" onkeydown="chatKey(event)" oninput="autoResize(this)"></textarea>'
    +'<button class="chat-send" id="chat-send" onclick="sendChat()" aria-label="'+L('Send','Tumizani')+'">'+sendIcon+'</button>'
    +'</div></div></div>';
  // Render immediately with whatever is in memory — prevents blank flash
  renderBubbles();
  // Restore the last active conversation from localStorage then sync with Firestore
  const _isPrem = hasPremiumFeature('chat_conversations');
  const savedConvoId = localStorage.getItem('nb_active_convo');
  loadConversations().then(()=>{
    if(savedConvoId && chatConversations.find(c=>c.id===savedConvoId)){
      // Restore the exact conversation the user was last in
      loadConversationById(savedConvoId);
      renderBubbles();
    } else if(!activeChatId && chatConversations.length===0){
      newConversation().then(()=>renderBubbles());
    } else if(!activeChatId && chatConversations.length>0){
      loadConversationById(chatConversations[0].id);
      renderBubbles();
    } else {
      renderBubbles();
    }
  });
  if(!_isPrem){
    getConvoCountFS().then(count=>{
      const indicator = g('convo-count-indicator');
      if(indicator) indicator.textContent = count+'/'+FREE_MAX_CONVOS+' chats used';
    });
  }
}
function chatSuggest(btn){
  const text=btn.dataset.txt;
  const hero=document.getElementById('chat-hero');
  const sugg=document.getElementById('chat-suggestions');
  if(hero)hero.remove();
  if(sugg)sugg.remove();
  const inp=g('chat-inp');
  if(inp){inp.value=text; sendChat();}
}

function toggleChatSheet(e){
  e.stopPropagation();
  const existing=document.querySelector('.chat-action-sheet');
  if(existing){existing.remove();return;}
  const isCW=lang==='cw';
  const sheet=document.createElement('div');
  sheet.className='chat-action-sheet';
  sheet.innerHTML=
    '<div class="chat-action-row" onclick="sheet_magicLog()">'
      +'<div class="chat-action-ico" style="background:var(--p1-bg)"><i data-lucide="wand-2" style="color:var(--p1-text)"></i></div>'
      +'<div><div style="font-weight:700">'+(isCW?'Magic Log':'Magic Log')+'</div>'
      +'<div style="font-size:.72rem;color:var(--mid);font-weight:400">'+(isCW?'Ikani mawu, AI itenga zinthu':'Paste text, AI extracts items')+'</div></div>'
    +'</div>'
    +'<div class="chat-action-row" onclick="sheet_scan()">'
      +'<div class="chat-action-ico" style="background:var(--pos-bg)"><i data-lucide="camera" style="color:var(--pos)"></i></div>'
      +'<div><div style="font-weight:700">'+(isCW?'Jambulani risiti':'Scan Receipt')+'</div>'
      +'<div style="font-size:.72rem;color:var(--mid);font-weight:400">'+(isCW?'Chithunzi → AI imawerenga chinthu':'Photo → AI reads items')+'</div></div>'
    +'</div>'
    +'<div class="chat-action-row" onclick="sheet_summary()">'
      +'<div class="chat-action-ico" style="background:#E3F2FD"><i data-lucide="pie-chart" style="color:#1565C0"></i></div>'
      +'<div><div style="font-weight:700">'+(isCW?'Chidule cha AI':'AI Summary')+'</div>'
      +'<div style="font-size:.72rem;color:var(--mid);font-weight:400">'+(isCW?'Pezani ndemanga yazachuma chanu':'Get your financial review')+'</div></div>'
    +'</div>'
    +'<div class="chat-action-row" onclick="sheet_convos()">'+'<div class="chat-action-ico" style="background:var(--gold-bg)"><i data-lucide="message-square" style="color:var(--gold-ink)"></i></div>'+'<div><div style="font-weight:700">'+(isCW?'Zokambirana':'Conversations')+'</div>'+'<div style="font-size:.72rem;color:var(--mid);font-weight:400">'+(isCW?'Sinthani zokambirana zosungidwa':'Manage saved chats')+'</div></div>'+'</div>';
  const footer=document.querySelector('.chat-footer');
  footer.style.position='relative';
  footer.appendChild(sheet);
  if(window.lucide)lucide.createIcons({nodes:[sheet]});
  document.addEventListener('click',()=>sheet.remove(),{once:true});
}
function sheet_magicLog(){document.querySelector('.chat-action-sheet')?.remove();openMagicLog();}
function sheet_convos(){document.querySelector('.chat-action-sheet')?.remove();openConvoList();}
function sheet_scan(){
  document.querySelector('.chat-action-sheet')?.remove();
  const isPrem=hasPremiumFeature('receipt_scan');
  if(!isPrem){
    const status=getPremiumStatus();
    showUpgradePrompt('receipt_scan',status);
    return;
  }
  // Open dedicated scan receipt modal
  const h='<div class="dh"></div>'
    +'<h3><i data-lucide="camera" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;color:var(--p1-text)"></i>'+(lang==="cw"?"Skani Risiti":"Scan Receipt")+'</h3>'
    +'<p style="font-size:.76rem;color:var(--mid);margin-bottom:14px">'+(lang==="cw"?"Sankhani chithunzi cha risiti kapena ngodya yanu yosindikizidwa.":"Choose a photo of your receipt or printed invoice to extract expenses.")+'</p>'
    +'<div style="display:flex;flex-direction:column;gap:10px">'
    +'<label class="magic-tile" style="flex-direction:row;padding:13px">'
    +'<i data-lucide="camera" style="width:16px;height:16px"></i> '+(lang==="cw"?"Gwiritsani Kamera":"Open Camera")+'<input type="file" accept="image/*" capture="camera" id="scan-cam-modal" style="display:none" onchange="scanReceiptFromChat(this);closeM(\'mv-u\')"></label>'
    +'<label class="magic-tile" style="flex-direction:row;padding:13px">'
    +'<i data-lucide="image" style="width:16px;height:16px"></i> '+(lang==="cw"?"Sankhani kuchokera ku Gallery":"Choose from Gallery")+'<input type="file" accept="image/*" id="scan-gallery-modal" style="display:none" onchange="scanReceiptFromChat(this);closeM(\'mv-u\')"></label>'
    +'</div>'
    +'<button class="btnG" style="width:100%;margin-top:14px" onclick="closeM(\'mv-u\')">'+(lang==="cw"?"Letsani":"Cancel")+'</button>';
  g('mb-u').innerHTML=h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-u')]});
  openM('mv-u');
}
function sheet_summary(){
  document.querySelector('.chat-action-sheet')?.remove();
  // Navigate to insights tab and trigger AI summary there
  // Or generate inline in chat as a message
  const status=getPremiumStatus();
  if(!status.isPremium && !status.isTrial){
    showUpgradePrompt('unlimited_ai',status);
    return;
  }
  const prompt=lang==='cw'
    ? 'Ndipatseni chidule cha m\'malo mwanga mwa ndalama uno mwezi.'
    : 'Give me a brief AI financial review of my spending this month.';
  const inp=g('chat-inp');
  if(inp){ inp.value=prompt; sendChat(); }
}

function renderBubbles(){
  const el=g('chat-msgs'); if(!el)return;
  const isPrem = hasPremiumFeature('chat_conversations');

  // Always show conversations header so user can always switch or start new chat
  const existingHdr = el.parentElement ? el.parentElement.querySelector('.chat-convo-header') : null;
  if(existingHdr) existingHdr.remove();
  const convo = activeChatId ? activeConversation() : null;
  const hdr = document.createElement('div');
  hdr.className='chat-convo-header';
  const usageTag = isPrem
    ? '<span style="font-size:.72rem;color:var(--pos);font-weight:700;padding:2px 7px;background:var(--pos-bg);border-radius:8px">∞ Unlimited</span>'
    : '<span id="convo-count-indicator" style="font-size:.72rem;color:var(--mid);font-weight:700;padding:2px 7px;background:var(--mist);border-radius:8px">…/'+FREE_MAX_CONVOS+' chats</span>';
  hdr.innerHTML='<button onclick="openConvoList()" style="background:none;border:none;cursor:pointer;color:var(--p1-text);padding:2px 6px;border-radius:6px;font-size:.78rem;font-weight:700;display:flex;align-items:center;gap:4px"><i data-lucide="list" style="width:13px;height:13px"></i> Chats</button>'
    +'<div class="chat-convo-header-title">'+(convo?esc(convo.title):'Chat')+'</div>'
    +'<div style="display:flex;align-items:center;gap:6px">'+usageTag+'<button class="chat-new-btn" onclick="startNewConversation()">+ New</button></div>';
  el.parentElement.insertBefore(hdr, el);
  if(window.lucide) lucide.createIcons({nodes:[hdr]});
  if(!isPrem) getConvoCountFS().then(count=>{ const ind=g('convo-count-indicator'); if(ind)ind.textContent=count+'/'+FREE_MAX_CONVOS+' chats'; });

  if(!chatHistory.length){
    const isCW=lang==='cw';
    const u=actU();
    const firstName=curUser&&curUser.displayName?curUser.displayName.split(' ')[0]:(isCW?'kumeneko':'there');
    const greeting=isCW?(curUser&&curUser.displayName?'Moni, '+firstName+'!':'Moni kumeneko!'):'Hey, '+firstName+'!';
    const subText=isCW?'Ine ndine Bajeti AI. Funsani chilichonse pa bajeti yanu!':"I'm Bajeti AI, your personal budget partner!";
    const suggs=isCW?[
      {icon:'trending-up',color:'#1B5E20',txt:'Kodi ndikuchita bwanji mwezi uno?'},
      {icon:'alert-triangle',color:'#E65100',txt:'Kodi ndikupita kupitirira bajeti yanga?'},
      {icon:'target',color:'#1565C0',txt:'Kodi ndingathe malipiro anga?'},
      {icon:'lightbulb',color:'#F57F17',txt:'Ndipatseni malangizo obisa ndalama'},
    ]:[
      {icon:'trending-up',color:'#1B5E20',txt:'How am I doing this month?'},
      {icon:'alert-triangle',color:'#E65100',txt:'Where am I overspending?'},
      {icon:'target',color:'#1565C0',txt:'Can I afford my savings goals?'},
      {icon:'lightbulb',color:'#F57F17',txt:'Give me tips to cut costs'},
    ];
    el.innerHTML=
      '<div style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:28px 20px 8px;flex-shrink:0">'
      +'<div style="width:68px;height:68px;background:linear-gradient(135deg,#4A148C,#7B1FA2);border-radius:var(--cr);display:flex;align-items:center;justify-content:center;margin-bottom:14px;box-shadow:0 8px 24px rgba(123,31,162,.28)">'
      +'<svg width="36" height="36" viewBox="0 0 52 52" fill="none"><rect x="8" y="34" width="9" height="10" rx="2.5" fill="rgba(255,255,255,0.45)"/><rect x="21" y="24" width="9" height="20" rx="2.5" fill="rgba(255,255,255,0.7)"/><rect x="34" y="14" width="9" height="30" rx="2.5" fill="#fff"/><polygon points="34,18 38.5,9 43,18" fill="#00E5FF"/></svg>'
      +'</div>'
      +'<div style="font-family:Hanken Grotesk,sans-serif;font-size:1.4rem;font-weight:800;color:var(--p1-text);margin-bottom:5px">'+greeting+'</div>'
      +'<div style="font-size:.8rem;color:var(--mid);max-width:240px;line-height:1.5">'+subText+'</div>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px 14px 4px;flex-shrink:0">'
      +suggs.map(s=>
        '<button onclick="chipSend(this)" data-txt="'+s.txt+'" style="background:var(--white);border:1.5px solid var(--border);border-radius:var(--cr);padding:11px 10px;display:flex;align-items:flex-start;gap:8px;cursor:pointer;text-align:left;box-shadow:0 2px 8px rgba(123,31,162,.06)">'
        +'<div style="width:28px;height:28px;border-radius:var(--cr-sm);background:'+s.color+'18;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">'
        +'<i data-lucide="'+s.icon+'" style="width:14px;height:14px;color:'+s.color+'"></i></div>'
        +'<span style="font-size:.72rem;font-weight:600;color:var(--ink);line-height:1.35">'+s.txt+'</span>'
        +'</button>'
      ).join('')
      +'</div>';
    if(window.lucide) lucide.createIcons({nodes:[el]});
    return;
  }

  el.innerHTML=chatHistory.map((m,idx)=>{
    const isU=m.role==='user';
    // Strip [ACTION]...[/ACTION] from display text
    const displayText=(m.text||'').replace(/\[ACTION\][\s\S]*?\[\/ACTION\]/g,'').trim();
    const safe=mdLite(displayText);
    const ts=m.ts ? new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '';
    const label=isU?'You':'Bajeti AI';
    // Delete button
    const delBtn='<button class="bubble-del-btn" onclick="deleteMessage('+idx+')" title="'+L('Delete message','Chotsani uthenga')+'" aria-label="'+L('Delete message','Chotsani uthenga')+'"><i data-lucide="x" style="width:11px;height:11px"></i></button>';

    // Date separator logic
    let dateSep='';
    const msgDate=m.ts?new Date(m.ts):null;
    const prevMsg=idx>0?chatHistory[idx-1]:null;
    const prevDate=prevMsg&&prevMsg.ts?new Date(prevMsg.ts):null;
    const isNewDay=!prevDate||(msgDate&&(
      msgDate.getFullYear()!==prevDate.getFullYear()||
      msgDate.getMonth()!==prevDate.getMonth()||
      msgDate.getDate()!==prevDate.getDate()
    ));
    if(msgDate&&isNewDay){
      const now=new Date();
      const yesterday=new Date(now); yesterday.setDate(now.getDate()-1);
      let label='';
      if(msgDate.toDateString()===now.toDateString()) label='Today';
      else if(msgDate.toDateString()===yesterday.toDateString()) label='Yesterday';
      else label=msgDate.toLocaleDateString([],{weekday:'short',day:'numeric',month:'short',year:msgDate.getFullYear()!==now.getFullYear()?'numeric':undefined});
      dateSep='<div style="display:flex;align-items:center;gap:8px;margin:10px 0 6px;padding:0 4px">'
        +'<div style="flex:1;height:1px;background:var(--border)"></div>'
        +'<span style="font-size:.72rem;font-weight:700;color:var(--mid);white-space:nowrap;padding:2px 8px;background:var(--mist);border-radius:10px">'+label+'</span>'
        +'<div style="flex:1;height:1px;background:var(--border)"></div>'
        +'</div>';
    }

    // Action card (for AI messages with pending add actions)
    let actionCard='';
    if(!isU && m.pendingAction && m.pendingAction.type==='add'){
      const pa=m.pendingAction;
      actionCard='<div class="ai-action-card">'
        +'<div class="aac-title"><i data-lucide="plus-circle" style="width:14px;height:14px"></i> Log this entry?</div>'
        +'<div class="aac-item"><span class="aac-name">'+esc(pa.item)+'</span><span class="aac-amt">MK '+Number(pa.amount).toLocaleString()+'</span>'
        +'<button class="aac-confirm" onclick="confirmAiAction('+idx+')">Add ✓</button>'
        +'<button class="aac-dismiss" onclick="dismissAiAction('+idx+')">No</button></div>'
        +'</div>';
    }
    if(!isU && m.pendingAction && m.pendingAction.type==='delete'){
      const pa=m.pendingAction;
      actionCard='<div class="ai-action-card" style="background:var(--neg-bg);border-color:var(--neg)">'
        +'<div class="aac-title" style="color:var(--neg)"><i data-lucide="trash-2" style="width:14px;height:14px"></i> Delete this entry?</div>'
        +'<div class="aac-item"><span class="aac-name">'+esc(pa.item||'Transaction')+'</span><span style="font-size:.72rem;color:var(--mid)">'+esc(pa.date||'')+(pa.amount?' · MK '+Number(pa.amount).toLocaleString():'')+'</span>'
        +'<button class="aac-confirm" style="background:linear-gradient(135deg,#B71C1C,#E53935)" onclick="confirmAiAction('+idx+')">Delete</button>'
        +'<button class="aac-dismiss" onclick="dismissAiAction('+idx+')">'+(lang==='cw'?'Letsani':'Cancel')+'</button></div>'
        +'</div>';
    }
    if(!isU && m.pendingAction && m.pendingAction.type==='bulkLog' && Array.isArray(m.pendingAction.items)){
      const pa=m.pendingAction;
      actionCard='<div class="ai-action-card">'
        +'<div class="aac-title"><i data-lucide="plus-circle" style="width:14px;height:14px"></i> Log '+pa.items.length+' item'+(pa.items.length>1?'s':'')+'?</div>'
        +pa.items.map(function(it){return '<div class="aac-item"><span class="aac-name">'+esc(it.item)+'</span><span class="aac-amt">MK '+Number(it.amount||0).toLocaleString()+'</span></div>';}).join('')
        +'<div style="display:flex;gap:8px;margin-top:4px">'
        +'<button class="aac-confirm" onclick="confirmAiAction('+idx+')" style="flex:1">Log All ✓</button>'
        +'<button class="aac-dismiss" onclick="dismissAiAction('+idx+')">No</button></div>'
        +'</div>';
    }
    return dateSep+'<div class="bubble-wrap '+(isU?'user':'ai')+'" ontouchstart="bubbleLongPress(this)" ontouchend="bubbleLongPressEnd(this)">'
      +delBtn
      +'<div class="bubble '+(isU?'user':'ai')+'">'+safe+'</div>'
      +(actionCard?'<div style="max-width:84%;align-self:'+(isU?'flex-end':'flex-start')+'">'+actionCard+'</div>':'')
      +'<span class="bubble-ts">'+label+(ts?' • '+ts:'')+'</span>'
    +'</div>';
  }).join('');
  if(window.lucide) lucide.createIcons({nodes:[el]});
  setTimeout(()=>{el.scrollTop=el.scrollHeight;},30);
}


// -- Message delete --
function deleteMessage(idx){
  chatHistory.splice(idx,1);
  saveChatHistory();
  syncActiveConvo();
  renderBubbles();
}
let _longPressTimer=null;
function bubbleLongPress(el){ _longPressTimer=setTimeout(()=>{el.classList.add('long-pressed');},450); }
function bubbleLongPressEnd(el){ clearTimeout(_longPressTimer); }

// -- AI action handling (add/delete entries from chat) --
// The model's [ACTION] JSON is untrusted input. Validate shape and types, and for deletes take the details from OUR
// transaction (looked up by id) instead of trusting what the model wrote, so the confirm card shows what will really be deleted.
function sanitizeAiAction(a){
  if(!a || typeof a!=='object') return null;
  const CATS=['Food','Household','Personal','Transport','Other'];
  const cleanItem=function(x){
    const name=String(x&&x.item!=null?x.item:'').trim().slice(0,80);
    const amt=Number(x&&x.amount);
    if(!name || !isFinite(amt) || amt<=0 || amt>99999999) return null;
    const date=(x.date && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date)))?String(x.date):today();
    const type=(x.entryType==='income'||x.type==='income')?'income':'expense';
    const cat=CATS.indexOf(x.cat)>=0?x.cat:catOf(name);
    return {item:name,amount:Math.round(amt*100)/100,date:date,entryType:type,type:type,cat:cat};
  };
  if(a.type==='add'){
    const it=cleanItem(a); return it?Object.assign({type:'add'},{item:it.item,amount:it.amount,date:it.date,entryType:it.entryType,cat:it.cat}):null;
  }
  if(a.type==='delete'){
    const id=String(a.id||'');
    if(!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
    const px=lPx.find(function(x){return x.id===id && !x.deleted;});
    if(!px) return null;
    return {type:'delete',id:id,item:px.item,date:px.date,amount:Number(px.amount)||0};
  }
  if(a.type==='bulkLog'){
    if(!Array.isArray(a.items)) return null;
    const items=a.items.slice(0,30).map(cleanItem).filter(Boolean).map(function(it){return {item:it.item,amount:it.amount,type:it.type,cat:it.cat};});
    return items.length?{type:'bulkLog',items:items}:null;
  }
  return null;
}
function parseAiAction(text){
  const m=text.match(/\[ACTION\]([\s\S]*?)\[\/ACTION\]/);
  if(!m) return null;
  try{ return sanitizeAiAction(JSON.parse(m[1].trim())); }catch(e){ return null; }
}
function confirmAiAction(msgIdx){
  const msg=chatHistory[msgIdx];
  if(!msg||!msg.pendingAction) return;
  const pa=msg.pendingAction;
  if(pa.type==='add'){
    const now=new Date();
    const dStr=pa.date||today();
    const ts=now.getTime();
    const userId=actU().id;
    addPx({item:pa.item,date:dStr,timestamp:ts,amount:Number(pa.amount),notes:'',userId,type:pa.entryType||'expense',cat:pa.cat||catOf(pa.item),recurring:false})
      .then(function(ok){ if(ok) toast((lang==='cw'?'Cholembedwa: ':'Logged: ')+pa.item+'.','s'); });
  } else if(pa.type==='delete'){
    updPx(pa.id,{deleted:true,deletedAt:new Date().toISOString()}); // soft-delete to trash
    toast(lang==='cw'?'Chotsedwa':'Deleted','s');
  } else if(pa.type==='bulkLog'){
    let ts=Date.now();
    const userId=actU().id;
    Promise.all((pa.items||[]).map(function(it){
      return addPx({item:String(it.item||'').trim(),date:today(),timestamp:ts++,amount:Number(it.amount)||0,notes:'Added via Magic Log ✨',userId,type:it.type==='income'?'income':'expense',cat:it.cat||'Other',recurring:false});
    })).then(function(r){
      const n=r.filter(Boolean).length;
      if(n) toast(lang==='cw'?n+' zolemba zalembedwa.':n+' item'+(n>1?'s':'')+' logged.','s');
    });
  }
  msg.pendingAction=null;
  saveChatHistory();
  syncActiveConvo(); // async — fire and forget is fine here
  renderBubbles();
}
function dismissAiAction(msgIdx){
  const msg=chatHistory[msgIdx];
  if(!msg) return;
  msg.pendingAction=null;
  saveChatHistory();
  syncActiveConvo(); // async — fire and forget
  renderBubbles();
}

// ── Conversations stored in Firestore ──
function convosRef(){ return db.collection('households').doc(hhId).collection('_conversations'); }

async function loadConversations(){
  if(!hhId){ chatConversations=[]; return; }
  try{
    const snap = await convosRef().orderBy('createdAt','desc').limit(20).get();
    chatConversations = snap.docs.map(d=>({id:d.id,...d.data()}));
  }catch(e){ chatConversations=[]; }
}

async function saveConversationToFS(convo){
  if(!hhId) return;
  const data = {
    title: convo.title || 'New chat',
    createdAt: convo.createdAt || Date.now(),
    updatedAt: Date.now(),
    messages: (convo.messages||[]).slice(-50)
  };
  await convosRef().doc(convo.id).set(data, {merge:true}).catch(()=>{});
}

async function newConversation(){
  const isPrem = hasPremiumFeature('chat_conversations');
  if(!isPrem){
    const count = await getConvoCountFS();
    if(count >= FREE_MAX_CONVOS){ showConvoLimitWall(count); return null; }
  }
  const id = 'cv_'+Date.now()+'_'+(Math.random().toString(36).slice(2,7));
  const convo = {id, title:'New chat', createdAt:Date.now(), messages:[]};
  chatConversations.unshift(convo);
  activeChatId = id;
  chatHistory = [];
  if(!isPrem) await incConvoCountFS();
  await saveConversationToFS(convo);
  return convo;
}

function activeConversation(){
  if(!activeChatId) return null;
  return chatConversations.find(c=>c.id===activeChatId)||null;
}

async function syncActiveConvo(){
  if(!activeChatId) return;
  const convo = activeConversation();
  if(!convo) return;
  convo.messages = chatHistory.slice(-50);
  if(convo.title==='New chat'||!convo.title){
    const first = chatHistory.find(m=>m.role==='user');
    if(first) convo.title = first.text.slice(0,40)+(first.text.length>40?'…':'');
  }
  await saveConversationToFS(convo);
}

async function deleteConversation(id){
  const isPrem = hasPremiumFeature('chat_conversations');
  chatConversations = chatConversations.filter(c=>c.id!==id);
  if(activeChatId===id){
    activeChatId=null; chatHistory=[];
    if(chatConversations.length){ activeChatId=chatConversations[0].id; chatHistory=(chatConversations[0].messages||[]).slice(); }
  }
  if(hhId){
    await convosRef().doc(id).delete().catch(()=>{});
    if(!isPrem) await decConvoCountFS();
  }
}

function loadConversationById(id){
  const convo = chatConversations.find(c=>c.id===id);
  if(!convo) return;
  activeChatId = id;
  chatHistory = (convo.messages||[]).slice();
  localStorage.setItem('nb_active_convo', id);
}

async function getConvoCountFS(){
  const data = await getHHUsage();
  return data.convoCount || 0;
}

async function incConvoCountFS(){
  if(!hhId) return;
  const data = await getHHUsage();
  await hhUsageRef().set({
    convoCount: (data.convoCount||0) + 1,
    msgCount: data.msgCount || 0,
    msgDate: data.msgDate || '',
    magicCount: data.magicCount || 0,
    scanCount: data.scanCount || 0,
    summCount: data.summCount || 0
  }, {merge:true}).catch(()=>{});
}

async function decConvoCountFS(){
  if(!hhId) return;
  const data = await getHHUsage();
  await hhUsageRef().set({convoCount: Math.max(0,(data.convoCount||0)-1)}, {merge:true}).catch(()=>{});
}

// -- Multiple conversations (all users, Firestore-backed) --
async function startNewConversation(){
  await syncActiveConvo(); // save current before starting new
  const convo = await newConversation();
  if(convo) rChat();
}
async function openConvoList(){
  await loadConversations();
  const isPrem=hasPremiumFeature('chat_conversations');
  const count = await getConvoCountFS();
  const usageLine = isPrem
    ? '<span style="font-size:.72rem;color:var(--pos);font-weight:700;padding:2px 8px;background:var(--pos-bg);border-radius:var(--cr-sm);margin-left:auto">∞ Unlimited</span>'
    : '<span style="font-size:.72rem;color:var(--mid);font-weight:700;padding:2px 8px;background:var(--mist);border-radius:var(--cr-sm);margin-left:auto">'+count+'/'+FREE_MAX_CONVOS+' used</span>';
  let h='<div class="dh"></div>'
    +'<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><h3 style="margin:0"><i data-lucide="message-square" style="width:16px;height:16px;margin-right:6px;vertical-align:middle;color:var(--p1-text)"></i>'+(lang==='cw'?'Zokambirana':'Conversations')+'</h3>'+usageLine+'</div>';
  if(!chatConversations.length){
    h+='<p style="font-size:.82rem;color:var(--mid);text-align:center;padding:20px 0">'+(lang==='cw'?'Palibe zokambirana zosungidwa pano.':'No saved conversations yet.')+'</p>';
  } else {
    h+='<div class="chat-convo-list">';
    chatConversations.forEach((c)=>{
      const isActive=c.id===activeChatId;
      const dateStr=new Date(c.createdAt).toLocaleDateString([],{month:'short',day:'numeric'});
      h+='<div class="chat-convo-item'+(isActive?' on':'')+'" data-cid="'+esc(c.id)+'" onclick="switchConvoById(this)">'  
        +'<div class="chat-convo-title">'+esc(c.title)+'</div>'
        +'<span class="chat-convo-date">'+dateStr+'</span>'
        +'<button class="chat-convo-del" onclick="event.stopPropagation();delConvoById(this.closest(\'[data-cid]\')||this)" title="'+L('Delete','Chotsani')+'" aria-label="'+L('Delete','Chotsani')+'"><i data-lucide="x" style="width:11px;height:11px"></i></button>'
        +'</div>';
    });
    h+='</div>';
  }
  h+='<button class="btnM" style="width:100%;margin-top:12px" onclick="startNewConversation();closeM(&quot;mv-u&quot;)">+ New Conversation</button>'
    +'<button class="btnG" style="width:100%;margin-top:8px" onclick="closeM(\'mv-u\')">Close</button>';
  g('mb-u').innerHTML=h;
  if(window.lucide) lucide.createIcons({nodes:[g('mb-u')]});
  openM('mv-u');
}
function switchConvoById(el){
  const id = el.closest('[data-cid]')?.dataset?.cid || el.dataset?.cid;
  if(id) switchConversation(id);
}
function delConvoById(el){
  const id = el.closest('[data-cid]')?.dataset?.cid || el.dataset?.cid;
  if(id) deleteConvoFromList(id);
}
async function switchConversation(id){
  await syncActiveConvo(); // save current before switching
  loadConversationById(id);
  closeM('mv-u');
  rChat();
}
async function deleteConvoFromList(id){
  await deleteConversation(id);
  openConvoList(); // re-render list
}

function chipSend(el){ const inp=g('chat-inp'); if(!inp)return; inp.value=el.textContent; autoResize(inp); sendChat(); }
function chatKey(e){ if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();sendChat();} }
function autoResize(el){ el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,110)+'px'; }
function clearChat(){
  if(activeChatId){
    deleteConversation(activeChatId).then(()=>renderBubbles());
    return;
  }
  chatHistory=[]; localStorage.removeItem(chatStorageKey()); renderBubbles();
}

function buildCtx(){
  const now=new Date();
  // Use the active budget period (salary-day aware) — same as totSp/totIn/iSpent
  const moPx=lPx.filter(p=>p.date&&isTM(p.date)&&!p.deleted);
  const spent=moPx.filter(p=>p.type!=='income').reduce((s,p)=>s+p.amount,0);
  const income=moPx.filter(p=>p.type==='income').reduce((s,p)=>s+p.amount,0);
  const byItem={};
  moPx.filter(p=>p.type!=='income').forEach(p=>{byItem[p.item]=(byItem[p.item]||0)+p.amount;});
  const items=lCfg.items.map(it=>({item:it.name,budget:it.budget,spent:byItem[it.name]||0,status:(byItem[it.name]||0)>it.budget?'OVER BUDGET':(byItem[it.name]||0)>(it.budget*.8)?'Near limit':'OK'})).filter(it=>it.spent>0||it.budget>0).slice(0,20);
  const byMember={};
  lCfg.users.forEach(u=>{byMember[u.name]=moPx.filter(p=>p.userId===u.id&&p.type!=='income').reduce((s,p)=>s+p.amount,0);});
  const me=actU();
  const authName=curUser&&(curUser.displayName||curUser.email)||me.name;
  
  // Build transaction list with IDs so AI can reference them for deletion.
  // FIX: exclude trashed (soft-deleted) entries -- previously this included
  // deleted purchases with no flag, so the AI would report them as live
  // transactions when asked "show me recent transactions".
  const recentWithIds = lPx.filter(p=>!p.deleted).slice(0,15).map(p=>({id:p.id,item:p.item,amount:p.amount,date:p.date,by:uById(p.userId).name,type:p.type}));
  const validItems = lCfg.items.map(it=>it.name);

  return `You are Bajeti AI, a warm, personal household budget assistant for a Malawian family using the Bajeti Yanga app.
Bajeti Yanga was built by Rodart Creatives, a Malawian software studio. This is background knowledge only -- do NOT mention Rodart Creatives, "the team", "the developers", or who built the app in your replies. The ONLY exception is if the user explicitly asks a direct question like "who made this app" / "who built this" -- even then, answer in one short clause and move on. Never bring it up unprompted, including in greetings, sign-offs, or as an aside.
You are talking to ${authName} (household member name: ${me.name}).
The household has ${lCfg.users.length} member(s): ${lCfg.users.map(u=>u.name).join(', ')}.
Always address the user by their first name (${me.name.split(' ')[0]}) naturally in conversation.
Respond in ${lang==='cw'?'Chichewa':'English'}. Be warm, encouraging, and specific -- reference their actual numbers and names.
Use MK (Malawian Kwacha). Use bullet points for lists. Bold key numbers.
Keep every reply to 3-5 sentences or a short list -- this is a hard limit, not a target to aim under. If you have more to say than that, cut it down rather than running long. Never give generic advice -- always tie it to their real data.

=== BUDGETING PRINCIPLES (apply these, don't just cheer the user on) ===
Ground your coaching in well-established personal-finance practice, adapted to a Malawian household living on a monthly salary cycle:
- Needs vs wants: point out when "Household"/"Food" essentials are being crowded out by discretionary items, before the month runs out.
- A rough needs/wants/savings split (something like 50/30/20) is a useful reference point to mention, not a rule to force -- their actual item budgets are ground truth.
- Zero-based thinking: every Kwacha of income should be assigned to a category, a goal, or savings -- flag if a large share of income logged has no matching budget item.
- Build a small emergency buffer before aggressively funding non-essential savings goals, and say so plainly if none exists yet.
- Irregular/informal income: if income entries are lumpy rather than one fixed salary, suggest budgeting off the lowest recent month rather than the average, so a slow month doesn't break the plan.
- Recurring bills (rent, electricity, data/airtime) should be the first thing budgeted for at the start of each period, before discretionary spend -- flag it if they aren't.
- Prefer specific, small, doable next actions ("move MK X from Y to your goal") over vague encouragement like "keep saving."
- Never suggest borrowing, loans, or debt to cover a shortfall -- point them toward trimming a specific category instead.

=== APP NAVIGATION (use this to guide the user to the right place) ===
When the user asks "how do I..." or seems stuck on something the app can do, tell them exactly where to tap. Use this map:
- Change salary day / budget period -> Settings (Profile tab) > Household > Salary Day
- Add or edit a budget item / category -> Settings > Household > Items & Budgets
- Add or remove a household member -> Settings > Household > Members
- Set a savings goal -> Settings > Household > Savings Goals
- Set the overall monthly budget cap -> Settings > Household > Monthly Budget Cap
- Switch language (English/Chichewa) -> Settings > General > Language
- Turn on dark mode -> Settings > General > Dark Mode
- Set up fingerprint/Face unlock -> Settings > Security > Biometrics
- Export data as CSV -> Settings > Data > Export CSV
- Export a PDF report (Premium) -> Settings > Data > Export PDF
- Bulk-log multiple transactions from a text/SMS -> Magic Log (sparkle/wand icon, usually on Home or Log)
- Upgrade to Premium -> tap the "Upgrade" chip on the Profile tab, or Settings > Premium
- Delete account -> Settings > Data > Delete Account (30-day recovery window)

=== SUPPORT & CONTACT ===
Only mention Rodart Creatives' WhatsApp support (+265 888 029 029, also in Settings > Help & Support) if the user is frustrated, stuck on something you genuinely can't resolve, reports a bug, or explicitly asks for human help. Do not mention it in any other reply.

=== ACTIONS ===
You can add or delete log entries when the user asks. Append ONE JSON block at the very end of your reply (after your text) when an action is needed. Never put JSON mid-reply. Format:

To add an expense:
[ACTION]{"type":"add","item":"Transport","amount":5000,"date":"${today()}","entryType":"expense"}[/ACTION]

To add income:
[ACTION]{"type":"add","item":"Salary/Income","amount":50000,"date":"${today()}","entryType":"income"}[/ACTION]

To delete (only after user confirms — show them the entry first and ask):
[ACTION]{"type":"delete","id":"TRANSACTION_ID_HERE"}[/ACTION]

Rules:
- For the "item" field: ALWAYS use the exact name the user mentioned (e.g. "plug", "chitenje", "fertilizer"). Never use "Other" as an item name. "Other" is only a category, not a name.
- For budget tracking, map the item to the closest name in this list if possible: ${JSON.stringify(validItems)}. But if nothing matches, keep the user's real word as the item name.
- For delete, always identify the transaction from the list below and confirm with the user FIRST before outputting the delete action.
- Never output more than one [ACTION] block per reply.
- If the user asks to delete but is vague (e.g. "delete my transport"), list matching entries and ask which one.

=== Household data -- ${now.toDateString()} ===
Monthly budget cap: MK ${lCfg.overallBudget.toLocaleString()}
Spent this month: MK ${spent.toLocaleString()} (${Math.round(spent/lCfg.overallBudget*100)}% of cap)
Income logged: MK ${income.toLocaleString()}
Remaining: MK ${Math.max(0,lCfg.overallBudget-spent).toLocaleString()}

Spending by member: ${JSON.stringify(byMember)}
Item budgets & spending: ${JSON.stringify(items)}
Savings goals: ${JSON.stringify((lCfg.goals||[]).map(gl=>({name:gl.name,target:gl.target,saved:gl.saved,pct:Math.round(gl.saved/gl.target*100)+'%'})))}
Last 15 transactions (with IDs): ${JSON.stringify(recentWithIds)}`;
}

async function sendChat(){
  if(chatBusy)return;
  if(_aiInFlight){toast((lang==='cw'?'Chonde dikirani.':'Please wait.'),'e');return;}
  // Check free tier AI limit from Firestore (device-switch safe)
  const status=getPremiumStatus();
  if(!status.isPremium){
    const used = await getAiUsageTodayFS('msg');
    if(used >= FREE_DAILY_MSGS){
      toast((lang==='cw'?'Malire a AI a lero afika (':'Daily AI limit reached (')+FREE_DAILY_MSGS+'/day). Upgrade for unlimited!','e');
      showUpgradePrompt('unlimited_ai',status);
      return;
    }
  }
  const inp=g('chat-inp'), sendBtn=g('chat-send');
  const msg=(inp?inp.value.trim():''); if(!msg)return;
  
  chatBusy=true; _aiInFlight=true;
  if(inp){inp.value='';inp.style.height='auto';inp.disabled=true;}
  if(sendBtn)sendBtn.disabled=true;
  
  chatHistory.push({role:'user',text:msg,ts:Date.now()});
  saveChatHistory();
  renderBubbles();
  
  const msgsEl=g('chat-msgs');
  if(msgsEl){const w=document.createElement('div');w.className='bubble-wrap ai';w.id='typing-ind';w.innerHTML='<div class="bubble ai typing"><span>&#x25CF;</span><span>&#x25CF;</span><span>&#x25CF;</span></div>';msgsEl.appendChild(w);msgsEl.scrollTop=msgsEl.scrollHeight;}
  
  try {
    // -- Cloudflare Worker proxy -- API key never exposed in browser --
    const url = "https://nyumba-ai.kabangorodrick6.workers.dev/chat";
    
    // Get Firebase ID token to authenticate the worker call

    // Map history to Gemini format (user/model)
    const geminiMessages = chatHistory.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }]
    }));

    const payload = {
      contents: geminiMessages,
      systemInstruction: { parts: [{ text: buildCtx() }] }
    };

    // Implemented exponential backoff for reliability
    const delays = [1000, 2000, 4000, 8000, 16000];
    let data = null;
    let lastErr = null;

    for (let i = 0; i <= delays.length; i++) {
      let retryable = true; // network errors are retryable; HTTP errors only for 429/503
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: await aiHeaders('msg'),
          body: JSON.stringify(payload)
        });
        let resData = null;
        try { resData = await res.json(); } catch(_) { /* non-JSON body (e.g. a 502 page) */ }

        if (!res.ok) {
           lastErr = _aiHttpErr(res, resData);
           retryable = (res.status === 503 || (res.status === 429 && lastErr.aiCode !== 'quota'));
           throw lastErr;
        }
        data = resData;
        break;
      } catch (err) {
        lastErr = err;
        if (!retryable || (err && err.aiCode === 'auth') || i === delays.length) throw lastErr;
      }
      if (i < delays.length) await new Promise(r => setTimeout(r, delays[i]));
    }

    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || (lang==='cw'?'Pepani, pali chovuta. Chonde yesaninso.':'Sorry, something went wrong. Please try again.');
    
    // Only count successful responses against the daily limit
    if(!getPremiumStatus().isPremium){
      incAiUsageTodayFS('msg'); // Firestore-backed, device-switch safe
      incAiUsageToday();   // localStorage cache for instant UI updates
    }

    // Parse any action from the reply
    const action = parseAiAction(reply);
    const msgObj = {role:'assistant', text:reply, ts:Date.now()};
    if(action) msgObj.pendingAction = action;
    chatHistory.push(msgObj);
    saveChatHistory();
    await syncActiveConvo();
    
  } catch(err) {
    const isCW = lang === 'cw';
    let errorMsg = isCW
      ? 'Bajeti AI ili otanganidwa, chonde yesaninso posachedwa.'
      : 'Bajeti AI is busy right now, please try again in a moment.';

    errorMsg = aiFailMessage(err, isCW) || errorMsg;

    chatHistory.push({role:'assistant', text:errorMsg, ts:Date.now()});
  }
  
  const td=g('typing-ind'); if(td)td.remove();
  chatBusy=false; _aiInFlight=false;
  // Re-fetch these since user may have navigated away during async call
  const inpNow=g('chat-inp'), sendBtnNow=g('chat-send');
  if(inpNow)inpNow.disabled=false;
  if(sendBtnNow)sendBtnNow.disabled=false;
  if(g('chat-msgs'))renderBubbles();
  // Do not auto-focus input — prevents keyboard popping up on tablet after every response
}

// -- Magic Log (Extract Transactions) --
function openMagicLog() {
  const t = tx();
  const isPrem = hasPremiumFeature('receipt_scan');
  let h = '<div class="dh"></div>';
  h += '<div class="magic-modal-header"><div class="mmh-top"><span class="mmh-ico"><i data-lucide="sparkles" style="width:17px;height:17px;color:#2A1400"></i></span><span class="mmh-title">'+(lang==='cw'?'Kulemba Mwachangu':'Magic Log')+'</span></div><div class="mmh-sub">'+(lang==='cw'?'Jambulani risiti, ikani SMS ya Mpamba kapena Airtel Money, kapena lembani zomwe mwagula.':'Scan a receipt, paste an Airtel Money or Mpamba SMS, or type what you bought.')+'</div></div>';

  // Camera scan row (Premium)
  h += '<div style="display:flex;gap:8px;margin-bottom:10px">';
  if(isPrem){
    h += '<label class="magic-tile"><i data-lucide="camera" style="width:19px;height:19px"></i> '+(lang==='cw'?'Jambulani Risiti':'Scan receipt')+'<input type="file" accept="image/*" capture="camera" id="receipt-cam" style="display:none" onchange="scanReceipt(this)"></label>';
    h += '<label class="magic-tile"><i data-lucide="image" style="width:19px;height:19px"></i> '+(lang==='cw'?'Zithunzi':'Gallery')+'<input type="file" accept="image/*" id="receipt-gal" style="display:none" onchange="scanReceipt(this)"></label>';
  } else {
    h += '<button onclick="showPremiumPage();closeM(&quot;mv-magic&quot;)" class="magic-tile" style="width:100%;flex-direction:row"><i data-lucide="camera" style="width:16px;height:16px"></i> '+(lang==='cw'?'Jambulani Risiti':'Scan receipt')+' <i data-lucide="gem" style="width:14px;height:14px"></i> (Premium)</button>';
  }
  h += '</div>';

  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><div style="flex:1;height:1px;background:var(--border)"></div><span style="font-size:.72rem;color:var(--mid);font-weight:600">'+(lang==='cw'?'kapena lembani':'or type')+'</span><div style="flex:1;height:1px;background:var(--border)"></div></div>';
  h += '<textarea class="fi" id="magic-input" rows="4" placeholder="'+(lang==='cw'?'Mwachitsanzo: Ndagula 5k ufa ndi 2k pa mabasi.':'e.g. Spent 5k on maize and 2k on transport.')+'" style="resize:none;margin-bottom:10px;"></textarea>';
  h += '<div id="magic-results" style="margin-bottom:10px;"></div>';
  h += '<div style="display:flex;gap:8px"><button class="btnG" style="flex:1" onclick="closeM(&quot;mv-magic&quot;)">'+t.cancel+'</button><button class="btnM" id="magic-btn-process" style="flex:2;background:linear-gradient(135deg,#7B1FA2,#F57F17);display:flex;align-items:center;justify-content:center;gap:6px" onclick="processMagicLog()"><i data-lucide="sparkles" style="width:15px;height:15px"></i> '+(lang==='cw'?'Werengani':'Extract')+'</button></div>';
  g('mb-magic').innerHTML = h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-magic')]});
  openM('mv-magic');
}

// Chat-context receipt scan — shows scanning bubble and posts results as a chat message
// Shared instruction injected into every AI item-extraction prompt (Magic Log,
// receipt scan, chat receipt scan). Root cause of the "Others" naming bug: the
// old prompts told the AI to "match items to these categories" using
// lCfg.items.map(i=>i.name) as the candidate list -- but that list includes the
// literal budget item named "Other" (from DEF_ITEMS), so the AI would frequently
// just return item:"Other" for anything it wasn't fully sure about, destroying
// the real item name permanently. This rule tells the AI explicitly: "Other" is
// a category, never an item name, and the real item name must always be kept.
const AI_ITEM_NAMING_RULE = 'IMPORTANT: "item" must always be the actual real-world name of the thing purchased (e.g. "tomatoes", "bus fare", "phone charger") -- NEVER the word "Other" or "Unknown". "Other" is only a category, never an item name. If you are unsure which category an item belongs to, just describe the item as best as you can and leave categorization to the app.';

async function scanReceiptFromChat(input){
  if(!input.files||!input.files[0])return;
  const file=input.files[0];
  const msgsEl=g('chat-msgs');

  // Show scanning bubble in chat immediately
  const scanWrap=document.createElement('div');
  scanWrap.className='bubble-wrap ai';
  scanWrap.id='scan-progress-bubble';
  scanWrap.innerHTML='<div class="bubble ai typing" style="display:flex;align-items:center;gap:8px">'
    +'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
    +(lang==='cw'?'Kuwerenga risiti ndi AI...':'Scanning receipt with AI...')
    +'</div><span class="bubble-ts">Bajeti AI</span>';
  if(msgsEl){msgsEl.appendChild(scanWrap);msgsEl.scrollTop=msgsEl.scrollHeight;}

  const reader=new FileReader();
  reader.onload=async function(e){
    const base64=e.target.result.split(',')[1];
    const mime=file.type||'image/jpeg';
    const prompt='This is a receipt from Malawi. Extract ALL line items as a JSON array. Each object needs: {item: string, amount: number, type: "expense"}. '+AI_ITEM_NAMING_RULE+' Categories for reference only (do not use as item names): '+lCfg.items.map(function(i){return i.name;}).join(', ')+'. Return ONLY valid JSON array, no markdown, no explanation.';
    try{
      const url='https://nyumba-ai.kabangorodrick6.workers.dev/chat';
      const payload={contents:[{parts:[{text:prompt},{inline_data:{mime_type:mime,data:base64}}]}]};
      const res=await fetch(url,{method:'POST',headers: await aiHeaders('scan'),body:JSON.stringify(payload)});
      let data=null; try{ data=await res.json(); }catch(_){}
      if(!res.ok || !data || data.error) throw _aiHttpErr(res, data);
      const resultText=data.candidates?.[0]?.content?.parts?.[0]?.text||'[]';
      const clean=resultText.replace(/```json|```/g,'').trim();
      let items=JSON.parse(clean);
      if(!Array.isArray(items)||!items.length)throw new Error('No items found');
      // Guard against the AI returning "Other" (or an empty string) as the item
      // name itself -- this is what silently destroyed real item names before.
      // We keep the real name whenever possible and only fall back to a clearly
      // labeled placeholder, plus we now always assign a real category via catOf
      // rather than leaving cat undefined (which previously meant every receipt
      // item from this path had NO category logic applied at all).
      items=items.map(function(tx){
        const rawItem=String(tx.item||'').trim();
        const isBadName=!rawItem || rawItem.toLowerCase()==='other' || rawItem.toLowerCase()==='unknown';
        const safeItem=isBadName?(lang==='cw'?'Chinthu chosadziwika':'Unrecognized item'):rawItem;
        return {...tx,item:safeItem,cat:catOf(safeItem,tx.cat)};
      });

      // Remove scanning bubble
      const pb=document.getElementById('scan-progress-bubble'); if(pb)pb.remove();

      // Build result message and save to chat history
      let msg=(lang==='cw'?'&#10024; Ndasankha zinthu '+items.length+' pachithunzi cha risiti:':'&#10024; Found '+items.length+' item(s) from your receipt:')+'\n\n';
      items.forEach(function(tx){msg+='\u2022 **'+String(tx.item||'')+'**: MK '+Number(tx.amount||0).toLocaleString()+'\n';});
      msg+='\n'+(lang==='cw'?'Mukufuna kuti ndizilembe? Nenani kuti "zilembeni" ndipo ndiziwonjezera ku zotuluka zanu.':'Want me to log these? Just say "log them" and I\'ll add them to your expenses.');

      const msgObj={role:'assistant',text:msg,ts:Date.now(),pendingAction:{type:'bulkLog',items:items}};
      chatHistory.push(msgObj);
      saveChatHistory();
      syncActiveConvo();
      renderBubbles();

      pendingMagicTxs=items;
      toast(lang==='cw'?'Risiti yajambulidwa!':'Receipt scanned!','s');
    }catch(err){
      const pb=document.getElementById('scan-progress-bubble'); if(pb)pb.remove();
      const errMsg=aiFailMessage(err, lang==='cw') || (lang==='cw'?'Pepani, sindinakwanitsa kuwerenga risiti. Yesaninso kapena lembani pamanja.':'Sorry, I couldn\'t read that receipt. Try again or type the items manually.');
      chatHistory.push({role:'assistant',text:errMsg,ts:Date.now()});
      saveChatHistory();
      renderBubbles();
    }
  };
  reader.readAsDataURL(file);
}

async function scanReceipt(input){
  if(!input.files||!input.files[0])return;
  if(_aiInFlight){toast((lang==='cw'?'Chonde dikirani.':'Please wait.'),'e');return;}
  const _ss=getPremiumStatus();if(!_ss.isPremium){const _su=await getAiUsageTodayFS('scan');if(_su>=FREE_DAILY_SCAN){toast((lang==='cw'?'Malire ojambula risiti afika (':'Receipt scan limit (')+FREE_DAILY_SCAN+'/day) reached.','e');return;}}
  _aiInFlight=true;
  const file=input.files[0];
  const resultsEl=g('magic-results');
  if(resultsEl){resultsEl.innerHTML='<div class="magic-scan-card"><span class="msc-ico"><i data-lucide="scan" style="width:18px;height:18px;color:#2A1400"></i></span><div style="flex:1"><div class="msc-label">'+(lang==='cw'?'Tikuwerenga risiti yanu...':'Reading your receipt...')+'</div><div class="msc-track"><div class="msc-bar"></div></div></div></div>';if(window.lucide)lucide.createIcons({nodes:[resultsEl]});}
  const btn=g('magic-btn-process'); if(btn){btn.disabled=true;btn.innerHTML='<i data-lucide="loader-2" class="spin-ico" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i> '+(lang==='cw'?'Kuwerenga...':'Scanning...');if(window.lucide)lucide.createIcons({nodes:[btn]});}

  const reader=new FileReader();
  reader.onload=async function(e){
    const base64=e.target.result.split(',')[1];
    const mime=file.type||'image/jpeg';
    const prompt='This is a receipt from Malawi. Extract ALL line items as a JSON array. Each object needs: {item: string, amount: number, type: "expense"}. '+AI_ITEM_NAMING_RULE+' Categories for reference only (do not use as item names): '+lCfg.items.map(function(i){return i.name;}).join(', ')+'. Return ONLY valid JSON array, no markdown, no explanation.';
    try{
      const url='https://nyumba-ai.kabangorodrick6.workers.dev/chat';
      const payload={contents:[{parts:[{text:prompt},{inline_data:{mime_type:mime,data:base64}}]}]};
      const res=await fetch(url,{method:'POST',headers: await aiHeaders('scan'),body:JSON.stringify(payload)});
      let data=null; try{ data=await res.json(); }catch(_){}
      if(!res.ok || !data || data.error) throw _aiHttpErr(res, data);
      const resultText=data.candidates?.[0]?.content?.parts?.[0]?.text||'[]';
      const clean=resultText.replace(/```json|```/g,'').trim();
      pendingMagicTxs=JSON.parse(clean);
      if(!Array.isArray(pendingMagicTxs)||!pendingMagicTxs.length)throw new Error('No items found');
      // Guard against the AI returning "Other"/empty as the item name itself --
      // see AI_ITEM_NAMING_RULE comment above for the full root-cause explanation.
      pendingMagicTxs=pendingMagicTxs.map(tx=>{
        const rawItem=String(tx.item||'').trim();
        const isBadName=!rawItem || rawItem.toLowerCase()==='other' || rawItem.toLowerCase()==='unknown';
        const safeItem=isBadName?(lang==='cw'?'Chinthu chosadziwika':'Unrecognized item'):rawItem;
        return {...tx,item:safeItem,cat:catOf(safeItem,tx.cat)};
      });
      if(resultsEl){resultsEl.innerHTML=renderMagicResults(); if(window.lucide)lucide.createIcons({nodes:[resultsEl]});}
      if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="save" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> Save All '+pendingMagicTxs.length+' Items'; if(window.lucide)lucide.createIcons({nodes:[btn]}); btn.setAttribute('onclick','saveMagicTxs()');}
      if(!getPremiumStatus().isPremium) incAiUsageTodayFS('scan');
      _aiInFlight=false;
      toast(lang==='cw'?'Risiti yawerengedwa!':'Receipt scanned!','s');
    }catch(err){
      if(resultsEl)resultsEl.innerHTML='';
      if(btn){btn.disabled=false;btn.innerHTML='<i data-lucide="sparkles" style="width:15px;height:15px;margin-right:5px;vertical-align:middle"></i> '+(lang==='cw'?'Tulutsani':'Extract');if(window.lucide)lucide.createIcons({nodes:[btn]});}
      _aiInFlight=false;
      toast(aiFailMessage(err, lang==='cw') || 'Could not read receipt.','e');
    }
  };
  reader.readAsDataURL(file);
}


const CAT_OPTS=[{key:'Food',icon:'utensils',label:'Food'},{key:'Household',icon:'home',label:'Household'},{key:'Personal',icon:'user',label:'Personal'},{key:'Transport',icon:'bus',label:'Transport'},{key:'Other',icon:'package',label:'Other'}];
let pendingMagicTxs=[];
let customCat='Other';

function renderMagicResults(){
  const total=pendingMagicTxs.length;
  const confirmed=pendingMagicTxs.filter(tx=>(lCfg.items.find(it=>it.name===tx.item))||(tx.cat&&tx.cat!=='Other')).length;
  const needPick=pendingMagicTxs.some(tx=>!lCfg.items.find(it=>it.name===tx.item));
  let h='';
  if(needPick){const pct=Math.round(confirmed/total*100);h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding:8px 12px;background:var(--mist);border-radius:10px"><div style="flex:1;height:6px;background:var(--border);border-radius:3px"><div style="height:6px;background:var(--p1);border-radius:3px;width:'+pct+'%;transition:width .3s"></div></div><span style="font-size:.7rem;font-weight:700;color:var(--mid);white-space:nowrap">'+confirmed+'/'+total+' done</span></div>';}
  h+='<div style="display:flex;flex-direction:column;gap:8px">';
  pendingMagicTxs.forEach((tx,idx)=>{
    const isKnown=!!lCfg.items.find(it=>it.name===tx.item);
    const ok=isKnown||(tx.cat&&tx.cat!=='Other');
    h+='<div data-magic-row="'+idx+'" style="background:'+(ok?'rgba(123,31,162,.04)':'var(--white)')+';border:1.5px solid '+(ok?'var(--p1)':'var(--border)')+';border-radius:var(--cr-md);padding:11px 13px">'
     +'<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:'+(isKnown?'0':'9px')+'">'
     +'<div style="flex:1;min-width:0">'
     +'<div style="font-size:.88rem;font-weight:800;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:2px">'+esc(String(tx.item||''))+'</div>'
     +(isKnown?'<div style="font-size:.72rem;color:var(--p1-text);font-weight:700">✓ In your items · '+esc(tx.cat||'')+'</div>':'<div style="font-size:.72rem;color:var(--mid);font-weight:600">'+(lang==='cw'?'Sankhani gulu':'Pick a category')+'</div>')
     +'</div>'
     +'<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;margin-left:8px">'
     +'<span style="font-size:.84rem;font-weight:800;color:'+(tx.type==='income'?'var(--pos)':'var(--neg)')+'">MK '+Number(tx.amount||0).toLocaleString()+'</span>'
     +(ok?'<span style="color:var(--p1-text)">✓</span>':'')+'</div></div>';
    if(!isKnown){
      h+='<div style="display:flex;flex-wrap:wrap;gap:5px">';
      CAT_OPTS.forEach(ct=>{const sel=tx.cat===ct.key;h+='<button data-cat="'+ct.key+'" onclick="setMagicTxCat('+idx+',\''+ct.key+'\')" style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:var(--cr-sm);border:1.5px solid '+(sel?'var(--p1)':'var(--border)')+';background:'+(sel?'var(--p1)':'var(--white)')+';color:'+(sel?'#fff':'var(--mid)')+';font-size:.72rem;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif"><i data-lucide="'+ct.icon+'" style="width:12px;height:12px"></i>'+ct.label+'</button>';});
      h+='</div>';
    }
    h+='</div>';
  });
  return h+'</div>';
}
function setMagicTxCat(idx,cat){
  if(!pendingMagicTxs[idx])return;
  pendingMagicTxs[idx].cat=cat;
  const el=g('magic-results');
  if(el){
    el.innerHTML=renderMagicResults();
    if(window.lucide)lucide.createIcons({nodes:[el]});
  }
}
async function processMagicLog() {
  const input=val('magic-input').trim();
  if(!input){toast((lang==='cw'?'Chonde lembani mawu.':'Please enter some text.'),'e');return;}
  if(_aiInFlight){toast((lang==='cw'?'Chonde dikirani.':'Please wait.'),'e');return;}
  const _ms=getPremiumStatus(); if(!_ms.isPremium){const _mu=await getAiUsageTodayFS('magic'); if(_mu>=FREE_DAILY_MAGIC){toast((lang==='cw'?'Malire a Magic Log afika (':'Magic Log limit (')+FREE_DAILY_MAGIC+'/day) reached.','e');return;}}
  _aiInFlight=true;
  const btn=g('magic-btn-process');
  btn.disabled = true; btn.innerHTML = '<i data-lucide="loader-2" class="spin-ico" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i> '+(lang==='cw'?'Kuwerenga...':'Extracting...'); if(window.lucide)lucide.createIcons({nodes:[btn]});
  const resultsEl=g('magic-results');
  if(resultsEl){resultsEl.innerHTML='<div class="magic-scan-card"><span class="msc-ico"><i data-lucide="sparkles" style="width:18px;height:18px;color:#2A1400"></i></span><div style="flex:1"><div class="msc-label">'+(lang==='cw'?'AI ikuwerenga zomwe mwalemba...':'Reading your text...')+'</div><div class="msc-track"><div class="msc-bar"></div></div></div></div>';if(window.lucide)lucide.createIcons({nodes:[resultsEl]});}
  
  const safeCandidates = lCfg.items.map(i=>i.name).filter(n=>n.toLowerCase()!=='other');
  const prompt = `Extract transactions from this text.
  Respond ONLY with a valid JSON array of objects. Do not include markdown formatting like \`\`\`json.
  ${AI_ITEM_NAMING_RULE}
  Properties needed for each object:
  - item: string (real-world name of what was bought; map to these budget items if it fits: ${safeCandidates.join(', ')})
  - amount: number (extract the exact numeric amount)
  - type: string (either "expense" or "income")

  Text: "${input}"`;
  
  try {
    const url = 'https://nyumba-ai.kabangorodrick6.workers.dev/chat';
    const payload = { contents: [{ parts: [{ text: prompt }] }] };
    const delays = [1000, 2000, 4000, 8000];
    let data = null, lastErr = null;
    for (let i = 0; i <= delays.length; i++) {
      let retryable = true;
      try {
        const res = await fetch(url, { method: 'POST', headers: await aiHeaders('magic'), body: JSON.stringify(payload) });
        let resData = null; try { resData = await res.json(); } catch(_) {}
        if (!res.ok) {
          lastErr = _aiHttpErr(res, resData);
          retryable = (res.status === 503 || (res.status === 429 && lastErr.aiCode !== 'quota'));
          throw lastErr;
        }
        data = resData; break;
      } catch(err) { lastErr = err; if (!retryable || (err && err.aiCode === 'auth') || i === delays.length) throw lastErr; }
      if (i < delays.length) await new Promise(r => setTimeout(r, delays[i]));
    }
    const resultText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    // Strip markdown code fences that Gemini often wraps around JSON responses
    const cleanText = resultText.replace(/```json|```/g,'').trim();
    pendingMagicTxs = JSON.parse(cleanText);
    
    if(!Array.isArray(pendingMagicTxs)||!pendingMagicTxs.length) throw new Error('No transactions found');
    // Tag each extracted item with a category — known items get auto-category, unknown get 'Other' as default
    pendingMagicTxs = pendingMagicTxs.map(tx => ({
      ...tx,
      cat: catOf(String(tx.item||'')) || 'Other'
    }));

    g('magic-results').innerHTML = renderMagicResults();
    if(window.lucide)lucide.createIcons({nodes:[g('magic-results')]});
    btn.innerHTML = '<i data-lucide="save" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i> Save All'; if(window.lucide)lucide.createIcons({nodes:[btn]});
    btn.setAttribute('onclick','saveMagicTxs()');
    btn.disabled=false;
    if(!getPremiumStatus().isPremium) incAiUsageTodayFS('magic');
    _aiInFlight=false;
  } catch(err){
    const isCW = lang === 'cw';
    const busyMsg = isCW
      ? 'Bajeti AI ili otanganidwa. Chonde yesaninso posachedwa.'
      : 'Bajeti AI is busy right now. Please try again in a moment.';
    const _fm = aiFailMessage(err, isCW) || busyMsg;
    toast(_fm, 'e');
    const resultsEl2 = g('magic-results');
    if(resultsEl2) resultsEl2.innerHTML = '<div style="text-align:center;padding:14px;font-size:.78rem;color:var(--neg)">'+esc(_fm)+'</div>';
    btn.disabled=false; btn.innerHTML='<i data-lucide="refresh-cw" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i> '+(isCW?'Yesaninso':'Try again'); if(window.lucide)lucide.createIcons({nodes:[btn]}); _aiInFlight=false;
  }
}

function saveMagicTxs() {
  const RESERVED_NAMES = ['other','ena','food','transport','household','personal','unknown','other income','zina'];
  const fallbackDate = today();
  let ts = new Date().getTime();
  let saved = 0, skipped = 0;
  pendingMagicTxs.forEach(tx => {
    const rawName = String(tx.item || '').trim();
    if (!rawName || RESERVED_NAMES.includes(rawName.toLowerCase())) {
      toast(
        lang === 'cw'
          ? 'Lowetsani dzina la chinthu ichi (osati "' + (rawName || 'bwera') + '")'
          : 'Please enter a real name for this item. "' + (rawName || 'blank') + '" is not valid',
        'e'
      );
      skipped++;
      return;
    }
    const amt = Number(tx.amount) || 0;
    if(amt <= 0 || amt > 99999999){ toast((lang==='cw'?'Ndalama yolakwika yadumphidwa: ':'Skipped invalid amount: ')+rawName+'.','e'); skipped++; return; }
    const dStr = (tx.date && /^\d{4}-\d{2}-\d{2}$/.test(tx.date)) ? tx.date : fallbackDate;
    addPx({
      item: rawName.slice(0,100),
      date: dStr,
      timestamp: ts++,
      amount: amt,
      cat: tx.cat || 'Other',
      notes: 'Added via Magic Log ✨',
      userId: actU().id,
      type: tx.type === 'income' ? 'income' : 'expense'
    });
    saved++;
  });
  if (saved > 0) {
    closeM('mv-magic');
    toast((lang==='cw'?'Zolemba zasungidwa!':'Transactions Saved!'),'s');
    insTab='hist'; go('insights');
  }
}

// -- AI Smart Summary --
// Builds a compact, data-only snapshot for the summary prompt below. Deliberately
// separate from buildCtx() -- that function carries the full chat persona, navigation
// map, and support-contact instructions, which have no place in a 2-3 sentence summary
// and were previously bleeding into it (longer replies, unprompted brand mentions).
function buildSummaryData(){
  const moPx=lPx.filter(p=>p.date&&isTM(p.date)&&!p.deleted);
  const spent=moPx.filter(p=>p.type!=='income').reduce((s,p)=>s+p.amount,0);
  const income=moPx.filter(p=>p.type==='income').reduce((s,p)=>s+p.amount,0);
  const byItem={};
  moPx.filter(p=>p.type!=='income').forEach(p=>{byItem[p.item]=(byItem[p.item]||0)+p.amount;});
  const items=lCfg.items.map(it=>({item:it.name,budget:it.budget,spent:byItem[it.name]||0,status:(byItem[it.name]||0)>it.budget?'OVER BUDGET':(byItem[it.name]||0)>(it.budget*.8)?'Near limit':'OK'})).filter(it=>it.spent>0||it.budget>0).slice(0,20);
  const me=actU();
  return {member:me.name, overallBudget:lCfg.overallBudget, totalSpent:spent, totalIncome:income, items};
}
async function generateAiSummary() {
  if(_aiInFlight){toast((lang==='cw'?'Chonde dikirani.':'Please wait.'),'e');return;}
  const _s=getPremiumStatus();
  if(!_s.isPremium){ const _u=await getAiUsageTodayFS('summ'); if(_u>=FREE_DAILY_SUMM){toast((lang==='cw'?'Malire a Chidule cha AI afika (':'AI Summary limit (')+FREE_DAILY_SUMM+'/day) reached.','e');return;} }
  _aiInFlight=true;
  const btn=g('ai-sum-btn'),box=g('ai-sum-box');
  btn.disabled=true; btn.innerHTML='<i data-lucide="refresh-cw" style="margin-right:4px"></i> Analyzing...'; if(window.lucide)lucide.createIcons({nodes:[btn]});
  try{
    const url = 'https://nyumba-ai.kabangorodrick6.workers.dev/chat';
    const summaryPrompt = `Write a household budget review. Language: ${lang==='cw'?'Chichewa':'English'}. Currency: MK.
Hard rules: exactly 2-3 sentences, no more, no bullet list. Open with a short warm greeting using their first name only -- e.g. "Hi ${actU().name.split(' ')[0]}," in English or "Moni ${actU().name.split(' ')[0]}," in Chichewa -- never start the reply with the bare name as if mid-sentence. Reference specific numbers and item names from the data below. Do not mention who built the app, any company or team name, or support/contact info -- none of that is relevant here.
Data: ${JSON.stringify(buildSummaryData())}`;
    const payload = {contents:[{parts:[{text:summaryPrompt}]}]};
    const delays = [1000, 2000, 4000, 8000];
    let data = null, lastErr = null;
    for (let i = 0; i <= delays.length; i++) {
      let retryable = true;
      try {
        const res = await fetch(url, {method:'POST', headers: await aiHeaders('summ'), body:JSON.stringify(payload)});
        let resData = null; try { resData = await res.json(); } catch(_) {}
        if (!res.ok) {
          lastErr = _aiHttpErr(res, resData);
          retryable = (res.status === 503 || (res.status === 429 && lastErr.aiCode !== 'quota'));
          throw lastErr;
        }
        data = resData; break;
      } catch(err) { lastErr = err; if (!retryable || (err && err.aiCode === 'auth') || i === delays.length) throw lastErr; }
      if (i < delays.length) await new Promise(r => setTimeout(r, delays[i]));
    }
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if(!_s.isPremium) incAiUsageTodayFS('summ');
    box.innerHTML='<div class="ai-summary-box"><b><i data-lucide="zap" style="width:14px;height:14px;margin-right:4px;vertical-align:middle;color:var(--p1-text)"></i> AI Insight:</b><br>'+mdLite(reply||'')+'</div>';
    if(window.lucide)lucide.createIcons({nodes:[box]});
    box.classList.remove('hide'); btn.style.display='none'; _aiInFlight=false;
  }catch(err){
    const isCW = lang === 'cw';
    const busyMsg = isCW
      ? 'Bajeti AI ili otanganidwa, chonde yesaninso posachedwa.'
      : 'Bajeti AI is busy right now, please try again in a moment.';
    toast(aiFailMessage(err, isCW) || busyMsg,'e');
    btn.disabled=false; btn.innerHTML='<i data-lucide="zap" style="margin-right:4px"></i> '+(isCW?'Yesaninso':'Try Again'); if(window.lucide)lucide.createIcons({nodes:[btn]}); _aiInFlight=false;
  }
}
