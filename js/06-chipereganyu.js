// ===============================================
// CHIPEREGANYU (rotating savings circle)
// ===============================================
// Data model — doc chipereganyu_groups/{code} (code = same style as household join codes):
//   name, contributionAmount, frequency ('monthly'|'weekly'), currency,
//   dueDay (pay day: monthly = day of the month 1-31, weekly = weekday 0-6; circles made before 9.17.5 have none),
//   createdBy (uid = the admin), createdAt, memberUids:[uid,...] (for the array-contains query),
//   members:{uid:{name,color,joinedAt}}, rotationOrder:[uid,...],
//   status:'gathering'|'active'|'completed'|'closed',
//     completed = every member has received this lap; the admin starts another lap or closes the circle.
//   currentCycle:{cycleNumber,lap,recipientUid,dueDate,amount,
//       contributions:{uid:{paid,paidAt,confirmedBy,sent?,sentAt?}},
//         sent = the contributor says they sent it; paid = the recipient (or admin) confirmed it arrived. Only paid counts as collected.
//       departedPaid?:{uid:{name,paid:true}}   // paid this round, then left: the money still counts
//     } | null,
//   history:[{cycleNumber,lap,recipientUid,recipientName,amount,collected,date,contributions,departed?}]
//     amount = what the round was worth when it started; collected = what actually came in (less than amount for a short round).
//     Entries from before 9.17.5 have no lap/collected/recipientName; chipLapInfo() works the lap out for them.
// Membership is keyed on the signed-in account (curUser.uid), independent of
// household — one person can belong to a Chipereganyu circle with people who
// each have their own separate Bajeti Yanga household.

// >>> chip pure helpers (no DOM, no Firebase). tests/chip.test.js loads this block, so keep it self-contained. >>>
function chipIso(y,m,d){ return y+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }   // m is 1-12
function chipDaysBetween(a,b){   // whole days from date a to date b ('YYYY-MM-DD'); negative if b is earlier
  const pa=a.split('-').map(Number), pb=b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0],pb[1]-1,pb[2])-Date.UTC(pa[0],pa[1]-1,pa[2]))/86400000);
}
function chipAddDays(s,n){
  const p=s.split('-').map(Number), d=new Date(Date.UTC(p[0],p[1]-1,p[2]+n));
  return chipIso(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate());
}
function chipMonthDate(y,m0,day){   // m0 is 0-based and may run past 11; the day is clamped (31 Jan + 1 month -> 28/29 Feb)
  const d=new Date(Date.UTC(y,m0,1)), yy=d.getUTCFullYear(), mm=d.getUTCMonth();
  const dim=new Date(Date.UTC(yy,mm+1,0)).getUTCDate();
  return chipIso(yy,mm+1,Math.min(day,dim));
}
// Due date of the first round. `anchor` is the pay day chosen at creation (monthly: day 1-31, weekly: weekday 0=Sun..6=Sat).
// With an anchor the first due date is the next such day, today included. Circles made before pay days existed have no
// anchor: they keep the old behaviour (one month, or one week, from today).
function chipFirstDue(freq,anchor,todayStr){
  const p=todayStr.split('-').map(Number);
  if(freq==='weekly'){
    if(anchor==null) return chipAddDays(todayStr,7);
    const wd=new Date(Date.UTC(p[0],p[1]-1,p[2])).getUTCDay();
    return chipAddDays(todayStr,(Number(anchor)-wd+7)%7);
  }
  if(anchor==null) return chipMonthDate(p[0],p[1]-1+1,p[2]);
  const day=Math.min(31,Math.max(1,Math.floor(Number(anchor))));
  const c=chipMonthDate(p[0],p[1]-1,day);
  return c<todayStr?chipMonthDate(p[0],p[1],day):c;
}
// Due date of the next round: keeps the rhythm by stepping on from the PREVIOUS due date (not from the day the payout was
// confirmed), and skips dates that have already passed so a late confirmation does not start the next round overdue.
function chipNextDue(freq,prevDue,anchor,todayStr){
  if(!prevDue) return chipFirstDue(freq,anchor,todayStr);
  const pp=prevDue.split('-').map(Number);
  const day=(anchor!=null&&anchor>=1&&anchor<=31)?Math.floor(anchor):pp[2];
  let n=0, d=prevDue;
  do{
    n++;
    d=freq==='weekly'?chipAddDays(prevDue,7*n):chipMonthDate(pp[0],pp[1]-1+n,day);
  }while(d<todayStr&&n<600);
  return d;
}
function chipOverdueDays(dueDate,todayStr){ return dueDate?Math.max(0,chipDaysBetween(dueDate,todayStr)):0; }
// Which lap (one full turn of the rotation) each history entry belongs to, and which lap the current round is in.
// New entries carry their lap; older entries do not, so for those a new lap starts whenever a recipient comes round again.
function chipLapInfo(grp){
  const hist=(grp.history||[]).slice().sort(function(a,b){ return (a.cycleNumber||0)-(b.cycleNumber||0); });
  let lap=1, seen={};
  const entries=hist.map(function(h){
    if(h.lap){ if(h.lap!==lap){ lap=h.lap; seen={}; } }
    else if(seen[h.recipientUid]){ lap++; seen={}; }
    seen[h.recipientUid]=true;
    return {h:h,lap:lap};
  });
  const cc=grp.currentCycle;
  let cur=lap;
  if(cc){ if(cc.lap) cur=cc.lap; else if(seen[cc.recipientUid]) cur=lap+1; }
  const got=entries.filter(function(e){ return e.lap===cur; }).map(function(e){ return e.h.recipientUid; });
  return {lap:cur,entries:entries,receivedThisLap:got};
}
// Next in the rotation order who has not yet received this lap (the current recipient counts as received).
// null means everyone has had their turn: the lap is complete.
function chipNextRecipient(grp,info){
  const cc=grp.currentCycle; if(!cc) return null;
  const got={}; info.receivedThisLap.forEach(function(u){ got[u]=true; }); got[cc.recipientUid]=true;
  const order=grp.rotationOrder||[];
  for(let i=0;i<order.length;i++){ if(!got[order[i]]) return order[i]; }
  return null;
}
// The money side of the current round. `received` = confirmed by the recipient/admin, `sent` = the contributor says they
// sent it but it is not confirmed yet. Members who paid and then left (departedPaid) still count toward `collected`.
// `goneUnpaid` = members who left before paying: that money will never arrive, so the round can only be short.
function chipRoundSummary(grp){
  const cc=grp.currentCycle; if(!cc) return null;
  const amt=Number(grp.contributionAmount)||0, con=cc.contributions||{};
  const contributors=(grp.rotationOrder||[]).filter(function(u){ return u!==cc.recipientUid; });
  const received=contributors.filter(function(u){ return con[u]&&con[u].paid; });
  const sent=contributors.filter(function(u){ return con[u]&&!con[u].paid&&con[u].sent; });
  const pending=contributors.filter(function(u){ return !(con[u]&&(con[u].paid||con[u].sent)); });
  const departedPaid=Object.keys(cc.departedPaid||{});
  const expected=Number(cc.amount)||0;
  const collected=Math.min(expected,(received.length+departedPaid.length)*amt);
  const slots=amt>0?Math.round(expected/amt):contributors.length;
  const goneUnpaid=Math.max(0,slots-contributors.length-departedPaid.length);
  return {contributors:contributors,received:received,sent:sent,pending:pending,departedPaid:departedPaid,
    expected:expected,collected:collected,goneUnpaid:goneUnpaid,shortAmount:goneUnpaid*amt,
    outstanding:(contributors.length-received.length)*amt,
    allReceived:contributors.length>0&&received.length===contributors.length,
    pct:expected>0?Math.min(1,collected/expected):0};
}
// <<< end chip pure helpers <<<

function activeChipGroup(){ return chipGroups.find(g=>g.id===chipActiveId) || chipGroups.find(g=>g.status!=='closed') || chipGroups[0] || null; }
// The circle the Home card shows: never a closed one.
function chipHomeGroup(){ return chipGroups.find(g=>g.id===chipActiveId&&g.status!=='closed') || chipGroups.find(g=>g.status!=='closed') || null; }
function setChipActive(id){ chipActiveId=id; chipTab='cycle'; rChip(); }
function setChipTab(t){ chipTab=t; rChip(); }

const CHIP_WD_EN=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const CHIP_WD_CW=['Lamulungu','Lolemba','Lachiwiri','Lachitatu','Lachinayi','Lachisanu','Loweruka'];
function chipOrd(n){ const v=n%100; if(v>=11&&v<=13) return n+'th'; return n+(({1:'st',2:'nd',3:'rd'})[n%10]||'th'); }
function chipPlainDate(s){ const p=String(s||'').split('T')[0].split('-'); return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:String(s||''); }
function chipScheduleLine(grp){
  const isCW=lang==='cw';
  if(grp.dueDay==null) return '';
  if(grp.frequency==='weekly'){
    const wd=(isCW?CHIP_WD_CW:CHIP_WD_EN)[grp.dueDay]; if(!wd) return '';
    return isCW?'Tsiku lolipira: '+wd+' lililonse':'Pay day: every '+wd;
  }
  return isCW?'Tsiku lolipira: pa '+grp.dueDay+' mwezi uliwonse':'Pay day: the '+chipOrd(grp.dueDay)+' of each month';
}

function openChipView(){
  tab='chip';
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('on'));
  const nb=g('nb-home'); if(nb) nb.classList.add('on');
  chipTab='cycle';
  rChip();
  const v=g('view'); if(v) v.scrollTop=0;
}

function openChipEntry(){
  const isCW=lang==='cw';
  let h='<div class="dh"></div><h3><i data-lucide="rotate-cw" style="width:16px;height:16px;margin-right:5px;vertical-align:-3px;color:var(--p1)"></i>Chipereganyu</h3>';
  h+='<p style="font-size:.8rem;color:var(--mid);margin-bottom:12px">'+(isCW?'Sungani ndalama pamodzi ndi anzanu, ndipo aliyense azilandira mpotowo motsatizana.':'Save together with a group, taking turns to receive the pot.')+'</p>';
  h+='<div class="cg-choice">';
  h+='<div class="cg-choice-btn" onclick="openChipCreate()"><i data-lucide="plus-circle" style="width:22px;height:22px;color:var(--p1)"></i><div style="font-weight:700;font-size:.8rem;margin-top:6px">'+(isCW?'Yambani':'Create New')+'</div></div>';
  h+='<div class="cg-choice-btn" onclick="openChipJoin()"><i data-lucide="log-in" style="width:22px;height:22px;color:var(--p1)"></i><div style="font-weight:700;font-size:.8rem;margin-top:6px">'+(isCW?'Lowani':'Join with Code')+'</div></div>';
  h+='</div>';
  g('mb-e').innerHTML=h; initIcons(); openM('mv-e');
}

function chipPickFreq(f){
  g('cg-freq').value=f;
  g('cg-freq-monthly').classList.toggle('on',f==='monthly');
  g('cg-freq-weekly').classList.toggle('on',f==='weekly');
  g('cg-day-m').style.display=f==='monthly'?'':'none';
  g('cg-day-w').style.display=f==='weekly'?'':'none';
}

function openChipCreate(){
  const isCW=lang==='cw';
  const todayWd=new Date().getDay();
  let wdOpts='';
  (isCW?CHIP_WD_CW:CHIP_WD_EN).forEach(function(n,i){ wdOpts+='<option value="'+i+'"'+(i===todayWd?' selected':'')+'>'+n+'</option>'; });
  let h='<div class="dh"></div><h3><i data-lucide="plus-circle" style="width:16px;height:16px;margin-right:5px;vertical-align:-3px;color:var(--p1)"></i>'+(isCW?'Gulu latsopano la Chipereganyu':'New Chipereganyu')+'</h3>';
  h+='<div class="fsec"><label class="fl">'+(isCW?'Dzina la gulu':'Group name')+'</label><input type="text" class="fi" id="cg-name" placeholder="'+(isCW?'Mwachitsanzo: Chipereganyu cha Banja':'e.g. Family Chipereganyu')+'"></div>';
  h+='<div class="fsec"><label class="fl">'+(isCW?'Ndalama pa munthu aliyense':'Contribution per member')+'</label><input type="number" class="fi" id="cg-amt" inputmode="decimal" placeholder="5000"></div>';
  h+='<div class="fsec"><label class="fl">'+(isCW?'Nthawi yobwereza':'Frequency')+'</label><div class="usel"><div class="usb on" id="cg-freq-monthly" onclick="chipPickFreq(\'monthly\')" style="flex:1"><div class="usnm">'+(isCW?'Mwezi ndi mwezi':'Monthly')+'</div></div><div class="usb" id="cg-freq-weekly" onclick="chipPickFreq(\'weekly\')" style="flex:1"><div class="usnm">'+(isCW?'Sabata ndi sabata':'Weekly')+'</div></div></div><input type="hidden" id="cg-freq" value="monthly"></div>';
  h+='<div class="fsec" id="cg-day-m"><label class="fl">'+(isCW?'Tsiku lolipira la mwezi (1–31)':'Pay day (day of the month, 1–31)')+'</label><input type="number" class="fi" id="cg-day" inputmode="numeric" min="1" max="31" placeholder="'+(isCW?'Mwachitsanzo: 25':'e.g. 25')+'"></div>';
  h+='<div class="fsec" id="cg-day-w" style="display:none"><label class="fl">'+(isCW?'Tsiku lolipira la sabata':'Pay day (day of the week)')+'</label><select class="fs" id="cg-wday">'+wdOpts+'</select></div>';
  h+='<p style="font-size:.72rem;color:var(--mid);margin:-2px 0 10px">'+(isCW?'Gawo lililonse, aliyense kupatula wolandira amalipira. Ndalama yonse = ndalama ya munthu mmodzi × (chiwerengero cha mamembala − 1).':'Each round, everyone except the person receiving pays. The pot = contribution × (members − 1).')+'</p>';
  h+='<div style="display:flex;gap:8px;margin-top:6px"><button class="btnG" style="flex:1" onclick="closeM(\'mv-e\')">'+(isCW?'Letsani':'Cancel')+'</button><button class="btnM" style="flex:2" onclick="saveChipCreate(this)"><i data-lucide="save" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i>'+(isCW?'Pangani':'Create')+'</button></div>';
  g('mb-e').innerHTML=h; initIcons(); openM('mv-e');
}

function saveChipCreate(btn){
  const isCW=lang==='cw';
  const name=val('cg-name').trim();
  const amt=Number(val('cg-amt'));
  const freq=val('cg-freq')||'monthly';
  if(!name){ toast(isCW?'Lowetsani dzina la gulu':'Please enter a group name','e'); return; }
  if(!amt||amt<=0||isNaN(amt)){ toast(isCW?'Lowetsani ndalama yolondola':'Please enter a valid amount','e'); return; }
  if(!curUser){ toast((lang==='cw'?'Simunalowe mu akaunti.':'Not signed in.'),'e'); return; }
  // Pay day: monthly = day of the month (blank means today's date), weekly = day of the week.
  let dueDay;
  if(freq==='weekly'){ dueDay=Number(val('cg-wday')); if(!(dueDay>=0&&dueDay<=6)) dueDay=new Date().getDay(); }
  else {
    const raw=val('cg-day').trim();
    dueDay=raw===''?new Date().getDate():Math.floor(Number(raw));
    if(!(dueDay>=1&&dueDay<=31)){ toast(isCW?'Tsiku lolipira likhale pakati pa 1 ndi 31':'Pay day must be between 1 and 31','e'); return; }
  }
  const code=randCode();
  const me=actU();
  const doc={
    name:name, contributionAmount:amt, frequency:freq, dueDay:dueDay, currency:'MWK',
    createdBy:curUser.uid, createdAt:firebase.firestore.FieldValue.serverTimestamp(),
    memberUids:[curUser.uid],
    members:{ }, // set below via computed key so we don't need dot-path syntax here
    rotationOrder:[curUser.uid],
    status:'gathering', currentCycle:null, history:[]
  };
  doc.members[curUser.uid]={name:me.name, color:me.color||MEMBER_COLORS[0], joinedAt:Date.now()};
  if(btn) btn.disabled=true;
  setDot('spin');
  db.collection('chipereganyu_groups').doc(code).set(doc).then(function(){
    setDot(''); closeM('mv-e'); chipActiveId=code;
    toast(isCW?'Chipereganyu chapangidwa! Gawani nambala '+code+' ndi anzanu.':'Chipereganyu created! Share code '+code+' with your group.','s');
    openChipView();
  }).catch(function(e){ setDot('off'); if(btn) btn.disabled=false; toast(fsErrMsg(e),'e'); });
}

function openChipJoin(){
  const isCW=lang==='cw';
  let h='<div class="dh"></div><h3><i data-lucide="log-in" style="width:16px;height:16px;margin-right:5px;vertical-align:-3px;color:var(--p1)"></i>'+(isCW?'Lowani mu Chipereganyu':'Join a Chipereganyu')+'</h3>';
  h+='<div class="fsec"><label class="fl">'+(isCW?'Khodi ya gulu':'Group code')+'</label><input type="text" class="fi" id="cg-code" placeholder="e.g. a2f9k3xz" autocapitalize="none" autocorrect="off"></div>';
  h+='<div style="display:flex;gap:8px;margin-top:6px"><button class="btnG" style="flex:1" onclick="closeM(\'mv-e\')">'+(isCW?'Letsani':'Cancel')+'</button><button class="btnM" style="flex:2" onclick="joinChipGroup(this)"><i data-lucide="log-in" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i>'+(isCW?'Lowani':'Join')+'</button></div>';
  g('mb-e').innerHTML=h; initIcons(); openM('mv-e');
}

function joinChipGroup(btn){
  const isCW=lang==='cw';
  const code=val('cg-code').trim().toLowerCase();
  if(!code){ toast(isCW?'Lowetsani nambala':'Please enter a code','e'); return; }
  if(!_validCode(code)){ toast(isCW?'Khodi si yolondola':'That code does not look right','e'); return; }
  if(!curUser){ toast((lang==='cw'?'Simunalowe mu akaunti.':'Not signed in.'),'e'); return; }
  if(btn) btn.disabled=true;
  setDot('spin');
  const ref=db.collection('chipereganyu_groups').doc(code);
  const me=actU();
  const patch={
    memberUids: firebase.firestore.FieldValue.arrayUnion(curUser.uid),
    rotationOrder: firebase.firestore.FieldValue.arrayUnion(curUser.uid)
  };
  patch['members.'+curUser.uid]={name:me.name, color:sC(me.color||MEMBER_COLORS[0]), joinedAt:Date.now()};
  let outcome=null;
  // The group can only be READ by its members once the stricter rules are published, so a joiner does not read it.
  // The write below is the real check: the rules accept it only if the group exists, is still gathering and has
  // room, and they decide that on the server at the moment of the write (so a join cannot land after the admin
  // starts the rotation). The read first is just a friendlier path: it succeeds for a member who is already in
  // (and, under the older rules, for anyone), and a permission-denied simply means "not a member yet".
  ref.get().catch(function(e){ if(e&&e.code==='permission-denied') return null; throw e; })
    .then(function(doc){
      if(doc){
        if(!doc.exists) throw {code:'not-found'};
        const d=doc.data();
        if(Array.isArray(d.memberUids)&&d.memberUids.includes(curUser.uid)){ outcome={already:true,name:d.name}; return; }
        if(d.status!=='gathering') throw {code:'already-started'};
      }
      return ref.update(patch).then(function(){
        outcome={already:false,name:null};
        // Now a member, so the group can be read: fetch its name for the welcome message. Best effort.
        return ref.get().then(function(g2){ if(g2.exists) outcome.name=g2.data().name; }).catch(function(){});
      }).catch(function(e){
        // Under the stricter rules a refused join looks the same whether the code is wrong or the rotation has begun.
        if(e&&(e.code==='permission-denied'||e.code==='not-found')) throw {code:'cannot-join'};
        throw e;
      });
    })
    .then(function(){
      setDot(''); closeM('mv-e'); chipActiveId=code;
      if(outcome.already) toast(isCW?'Mulimo kale m’gululi':'You are already in this group','i');
      else toast((isCW?'Mwalowa mu ':'Joined ')+(outcome.name||'Chipereganyu'),'s');
      openChipView();
    })
    .catch(function(e){
      setDot('off'); if(btn) btn.disabled=false;
      if(e&&e.code==='not-found') toast(isCW?'Khodi sinapezeke':'Code not found','e');
      else if(e&&e.code==='already-started') toast(isCW?'Gululi layamba kale kuzungulira':'This group has already started its rotation','e');
      else if(e&&e.code==='cannot-join') toast(isCW?'Simungalowe. Onani nambala, kapena gululi lingakhale lidayamba kale.':'Could not join. Check the code, or the group may already have started its rotation.','e');
      else toast(fsErrMsg(e),'e');
    });
}

function chipFreshContributions(order, recipientUid){
  const c={};
  order.forEach(function(u){ if(u!==recipientUid) c[u]={paid:false,paidAt:null,confirmedBy:null}; });
  return c;
}

function startChipRotation(btn){
  const grp=activeChipGroup(); if(!grp) return;
  const isCW=lang==='cw';
  if(!curUser||grp.createdBy!==curUser.uid){ toast(isCW?'Ndi mtsogoleri yekha amene angayambe':'Only the group admin can start this','e'); return; }
  if(!grp.rotationOrder||grp.rotationOrder.length<2){ toast(isCW?'Muyenera kukhala ndi mamembala osachepera awiri kuti muyambe':'You need at least 2 members to start','e'); return; }
  if(btn) btn.disabled=true;
  setDot('spin');
  const ref=db.collection('chipereganyu_groups').doc(grp.id);
  // Transaction: re-read the group so the member list used for the cycle is the CURRENT one (someone may have just joined),
  // and so a second start from another device can't reset a cycle that's already running.
  db.runTransaction(function(tx){
    return tx.get(ref).then(function(doc){
      if(!doc.exists) throw {code:'not-found'};
      const d=doc.data();
      if(d.status!=='gathering') throw {code:'already-started'};
      const order=d.rotationOrder||[];
      if(order.length<2) throw {code:'too-few'};
      tx.update(ref,{
        status:'active',
        currentCycle:{
          cycleNumber:1,
          lap:1,
          recipientUid:order[0],
          dueDate:chipFirstDue(d.frequency, d.dueDay==null?null:d.dueDay, today()),
          amount:d.contributionAmount*(order.length-1),
          contributions:chipFreshContributions(order, order[0])
        }
      });
    });
  }).then(function(){ setDot(''); if(btn) btn.disabled=false; toast(isCW?'Chipereganyu chayamba!':'Chipereganyu started!','s'); })
    .catch(function(e){
      setDot('off'); if(btn) btn.disabled=false;
      if(e&&e.code==='already-started') toast(isCW?'Gululi layamba kale':'This group has already started','i');
      else if(e&&e.code==='too-few') toast(isCW?'Muyenera membala osachepera 2 kuti muyambe':'You need at least 2 members to start','e');
      else toast(fsErrMsg(e),'e');
    });
}

// Writes `patch` to the group, but only if the round is still the one on screen (a transaction re-reads the group first,
// so a tap on an old screen cannot write into the NEXT round). Offline, a transaction cannot run, so fall back to a plain
// update, which Firestore queues and syncs later.
function chipCycleUpdate(grpId, cycleNumber, patch){
  const gRef=db.collection('chipereganyu_groups').doc(grpId);
  return db.runTransaction(function(tx){
    return tx.get(gRef).then(function(snap){
      const gd=snap.exists?snap.data():null;
      if(!gd || !gd.currentCycle || gd.currentCycle.cycleNumber!==cycleNumber) throw {code:'stale-cycle'};
      tx.update(gRef,patch);
    });
  }).catch(function(e){
    if(e && e.code==='unavailable') return gRef.update(patch);
    throw e;
  });
}
function chipFail(btn){
  return function(e){
    if(btn) btn.disabled=false;
    if(e && e.code==='stale-cycle') toast(lang==='cw'?'Gawoli lasintha kale. Tsegulaninso tsambali.':'This round has already moved on. Please refresh.','e');
    else toast(fsErrMsg(e),'e');
  };
}
// Ties a budget entry back to this group + round + member, so un-marking can find and remove it again.
function chipTagFor(grp, cc, uid){ return grp.id+'#'+cc.cycleNumber+'#'+uid; }
// Deterministic id: doing it twice (or from two devices) writes the SAME budget entry instead of a duplicate.
function chipExpId(tag){ return 'chip_'+_hashStr(tag); }

// A contributor says "I have sent my contribution". It is NOT counted as collected until the recipient (or the admin) confirms
// it arrived. This is the moment the money leaves their pocket, so this is when it is logged to THEIR budget.
function chipMarkSent(btn){
  const grp=activeChipGroup(); if(!grp||!grp.currentCycle||!curUser) return;
  const isCW=lang==='cw', cc=grp.currentCycle, uid=curUser.uid;
  if(!cc.contributions[uid]) return;
  const patch={};
  patch['currentCycle.contributions.'+uid+'.sent']=true;
  patch['currentCycle.contributions.'+uid+'.sentAt']=firebase.firestore.FieldValue.serverTimestamp();
  const chipTag=chipTagFor(grp,cc,uid), expDocId=chipExpId(chipTag);
  if(btn) btn.disabled=true;
  chipCycleUpdate(grp.id, cc.cycleNumber, patch).then(function(){
    if(btn) btn.disabled=false;
    // Only YOUR own contribution can be logged to your budget: we can't write into another member's household.
    addPx({item:'Chipereganyu — '+grp.name, date:today(), timestamp:Date.now(), amount:grp.contributionAmount, userId:actU().id, type:'expense', notes:grp.name, chipTag:chipTag}, {docId:expDocId, quiet:true})
      .then(function(ok){
        toast(ok?(isCW?'Zalembedwa kuti mwatumiza, ndipo zawonjezedwa ku bajeti yanu':'Marked as sent and logged to your budget')
                :(isCW?'Zalembedwa kuti mwatumiza, koma sizinawonjezedwe ku bajeti yanu':'Marked as sent, but it could not be logged to your budget'), ok?'s':'i');
      });
  }).catch(chipFail(btn));
}

// Takes back "I have sent it" (only possible until it has been confirmed as received) and removes the budget entry again.
function chipUnsend(btn){
  const grp=activeChipGroup(); if(!grp||!grp.currentCycle||!curUser) return;
  const isCW=lang==='cw', cc=grp.currentCycle, uid=curUser.uid;
  const e0=cc.contributions[uid]; if(!e0||e0.paid) return;
  const patch={};
  patch['currentCycle.contributions.'+uid+'.sent']=false;
  patch['currentCycle.contributions.'+uid+'.sentAt']=null;
  const chipTag=chipTagFor(grp,cc,uid), expDocId=chipExpId(chipTag);
  if(btn) btn.disabled=true;
  chipCycleUpdate(grp.id, cc.cycleNumber, patch).then(function(){
    if(btn) btn.disabled=false;
    const match=lPx.find(function(p){ return p.chipTag===chipTag; });
    delPx(match?match.id:expDocId).then(function(){
      toast(isCW?'Mwachotsa "Ndatumiza", ndipo ndalamayo yachotsedwa ku bajeti yanu':'Taken back, and removed from your budget','i');
    }).catch(function(){});
  }).catch(chipFail(btn));
}

// The recipient (or the admin) confirms that a contribution really arrived, or takes that confirmation back.
function chipSetReceived(uid, on, btn){
  const grp=activeChipGroup(); if(!grp||!grp.currentCycle||!curUser) return;
  const isCW=lang==='cw', cc=grp.currentCycle;
  if(curUser.uid!==cc.recipientUid && curUser.uid!==grp.createdBy){ toast(isCW?'Ndi wolandira kapena mtsogoleri yekha amene angatsimikizire':'Only the recipient or the admin can confirm this','e'); return; }
  if(!cc.contributions[uid]) return;
  const patch={};
  patch['currentCycle.contributions.'+uid+'.paid']=!!on;
  patch['currentCycle.contributions.'+uid+'.paidAt']=on?firebase.firestore.FieldValue.serverTimestamp():null;
  patch['currentCycle.contributions.'+uid+'.confirmedBy']=on?curUser.uid:null;
  if(btn) btn.disabled=true;
  chipCycleUpdate(grp.id, cc.cycleNumber, patch).then(function(){
    if(btn) btn.disabled=false;
    toast(on?(isCW?'Zalembedwa kuti zalandiridwa':'Marked as received'):(isCW?'Zachotsedwa kuti zalandiridwa':'Received mark removed'),'s');
  }).catch(chipFail(btn));
}

// "Remind" opens WhatsApp with a ready message. The app cannot send anything by itself (no push messages yet), so it no longer
// pretends to: the person taps Send in WhatsApp.
function chipReminderText(grp, uid){
  const isCW=lang==='cw';
  const nm=(((grp.members[uid]||{}).name)||'').split(' ')[0];
  const due=grp.currentCycle?chipPlainDate(grp.currentCycle.dueDate):'';
  const amt=MK(grp.contributionAmount);
  return isCW
    ? 'Moni '+nm+', chikumbutso: ndalama yanu ya Chipereganyu ya '+amt+' ya “'+grp.name+'” ikuyenera kulipidwa pofika '+due+'.'
    : 'Hi '+nm+', a reminder: your Chipereganyu contribution of '+amt+' for “'+grp.name+'” is due '+due+'.';
}
function chipRemind(uid){
  const grp=activeChipGroup(); if(!grp) return;
  window.open('https://wa.me/?text='+encodeURIComponent(chipReminderText(grp,uid)),'_blank');
}

// Asks first when the round is short because someone left before paying, then confirms.
function chipConfirmClick(btn){
  const grp=activeChipGroup(); if(!grp||!grp.currentCycle) return;
  const isCW=lang==='cw', sm=chipRoundSummary(grp);
  if(sm.goneUnpaid>0){
    appConfirm(isCW
      ? 'Gawoli lasowa '+MK(sm.shortAmount)+' chifukwa chakuti mamembala '+sm.goneUnpaid+' achoka asanalipire. Wolandira adzalandira '+MK(sm.collected)+' mwa '+MK(sm.expected)+'. Tsimikizani?'
      : 'This round is short by '+MK(sm.shortAmount)+' because '+sm.goneUnpaid+(sm.goneUnpaid===1?' member left':' members left')+' before paying. The recipient gets '+MK(sm.collected)+' of '+MK(sm.expected)+'. Confirm the payout?',
      function(){ chipConfirmPayout(null,false); }, isCW?'Tsimikizani':'Confirm payout', false);
  } else chipConfirmPayout(btn,false);
}

function chipConfirmPayout(btn, force){
  const grp=activeChipGroup(); if(!grp||!grp.currentCycle) return;
  const isCW=lang==='cw';
  const cc=grp.currentCycle;
  if(!curUser || (curUser.uid!==cc.recipientUid && curUser.uid!==grp.createdBy)){
    toast(isCW?'Ndi wolandira kapena mtsogoleri yekha amene angatsimikizire':'Only the recipient or the admin can confirm this payout','e'); return;
  }
  if(btn) btn.disabled=true;
  setDot('spin');
  const ref=db.collection('chipereganyu_groups').doc(grp.id);
  let payoutInfo=null, finished=false;
  db.runTransaction(function(tx){
    return tx.get(ref).then(function(doc){
      if(!doc.exists) throw {code:'missing'};
      const d=doc.data();
      const cur=d.currentCycle;
      if(!cur) throw {code:'no-cycle'};
      if(cur.cycleNumber!==cc.cycleNumber) throw {code:'stale-cycle'};
      const sm=chipRoundSummary(d);
      if(!sm.allReceived && !force) throw {code:'not-all-paid'};
      const info=chipLapInfo(d);
      const nextUid=chipNextRecipient(d,info);     // null = everyone has had their turn this lap
      const rm=d.members&&d.members[cur.recipientUid];
      // `collected` is what really came in (a short round pays out less than `amount`, which stays as the round was worth at its start).
      const histEntry={cycleNumber:cur.cycleNumber, lap:info.lap, recipientUid:cur.recipientUid, recipientName:(rm&&rm.name)||'', amount:cur.amount, collected:sm.collected, date:today(), contributions:cur.contributions};
      if(sm.departedPaid.length) histEntry.departed=cur.departedPaid;
      payoutInfo={wasMyPayout: curUser && cur.recipientUid===curUser.uid, amount:sm.collected, groupName:d.name, cycleNumber:cur.cycleNumber, groupId:grp.id};
      if(nextUid===null){
        finished=true;
        tx.update(ref,{ history: firebase.firestore.FieldValue.arrayUnion(histEntry), status:'completed', currentCycle:null });
      } else {
        tx.update(ref,{
          history: firebase.firestore.FieldValue.arrayUnion(histEntry),
          currentCycle:{
            cycleNumber:cur.cycleNumber+1,
            lap:info.lap,
            recipientUid:nextUid,
            dueDate:chipNextDue(d.frequency, cur.dueDate, d.dueDay==null?null:d.dueDay, today()),
            amount:d.contributionAmount*(d.rotationOrder.length-1),
            contributions:chipFreshContributions(d.rotationOrder, nextUid)
          }
        });
      }
    });
  }).then(function(){
    setDot(''); if(btn) btn.disabled=false;
    if(payoutInfo && payoutInfo.wasMyPayout){
      // Only log an income entry when the current signed-in account is the one receiving --
      // we can't write into another member's household budget.
      const _ptag=payoutInfo.groupId+'#'+payoutInfo.cycleNumber+'#payout';
      if(payoutInfo.amount>0) addPx({item:'Chipereganyu — '+payoutInfo.groupName, date:today(), timestamp:Date.now(), amount:payoutInfo.amount, userId:actU().id, type:'income', notes:payoutInfo.groupName, chipTag:_ptag}, {docId:'chip_'+_hashStr(_ptag), quiet:true});
    }
    toast(finished?(isCW?'Ndalama zatsimikizidwa! Aliyense walandira, Chipereganyu chatha kuzungulira.':'Payout confirmed! Everyone has had a turn, so this lap is complete.'):(isCW?'Ndalama zatsimikizidwa!':'Payout confirmed!'),'s');
  }).catch(function(e){
    setDot('off'); if(btn) btn.disabled=false;
    if(e && e.code==='not-all-paid') toast(isCW?'Onse sanatsimikizidwe kuti alipira':'Not everyone is confirmed as paid yet','e');
    else if(e && e.code==='stale-cycle') toast(isCW?'Gawoli lasintha kale. Tsegulaninso tsambali.':'This round has already moved on. Please refresh.','e');
    else toast(fsErrMsg(e),'e');
  });
}

function chipForceConfirmPrompt(){
  const grp=activeChipGroup(); if(!grp||!grp.currentCycle||!curUser||curUser.uid!==grp.createdBy) return;
  const isCW=lang==='cw';
  const sm=chipRoundSummary(grp);
  const names=sm.contributors.filter(function(u){ return sm.received.indexOf(u)<0; }).map(function(u){ return esc((grp.members[u]||{}).name||'?'); }).join(', ');
  appConfirm(
    (isCW
      ? ('Sanatsimikizidwe: '+names+'. Kutsimikizira tsopano kudzalemba kuti gawoli lalandira ndalama zochepa ('+MK(sm.collected)+' mwa '+MK(sm.expected)+'), ndipo sizingasinthidwe. Pitirizani?')
      : ('Not confirmed yet: '+names+'. Confirming now records this round as short ('+MK(sm.collected)+' of '+MK(sm.expected)+') and can’t be undone. Continue anyway?')),
    function(){ chipConfirmPayout(null, true); },
    isCW?'Tsimikizani ngakhale ena sanalipire':'Force confirm',
    true
  );
}

// The admin starts another lap once everyone has received: same members, same order (reorder first if you like).
function chipStartNewLap(btn){
  const grp=activeChipGroup(); if(!grp) return;
  const isCW=lang==='cw';
  if(!curUser||grp.createdBy!==curUser.uid){ toast(isCW?'Ndi mtsogoleri yekha amene angayambe':'Only the group admin can start this','e'); return; }
  appConfirm(isCW?'Yambani kuzungulira kwina ndi mamembala omwewa, motsatira dongosolo lomwelo?':'Start another lap with the same members, in the order shown?',
    function(){
      setDot('spin');
      const ref=db.collection('chipereganyu_groups').doc(grp.id);
      db.runTransaction(function(tx){
        return tx.get(ref).then(function(doc){
          if(!doc.exists) throw {code:'not-found'};
          const d=doc.data();
          if(d.status!=='completed') throw {code:'not-completed'};
          const order=d.rotationOrder||[];
          if(order.length<2) throw {code:'too-few'};
          const info=chipLapInfo(d);
          tx.update(ref,{
            status:'active',
            currentCycle:{
              cycleNumber:(d.history||[]).length+1,
              lap:info.lap+1,
              recipientUid:order[0],
              dueDate:chipFirstDue(d.frequency, d.dueDay==null?null:d.dueDay, today()),
              amount:d.contributionAmount*(order.length-1),
              contributions:chipFreshContributions(order, order[0])
            }
          });
        });
      }).then(function(){ setDot(''); chipTab='cycle'; toast(isCW?'Kuzungulira kwatsopano kwayamba!':'New lap started!','s'); })
        .catch(function(e){
          setDot('off');
          if(e&&e.code==='not-completed') toast(isCW?'Gululi silinathe kuzungulira':'This circle is not between laps','i');
          else if(e&&e.code==='too-few') toast(isCW?'Muyenera membala osachepera 2 kuti muyambe':'You need at least 2 members to start','e');
          else toast(fsErrMsg(e),'e');
        });
    }, isCW?'Yambani':'Start lap', false);
}

// The admin ends the circle for good. It stays readable (history) but leaves everyone's Home screen.
function chipCloseCircle(){
  const grp=activeChipGroup(); if(!grp||!curUser||grp.createdBy!==curUser.uid) return;
  const isCW=lang==='cw';
  appConfirm(isCW?'Tsekani Chipereganyu ichi? Mbiri idzakhalabe, koma sichidzaonekanso pa Pakhomo ndipo sichingayambirenso.':'Close this circle? The history stays, but it leaves everyone’s Home screen and can’t be restarted.', function(){
    setDot('spin');
    db.collection('chipereganyu_groups').doc(grp.id).update({status:'closed'}).then(function(){
      setDot(''); toast(isCW?'Chipereganyu chatsekedwa':'Circle closed','i'); go('home');
    }).catch(function(e){ setDot('off'); toast(fsErrMsg(e),'e'); });
  }, isCW?'Tsekani':'Close circle', true);
}

function chipHomeFraction(sm){ return sm.contributors.length?sm.received.length/sm.contributors.length:0; }

function renderChipHomeCard(){
  const isCW=lang==='cw';
  const grp=chipHomeGroup();
  if(!grp){
    return '<div class="cg-empty-card" onclick="openChipEntry()"><div class="cg-empty-ico"><i data-lucide="rotate-cw" style="width:20px;height:20px;color:var(--p1)"></i></div><div style="flex:1"><div class="cg-empty-ttl">Chipereganyu <span class="cg-new-tag">NEW</span></div><div class="cg-empty-sub">'+(isCW?'Yambani kapena lowani mu gulu':'Start or join a savings circle')+'</div></div><i data-lucide="chevron-right" style="color:var(--p1);flex-shrink:0"></i></div>';
  }
  if(grp.status==='completed'){
    const isAdminH=curUser&&grp.createdBy===curUser.uid;
    return '<div class="cg-home-card" onclick="openChipView()"><div class="cg-empty-ico" style="width:46px;height:46px;background:var(--p1-bg)"><i data-lucide="check-circle" style="width:20px;height:20px;color:var(--p1)"></i></div><div class="cg-home-main"><div class="cg-home-ttl">'+esc(grp.name)+'</div><div class="cg-home-sub">'+(isCW?'Aliyense walandira · '+(isAdminH?'sankhani zotsatira':'akudikira mtsogoleri'):'Everyone has received · '+(isAdminH?'choose what is next':'waiting for the admin'))+'</div></div><i data-lucide="chevron-right" style="color:var(--p1);flex-shrink:0"></i></div>';
  }
  if(grp.status!=='active'||!grp.currentCycle){
    const n=Object.keys(grp.members||{}).length;
    return '<div class="cg-home-card" onclick="openChipView()"><div class="cg-empty-ico" style="width:46px;height:46px;background:var(--p1-bg)"><i data-lucide="users" style="width:20px;height:20px;color:var(--p1)"></i></div><div class="cg-home-main"><div class="cg-home-ttl">'+esc(grp.name)+'</div><div class="cg-home-sub">'+n+' '+(isCW?'alowa · akusonkhana':'joined · gathering members')+'</div></div><i data-lucide="chevron-right" style="color:var(--p1);flex-shrink:0"></i></div>';
  }
  const cc=grp.currentCycle;
  const sm=chipRoundSummary(grp);
  const pct=chipHomeFraction(sm);
  const late=chipOverdueDays(cc.dueDate,today())>0 && !sm.allReceived;
  const recipientName=(grp.members[cc.recipientUid]||{}).name||'?';
  const first=esc(recipientName.split(' ')[0]);
  const circ2=2*Math.PI*19;
  const sub=isCW
    ? 'Gawo la '+first+' · pofika '+fmtDate(cc.dueDate)+(late?' · yachedwa':'')
    : first+'’s turn · due '+fmtDate(cc.dueDate)+(late?' · overdue':'');
  return '<div class="cg-home-card" onclick="openChipView()"><div class="cg-mini"><svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="none" stroke="var(--border)" stroke-width="4"/><circle cx="23" cy="23" r="19" fill="none" stroke="var(--p1)" stroke-width="4" stroke-linecap="round" stroke-dasharray="'+circ2.toFixed(1)+'" stroke-dashoffset="'+(circ2*(1-pct)).toFixed(1)+'"/></svg><div class="cg-mini-lbl">'+sm.received.length+'/'+sm.contributors.length+'</div></div><div class="cg-home-main"><div class="cg-home-ttl">Chipereganyu</div><div class="cg-home-sub"'+(late?' style="color:var(--neg)"':'')+'>'+sub+'</div></div><i data-lucide="chevron-right" style="color:var(--p1);flex-shrink:0"></i></div>';
}

// History list, newest first, grouped by lap once there is more than one.
function chipHistoryHtml(grp){
  const isCW=lang==='cw';
  const info=chipLapInfo(grp);
  if(!info.entries.length) return '<p style="font-size:.75rem;color:var(--mid);text-align:center;padding:16px 0">'+(isCW?'Palibe gawo lomaliza.':'No completed rounds yet.')+'</p>';
  const multi=info.entries.some(function(e){ return e.lap>1; });
  let h='', lastLap=null;
  info.entries.slice().reverse().forEach(function(e){
    const hh=e.h;
    if(multi && e.lap!==lastLap){ h+='<div class="cg-lap-h">'+(isCW?'Kuzungulira ':'Lap ')+e.lap+'</div>'; lastLap=e.lap; }
    const m=grp.members[hh.recipientUid]||{name:hh.recipientName||'?'};
    const nm=m.name||hh.recipientName||'?';
    const hasCol=typeof hh.collected==='number';
    const got=hasCol?hh.collected:hh.amount;
    const shortAmt=hasCol?Math.max(0,hh.amount-hh.collected):0;
    // Older entries (from before `collected` existed) have no money figure for what came in; fall back to the paid flags,
    // and treat entries with neither as clean, since we have no record either way.
    const legacyShort=!hasCol && hh.contributions && Object.keys(hh.contributions).some(function(u){ return !(hh.contributions[u]&&hh.contributions[u].paid); });
    const flag=shortAmt>0
      ? ' <span style="color:var(--gold-ink);font-size:.7rem;font-weight:700">'+(isCW?'· yasowa '+MK(shortAmt):'· short by '+MK(shortAmt))+'</span>'
      : (legacyShort?' <span style="color:var(--gold-ink);font-size:.7rem;font-weight:700">'+(isCW?'· sanalipire onse':'· not everyone paid')+'</span>':'');
    h+='<div class="cg-row"><div class="cg-av2">'+esc((nm||'?')[0])+'</div><div class="cg-row-info"><b>'+esc(nm)+flag+'</b><span>'+(isCW?'Gawo ':'Round ')+hh.cycleNumber+' · '+fmtDate(hh.date)+'</span></div><div style="text-align:right"><b style="color:var(--g1);font-size:.8rem;display:block">'+MK(got)+'</b>'+(shortAmt>0?'<span style="font-size:.68rem;color:var(--mid)">'+(isCW?'mwa ':'of ')+MK(hh.amount)+'</span>':'')+'</div></div>';
  });
  return h;
}

// Screen for a circle between laps ('completed') or ended ('closed').
function chipFinishedHtml(grp){
  const isCW=lang==='cw';
  const closed=grp.status==='closed';
  const isAdmin=curUser&&grp.createdBy===curUser.uid;
  const info=chipLapInfo(grp);
  const paidOut=info.entries.reduce(function(s,e){ return s+(typeof e.h.collected==='number'?e.h.collected:(e.h.amount||0)); },0);
  let h='<div class="card"><div class="ch"><h2><i data-lucide="'+(closed?'archive':'check-circle')+'" style="width:15px;height:15px;margin-right:5px;vertical-align:middle;color:var(--p1)"></i>'+(closed?(isCW?'Chipereganyu chatsekedwa':'Circle closed'):(isCW?'Aliyense walandira':'Everyone has received'))+'</h2></div><div class="cb">';
  h+='<div class="cg-stats"><div class="cg-stat"><b>'+info.lap+'</b><span>'+(isCW?'Kuzungulira':(info.lap===1?'lap':'laps'))+'</span></div><div class="cg-stat"><b>'+info.entries.length+'</b><span>'+(isCW?'magawo':'rounds')+'</span></div><div class="cg-stat"><b>'+MK(paidOut)+'</b><span>'+(isCW?'zolipidwa':'paid out')+'</span></div></div>';
  if(!closed){
    if(isAdmin){
      h+='<p style="font-size:.76rem;color:var(--mid);margin-bottom:8px">'+(isCW?'Muthanso kusintha dongosolo musanayambe kuzungulira kwina.':'You can change the order below before starting another lap.')+'</p>';
      (grp.rotationOrder||[]).forEach(function(uid,i){
        const m=grp.members[uid]||{name:'?',color:'#999'};
        h+='<div class="cg-row"><span class="cg-order-num">'+(i+1)+'</span><div class="cg-av2" style="background:'+sC(m.color)+'30">'+esc((m.name||'?')[0])+'</div><b style="font-size:.8rem;flex:1">'+esc(m.name)+'</b>'+(i>0?'<button class="cg-pill-remind" onclick="chipMoveUp(\''+uid+'\')" title="'+(isCW?'Sinthani pamalo':'Move up')+'"><i data-lucide="arrow-up" style="width:11px;height:11px"></i></button>':'')+'</div>';
      });
      h+='<button class="cg-cta on" onclick="chipStartNewLap(this)" style="margin-top:10px"><i data-lucide="rotate-cw" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i>'+(isCW?'Yambani kuzungulira kwina':'Start another lap')+'</button>';
      h+='<button class="cg-link-danger" onclick="chipCloseCircle()">'+(isCW?'Tsekani Chipereganyu ichi':'Close this circle')+'</button>';
    } else {
      h+='<p style="font-size:.76rem;color:var(--mid);text-align:center;margin:6px 0">'+(isCW?'Mukudikira mtsogoleri kusankha kuyamba kuzungulira kwina kapena kutseka.':'Waiting for the admin to start another lap or close the circle.')+'</p>';
    }
  }
  h+='</div></div>';
  h+='<div class="cg-lap-h">'+(isCW?'Mbiri':'History')+'</div>'+chipHistoryHtml(grp);
  if(isAdmin) h+='<button class="cg-link-danger" onclick="chipDeleteGroup()">'+(isCW?'Chotsani gulu lino ndi mbiri yake':'Delete this circle and its history')+'</button>';
  else h+='<button class="cg-link-danger" style="color:var(--mid)" onclick="chipLeaveGroup()">'+(isCW?'Chotsani pa mndandanda wanga':'Remove from my list')+'</button>';
  return h;
}

function rChip(){
  const isCW=lang==='cw';
  const grp=activeChipGroup();
  if(!grp){
    let h0='<div class="page"><div class="cg-back" onclick="go(\'home\')"><i data-lucide="chevron-left"></i><div class="cg-title">Chipereganyu</div></div>';
    h0+='<div class="empty"><p><strong>'+(isCW?'Mulibe gulu lililonse.':'No group yet.')+'</strong></p></div></div>';
    setView(h0); return;
  }
  const nMembers=Object.keys(grp.members||{}).length;
  let h='<div class="page">';
  h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
  h+='<div class="cg-back" style="flex:1" onclick="go(\'home\')"><i data-lucide="chevron-left"></i><div><div class="cg-title">'+esc(grp.name)+'</div><div class="cg-sub">'+nMembers+' '+(isCW?(nMembers===1?'membala':'mamembala'):'members')+(grp.status==='closed'?' · '+(isCW?'chatsekedwa':'closed'):'')+'</div></div></div>';
  h+='<button class="btnG" style="padding:7px 10px" onclick="openChipEntry()"><i data-lucide="plus" style="width:13px;height:13px"></i></button>';
  h+='</div>';

  if(chipGroups.length>1){
    h+='<div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;padding-bottom:2px">';
    chipGroups.forEach(function(g2){
      h+='<button class="btnG" style="white-space:nowrap;padding:6px 12px'+(g2.id===grp.id?';background:var(--p1);color:#fff;border-color:var(--p1)':(g2.status==='closed'?';opacity:.6':''))+'" data-gid="'+esc(g2.id)+'" onclick="setChipActive(this.dataset.gid)">'+esc(g2.name)+'</button>';
    });
    h+='</div>';
  }

  if(grp.status==='completed'||grp.status==='closed'){
    h+=chipFinishedHtml(grp)+'</div>';
    setView(h); return;
  }

  if(grp.status!=='active'||!grp.currentCycle){
    const isAdmin = curUser && grp.createdBy===curUser.uid;
    const nOrder=(grp.rotationOrder||[]).length;
    h+='<div class="card"><div class="ch"><h2><i data-lucide="users" style="width:15px;height:15px;margin-right:5px;vertical-align:middle;color:var(--p1)"></i>'+(isCW?'Akusonkhanitsa mamembala':'Gathering members')+'</h2></div><div class="cb">';
    h+='<div class="cg-code-box">'+grp.id+'</div>';
    h+='<div style="display:flex;gap:8px;margin-bottom:14px"><button class="btnG" style="flex:1" onclick="cpChipCode(\''+grp.id+'\')"><i data-lucide="copy" style="width:13px;height:13px;margin-right:4px;vertical-align:middle"></i>'+(isCW?'Koperani':'Copy')+'</button><button class="btnG" style="flex:1" onclick="waChipCode(\''+grp.id+'\')"><i data-lucide="share-2" style="width:13px;height:13px;margin-right:4px;vertical-align:middle"></i>WhatsApp</button></div>';
    // What the circle is worth, so the admin sees the pot before pressing Start.
    const potLine=nOrder>=2
      ? (isCW?'Gawo lililonse: mamembala '+(nOrder-1)+' amalipira '+MK(grp.contributionAmount)+' aliyense → ndalama yonse '+MK(grp.contributionAmount*(nOrder-1)):'Each round: '+(nOrder-1)+' members pay '+MK(grp.contributionAmount)+' → pot '+MK(grp.contributionAmount*(nOrder-1)))
      : (isCW?'Ndalama yonse = '+MK(grp.contributionAmount)+' × (mamembala − 1)':'Pot per round = '+MK(grp.contributionAmount)+' × (members − 1)');
    h+='<p style="font-size:.76rem;color:var(--ink);font-weight:700;margin-bottom:2px">'+potLine+'</p>';
    const sched=chipScheduleLine(grp);
    if(sched) h+='<p style="font-size:.72rem;color:var(--mid);margin-bottom:10px">'+sched+'</p>'; else h+='<div style="height:8px"></div>';
    (grp.rotationOrder||[]).forEach(function(uid,i){
      const m=grp.members[uid]||{name:'?',color:'#999'};
      const isAdminRow=uid===grp.createdBy;
      h+='<div class="cg-row"><span class="cg-order-num">'+(i+1)+'</span><div class="cg-av2" style="background:'+sC(m.color)+'30">'+esc((m.name||'?')[0])+'</div><b style="font-size:.8rem;flex:1">'+esc(m.name)+(curUser&&uid===curUser.uid?' ('+(isCW?'Inu':'You')+')':'')+'</b>'+(isAdminRow?'<span style="font-size:.7rem;color:var(--p1);font-weight:700;margin-right:4px">'+(isCW?'Mtsogoleri':'Admin')+'</span>':'')+(isAdmin&&!isAdminRow?'<button class="cg-row-x" onclick="chipRemoveMember(\''+uid+'\')" title="'+(isCW?'Chotsani':'Remove')+'"><i data-lucide="x" style="width:14px;height:14px"></i></button>':'')+'</div>';
    });
    if(!isAdmin){
      h+='<button class="cg-link-danger" style="color:var(--mid)" onclick="chipLeaveGroup()">'+(isCW?'Tulukani mu gululi':'Leave this group')+'</button>';
    }
    if(isAdmin){
      h+='<button class="cg-cta on" onclick="startChipRotation(this)" style="margin-top:10px"><i data-lucide="play" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i>'+(isCW?'Yambani Chipereganyu':'Start Chipereganyu')+'</button>';
      if(nOrder<2) h+='<p style="font-size:.7rem;color:var(--mid);text-align:center;margin-top:8px">'+(isCW?'Muyenera kukhala ndi mamembala osachepera awiri kuti muyambe.':'You need at least 2 members to start.')+'</p>';
    } else {
      h+='<p style="font-size:.72rem;color:var(--mid);text-align:center;margin-top:6px">'+(isCW?'Mukudikira mtsogoleri kuti ayambe.':'Waiting for the admin to start the rotation.')+'</p>';
    }
    if(isAdmin){
      h+='<button class="cg-link-danger" onclick="chipDeleteGroup()">'+(isCW?'Chotsani gulu lino':'Delete this group')+'</button>';
    }
    h+='</div></div></div>';
    setView(h); return;
  }

  const cc=grp.currentCycle;
  const sm=chipRoundSummary(grp);
  const info=chipLapInfo(grp);
  const contributors=sm.contributors;
  const recipientName=(grp.members[cc.recipientUid]||{}).name||'?';
  const first=esc(recipientName.split(' ')[0]);
  const od=chipOverdueDays(cc.dueDate,today());
  const circ=2*Math.PI*48;
  const lastTurn=chipNextRecipient(grp,info)===null;

  h+='<div style="text-align:center;margin-bottom:6px"><span class="cg-code-pill" onclick="cpChipCode(\''+grp.id+'\')" title="'+(isCW?'Kopelani nambala':'Tap to copy code')+'"><i data-lucide="hash" style="width:11px;height:11px"></i>'+grp.id+'<i data-lucide="copy" style="width:11px;height:11px"></i></span></div>';
  h+='<div class="cg-wheel">';
  h+='<svg class="cg-ring" width="250" height="250" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="none" stroke="var(--border)" stroke-width="3"/><circle cx="50" cy="50" r="48" fill="none" stroke="var(--g1)" stroke-width="3" stroke-linecap="round" stroke-dasharray="'+circ.toFixed(1)+'" stroke-dashoffset="'+(circ*(1-sm.pct)).toFixed(1)+'" style="transition:stroke-dashoffset .5s"/></svg>';
  h+='<div class="cg-pot"><div class="cg-pot-lbl">'+(isCW?'Gawo ':'Round ')+cc.cycleNumber+'</div><div class="cg-pot-val">'+MK(sm.collected)+'</div><div class="cg-pot-sub">'+(isCW?'mwa ':'of ')+MK(sm.expected)+'</div></div>';
  grp.rotationOrder.forEach(function(uid,i){
    const ang=(i*(360/grp.rotationOrder.length)-90)*Math.PI/180, R=38;
    const left=(50+R*Math.cos(ang))+'%', top=(50+R*Math.sin(ang))+'%';
    const m=grp.members[uid]||{name:'?'};
    const isRecipient=uid===cc.recipientUid;
    const receivedBefore=info.receivedThisLap.indexOf(uid)>-1;   // this lap only, so it resets when a new lap starts
    const status=isRecipient?'current':(receivedBefore?'done':'');
    const pendingPay=!isRecipient && !(cc.contributions[uid]&&cc.contributions[uid].paid);
    h+='<div class="cg-node" style="left:'+left+';top:'+top+'">';
    h+='<div class="cg-av '+status+'">'+esc((m.name||'?')[0]);
    if(status==='done') h+='<div class="cg-badge ok"><i data-lucide="check" style="width:9px;height:9px;color:#fff"></i></div>';
    if(pendingPay) h+='<div class="cg-badge due"></div>';
    h+='</div><div class="cg-nm'+(isRecipient?' current':'')+'">'+esc((m.name||'?').split(' ')[0])+'</div></div>';
  });
  h+='</div>';

  h+='<div class="cg-status"><div class="cg-status-1">'+(isCW?'Ndi nthawi ya '+first+' yolandira':first+'’s turn to receive')+'</div><div class="cg-status-2"><i data-lucide="clock" style="width:12px;height:12px"></i>'+(isCW?'Lipira pofika ':'Due ')+fmtDate(cc.dueDate)+' · '+sm.received.length+'/'+contributors.length+' '+(isCW?'zalandiridwa':'received')+(sm.sent.length?' · '+sm.sent.length+' '+(isCW?'zatumizidwa':'sent'):'')+(info.lap>1?' · '+(isCW?'Kuzungulira ':'Lap ')+info.lap:'')+'</div>';
  if(od>0 && !sm.allReceived) h+='<div class="cg-status-2 cg-late" style="margin-top:3px">'+(isCW?'Yachedwa masiku '+od:'Overdue by '+od+(od===1?' day':' days'))+'</div>';
  h+='</div>';

  if(sm.goneUnpaid>0) h+='<div class="cg-note bad"><i data-lucide="alert-triangle" style="width:14px;height:14px;flex-shrink:0;margin-top:1px"></i><div>'+(isCW?'Gawoli lasowa '+MK(sm.shortAmount)+': mamembala '+sm.goneUnpaid+' achoka asanalipire.':'Short by '+MK(sm.shortAmount)+': '+sm.goneUnpaid+(sm.goneUnpaid===1?' member':' members')+' left before paying.')+'</div></div>';
  if(sm.departedPaid.length){
    const dn=sm.departedPaid.map(function(u){ return esc(((cc.departedPaid||{})[u]||{}).name||'?'); }).join(', ');
    h+='<div class="cg-note"><i data-lucide="info" style="width:14px;height:14px;flex-shrink:0;margin-top:1px"></i><div>'+(isCW?'Analipira kenako natuluka: '+dn+'. Ndalama yawo ikuwerengedwabe.':'Paid, then left: '+dn+'. Their money still counts.')+'</div></div>';
  }

  h+='<div class="cg-tabs">';
  h+='<button class="cg-tab'+(chipTab==='cycle'?' on':'')+'" onclick="setChipTab(\'cycle\')">'+(isCW?'Gawo lino':'This cycle')+'</button>';
  h+='<button class="cg-tab'+(chipTab==='order'?' on':'')+'" onclick="setChipTab(\'order\')">'+(isCW?'Dongosolo':'Rotation')+'</button>';
  h+='<button class="cg-tab'+(chipTab==='hist'?' on':'')+'" onclick="setChipTab(\'hist\')">'+(isCW?'Mbiri':'History')+'</button>';
  h+='</div>';

  if(chipTab==='cycle'){
    const isRecipientView = curUser && curUser.uid===cc.recipientUid;
    const isAdminView = curUser && curUser.uid===grp.createdBy;
    const canConfirmRows = isRecipientView || isAdminView;
    contributors.forEach(function(uid){
      const m=grp.members[uid]||{name:'?',color:'#999'};
      const e=cc.contributions[uid]||{};
      const isSelfRow = curUser && uid===curUser.uid;
      const received=!!e.paid, sentFlag=!!e.sent && !received;
      const rowLate = od>0 && !received && !sentFlag;
      h+='<div class="cg-row"><div class="cg-av2" style="background:'+sC(m.color)+'30">'+esc((m.name||'?')[0])+'</div><div class="cg-row-info"><b>'+esc(m.name)+(isSelfRow?' ('+(isCW?'Inu':'You')+')':'')+'</b><span>'+MK(grp.contributionAmount)+(rowLate?' · <span class="cg-late">'+(isCW?'Yachedwa masiku '+od:'Overdue '+od+(od===1?' day':' days'))+'</span>':'')+'</span></div>';
      h+='<div class="cg-pill-actions">';
      if(received){
        h+='<div class="cg-pill-ok"><i data-lucide="check" style="width:10px;height:10px"></i>'+(isCW?'Zalandiridwa':'Received')+'</div>';
        if(canConfirmRows) h+='<button class="cg-pill-remind" onclick="chipSetReceived(\''+uid+'\',false,this)" title="'+(isCW?'Bwezerani':'Undo')+'"><i data-lucide="rotate-ccw" style="width:11px;height:11px"></i></button>';
      } else if(sentFlag){
        h+='<div class="cg-pill-sent"><i data-lucide="send" style="width:10px;height:10px"></i>'+(isCW?'Zatumizidwa':'Sent')+'</div>';
        if(canConfirmRows) h+='<button class="cg-pill-mark" onclick="chipSetReceived(\''+uid+'\',true,this)">'+(isCW?'Zalandiridwa':'Mark received')+'</button>';
        if(isSelfRow) h+='<button class="cg-pill-remind" onclick="chipUnsend(this)" title="'+(isCW?'Bwezerani':'Undo')+'"><i data-lucide="rotate-ccw" style="width:11px;height:11px"></i></button>';
      } else {
        h+='<button class="cg-pill-remind" onclick="chipRemind(\''+uid+'\')" title="'+(isCW?'Kumbutsani pa WhatsApp':'Remind on WhatsApp')+'"><i data-lucide="bell" style="width:11px;height:11px"></i></button>';
        if(isSelfRow) h+='<button class="cg-pill-mark" onclick="chipMarkSent(this)">'+(isCW?'Ndatumiza':'I’ve sent it')+'</button>';
        if(canConfirmRows) h+='<button class="cg-pill-mark" onclick="chipSetReceived(\''+uid+'\',true,this)">'+(isCW?'Zalandiridwa':'Mark received')+'</button>';
      }
      h+='</div></div>';
    });
    const canConfirm = curUser && (curUser.uid===cc.recipientUid || curUser.uid===grp.createdBy);
    if(sm.allReceived && canConfirm){
      h+='<button class="cg-cta on" onclick="chipConfirmClick(this)">'+(isCW?'Tsimikizani kuti ndalama zaperekedwa kwa '+first:'Confirm payout to '+first)+'</button>';
      if(lastTurn) h+='<p style="font-size:.7rem;color:var(--mid);text-align:center;margin-top:6px">'+(isCW?'Ili ndi gawo lomaliza la kuzungulira kumeneku.':'This is the last turn of this lap.')+'</p>';
    } else if(sm.allReceived){
      h+='<div style="text-align:center;font-size:.72rem;color:var(--mid);padding:12px 0">'+(isCW?'Onse alipira — mukudikira '+first+' kuti atsimikizire':'All received — waiting for '+first+' to confirm')+'</div>';
    } else {
      const waiting=contributors.length-sm.received.length;
      h+='<button class="cg-cta off" disabled>'+(isCW?'Mukudikira zotsimikizira '+waiting:'Waiting on '+waiting+' more confirmation'+(waiting===1?'':'s'))+'</button>';
      if(isAdminView){
        h+='<button class="cg-link-danger" style="margin-top:8px" onclick="chipForceConfirmPrompt()">'+(isCW?'Tsimikizani chonse ngakhale ena sanalipire':'Force confirm anyway')+'</button>';
      }
    }
  } else if(chipTab==='order'){
    const isAdminView = curUser && curUser.uid===grp.createdBy;
    const paidOutUids=info.receivedThisLap;   // who has had their turn in THIS lap
    if(info.lap>1) h+='<div class="cg-lap-h" style="margin-top:2px">'+(isCW?'Kuzungulira ':'Lap ')+info.lap+'</div>';
    grp.rotationOrder.forEach(function(uid,i){
      const m=grp.members[uid]||{name:'?'};
      const isRecipient=uid===cc.recipientUid;
      const receivedBefore=paidOutUids.indexOf(uid)>-1;
      const isUpcoming=!isRecipient && !receivedBefore;
      const label=isRecipient?(isCW?'Akulandira tsopano':'Receiving now'):(receivedBefore?(isCW?'Analandira':'Received'):(isCW?'Akudikira':'Upcoming'));
      const color=isRecipient?'var(--p1-text)':(receivedBefore?'var(--pos)':'var(--mid)');
      // Only offer "move up" when the row right above is also upcoming --
      // i.e. not the current recipient or someone already paid this lap --
      // since those are frozen and chipMoveUp will refuse to cross them anyway.
      const prevUid=i>0?grp.rotationOrder[i-1]:null;
      const canMoveUp=isAdminView && isUpcoming && prevUid && prevUid!==cc.recipientUid && paidOutUids.indexOf(prevUid)<0;
      // Admin can remove anyone here except the current, unconfirmed recipient --
      // that payout has nowhere to go until it's confirmed. Removing someone who
      // already received this lap is still allowed, but chipRemoveMember shows
      // an explicit warning first since it means they're exiting without
      // finishing their contributions to the rest of this lap.
      const canRemove=isAdminView && uid!==grp.createdBy && !isRecipient;
      h+='<div class="cg-row"><span class="cg-order-num">'+(i+1)+'</span><div class="cg-av2" style="background:'+(sC(m.color)||'#999')+'30">'+esc((m.name||'?')[0])+'</div><b style="font-size:.8rem;flex:1">'+esc(m.name)+'</b>'+(canMoveUp?'<button class="cg-pill-remind" style="margin-right:6px" onclick="chipMoveUp(\''+uid+'\')" title="'+(isCW?'Sinthani pamalo':'Move up')+'"><i data-lucide="arrow-up" style="width:11px;height:11px"></i></button>':'')+(isAdminView&&uid!==grp.createdBy?'<button class="cg-pill-remind" style="margin-right:6px" onclick="chipMakeAdmin(\''+uid+'\')">'+(isCW?'Mtsogoleri':'Make admin')+'</button>':'')+'<span class="cg-order-st" style="color:'+color+'">'+label+'</span>'+(canRemove?'<button class="cg-row-x" onclick="chipRemoveMember(\''+uid+'\')" title="'+(isCW?'Chotsani':'Remove')+'"><i data-lucide="x" style="width:14px;height:14px"></i></button>':'')+'</div>';
    });
    if(curUser && curUser.uid!==grp.createdBy){
      h+='<button class="cg-link-danger" style="color:var(--mid);margin-top:10px" onclick="chipLeaveGroup()">'+(isCW?'Tulukani mu gululi':'Leave this group')+'</button>';
    }
  } else {
    h+=chipHistoryHtml(grp);
  }

  h+='</div>';
  setView(h);
}

function cpChipCode(code){ navigator.clipboard && navigator.clipboard.writeText(code).then(()=>toast(lang==='cw'?'Khodi yakopedwa':'Code copied','i')).catch(()=>toast(lang==='cw'?'Khodi yakopedwa':'Code copied','i')); }
function waChipCode(code){ window.open('https://wa.me/?text='+encodeURIComponent('Join my Chipereganyu on Bajeti Yanga!\nCode: '+code),'_blank'); }

// What to write to the group when a member leaves or is removed. Whoever has already paid this round keeps counting:
// their payment moves to currentCycle.departedPaid instead of vanishing with their entry.
function chipDeparturePatch(grp, uid){
  const patch={
    memberUids: firebase.firestore.FieldValue.arrayRemove(uid),
    rotationOrder: firebase.firestore.FieldValue.arrayRemove(uid)
  };
  patch['members.'+uid]=firebase.firestore.FieldValue.delete();
  if(grp.status==='active' && grp.currentCycle){
    const entry=(grp.currentCycle.contributions||{})[uid];
    patch['currentCycle.contributions.'+uid]=firebase.firestore.FieldValue.delete();
    if(entry && entry.paid) patch['currentCycle.departedPaid.'+uid]={name:String(((grp.members[uid]||{}).name)||'').slice(0,40), paid:true};
  }
  return patch;
}
// Has this member already had their turn in the lap that is still running?
function chipReceivedMidLap(grp, uid){
  return grp.status==='active' && chipLapInfo(grp).receivedThisLap.indexOf(uid)>-1;
}

function chipLeaveGroup(){
  const grp=activeChipGroup(); if(!grp||!curUser) return;
  const isCW=lang==='cw';
  if(curUser.uid===grp.createdBy){ toast(isCW?'Mtsogoleri sangatuluke. Chotsani gululi m’malo mwake.':'The admin can’t leave. Delete the group instead.','e'); return; }
  if(grp.status==='active' && grp.currentCycle && curUser.uid===grp.currentCycle.recipientUid){
    toast(isCW?'Simungatuluke pamene mukulandira gawo lino. Tsimikizani kutumiza kaye.':'You can’t leave while it’s your turn to receive this round. That payout needs to be confirmed first.','e'); return;
  }
  const alreadyReceived = chipReceivedMidLap(grp, curUser.uid);
  const finished = grp.status==='completed' || grp.status==='closed';
  const doLeave=function(){
    setDot('spin');
    db.collection('chipereganyu_groups').doc(grp.id).update(chipDeparturePatch(grp, curUser.uid)).then(function(){
      setDot(''); chipActiveId=null; toast(isCW?'Mwatuluka mu gulu':'Left the group','i'); go('home');
    }).catch(function(e){ setDot('off'); toast(fsErrMsg(e),'e'); });
  };
  if(alreadyReceived){
    // They've already taken a payout this lap but the lap isn't done, so
    // leaving now means the app has no further way to collect their share
    // toward everyone else's turn. Can't be prevented outright (no bank
    // integration to hold them to it), but this makes the tradeoff explicit
    // instead of a silent, clean-looking exit.
    appConfirm(isCW?'Mudalandira kale ndalama pa gawo lino ndipo simunamalize kulipira ena onse. Mukatuluka tsopano, app sidzathanso kutola ndalama zimenezo. Mutulukebe?':'You already received a payout this lap and haven’t finished contributing to everyone else’s turn yet. Leaving now means the app can’t collect that from you going forward. Leave anyway?', doLeave, isCW?'Tulukani':'Leave anyway', true);
  } else {
    appConfirm(finished?(isCW?'Chotsani Chipereganyu ichi pa mndandanda wanu?':'Remove this circle from your list?'):(isCW?'Mutuluka mu gululi?':'Leave this group?'), doLeave, finished?(isCW?'Chotsani':'Remove'):(isCW?'Tulukani':'Leave'), true);
  }
}

function chipRemoveMember(uid){
  const grp=activeChipGroup(); if(!grp||!curUser||grp.createdBy!==curUser.uid) return;
  const isCW=lang==='cw';
  if(grp.status==='active' && grp.currentCycle && uid===grp.currentCycle.recipientUid){
    toast(isCW?'Simungachotse amene akulandira gawo lino. Tsimikizani kutumiza kaye.':'Can’t remove the person currently receiving this round. Confirm that payout first.','e'); return;
  }
  const nm=esc((grp.members[uid]||{}).name||'');
  const alreadyReceived = chipReceivedMidLap(grp, uid);
  const doRemove=function(){
    setDot('spin');
    db.collection('chipereganyu_groups').doc(grp.id).update(chipDeparturePatch(grp, uid)).then(function(){
      setDot(''); toast(isCW?'Wachotsedwa':'Removed','i');
    }).catch(function(e){ setDot('off'); toast(fsErrMsg(e),'e'); });
  };
  if(alreadyReceived){
    appConfirm((isCW?nm+' walandira kale ndalama pa gawo lino ndipo sanamalize kulipira ena onse. Mukamuchotsa tsopano, app sidzathanso kutola ndalama zimenezo. Mumuchotsebe?':nm+' already received a payout this lap and hasn’t finished contributing to everyone else’s turn yet. Removing them now means the app can’t collect that going forward. Remove anyway?'), doRemove, isCW?'Chotsani':'Remove anyway', true);
  } else {
    appConfirm((isCW?'Chotsani ':'Remove ')+nm+(isCW?' mgululi?':' from the group?'), doRemove, isCW?'Chotsani':'Remove', true);
  }
}

function chipDeleteGroup(){
  const grp=activeChipGroup(); if(!grp||!curUser||grp.createdBy!==curUser.uid) return;
  const isCW=lang==='cw';
  if(grp.status==='active'){ toast(isCW?'Simungathe kuchotsa gulu lomwe likuzungulira. Dikirani mpaka kuzungulira kuthe, kenako mutseke.':'Can’t delete a circle in the middle of a lap. Finish the lap, then close or delete it.','e'); return; }
  const hasHistory=(grp.history||[]).length>0;
  appConfirm(hasHistory
      ? (isCW?'Chotsani gulu lonseli ndi mbiri yake kwa mamembala onse? Izi sizingasinthidwe.':'Delete this circle and its whole history for every member? This can’t be undone.')
      : (isCW?'Chotsani gulu lonseli? Izi sizingasinthidwe.':'Delete this group entirely? This can’t be undone.'), function(){
    setDot('spin');
    db.collection('chipereganyu_groups').doc(grp.id).delete().then(function(){
      setDot(''); chipActiveId=null; toast(isCW?'Gulu lachotsedwa':'Group deleted','i'); go('home');
    }).catch(function(e){ setDot('off'); toast(fsErrMsg(e),'e'); });
  }, isCW?'Chotsani':'Delete', true);
}

function chipMakeAdmin(uid){
  const grp=activeChipGroup(); if(!grp||!curUser||grp.createdBy!==curUser.uid) return;
  const isCW=lang==='cw';
  const nm=esc((grp.members[uid]||{}).name||'');
  appConfirm((isCW?'Sankhani ':'Make ')+nm+(isCW?' kukhala mtsogoleri?':' the new admin?'), function(){
    setDot('spin');
    db.collection('chipereganyu_groups').doc(grp.id).update({createdBy:uid}).then(function(){
      setDot(''); toast(isCW?'Mtsogoleri watsopano wasankhidwa':'New admin set','i');
    }).catch(function(e){ setDot('off'); toast(fsErrMsg(e),'e'); });
  }, isCW?'Sankhani':'Make admin', false);
}

// Bumps a member one place earlier in the rotation, e.g. "Mary needs the money urgently" -> admin moves her ahead
// of whoever was next after her. During a lap it refuses to cross the current recipient or anyone who has already
// received IN THIS LAP (that is the one thing that matters: skipping someone who has already had their turn), and
// the lap is worked out per lap, so a member who received in an earlier lap is movable again. Between laps
// (status 'completed') any member can be moved, to set the order of the next lap.
// This is a client-side guard only: the Firestore rule (validChipReorder) can only confirm the result is a genuine
// permutation of the same members, not that frozen members kept their place.
function chipMoveUp(uid){
  const grp=activeChipGroup(); if(!grp) return;
  const isCW=lang==='cw';
  if(!curUser||grp.createdBy!==curUser.uid){ toast(isCW?'Ndi mtsogoleri yekha amene angasinthe dongosolo':'Only the admin can reorder the rotation','e'); return; }
  const order=(grp.rotationOrder||[]).slice();
  const idx=order.indexOf(uid);
  if(idx<1) return; // not found, or already at the front -- nothing to move past
  if(grp.status==='active' && grp.currentCycle){
    const cc=grp.currentCycle, got=chipLapInfo(grp).receivedThisLap;
    if(uid===cc.recipientUid || got.indexOf(uid)>-1){
      toast(isCW?'Ameneyu walandira kale':'This member has already received their payout','e'); return;
    }
    const prevUid=order[idx-1];
    if(prevUid===cc.recipientUid || got.indexOf(prevUid)>-1){
      toast(isCW?'Simungapitirire pa wolandira wapano':'Can’t move ahead of the current recipient','e'); return;
    }
  } else if(grp.status!=='completed'){ return; }
  const prev=order[idx-1];
  order[idx-1]=uid; order[idx]=prev;
  setDot('spin');
  db.collection('chipereganyu_groups').doc(grp.id).update({rotationOrder:order}).then(function(){
    setDot(''); toast(isCW?'Dongosolo lasinthidwa':'Rotation order updated','i');
  }).catch(function(e){ setDot('off'); toast(fsErrMsg(e),'e'); });
}

function appConfirm(msg, onOk, okLabel, danger){
  const isCW = lang === 'cw';
  const isGenericDelete = danger && !okLabel;
  const cancelLabel = isGenericDelete ? (isCW?'Ayi, sungani':'No, keep it') : (isCW?'Letsani':'Cancel');
  const confirmLabel = okLabel || (danger ? (isCW?'Inde, Chotsani!':'Yes, Delete!') : (isCW?'Tsimikizani':'Confirm'));
  const box=g('mb-confirm');
  box.innerHTML='<div class="dh"></div>'
    +'<div style="padding:4px 0 18px;font-size:.88rem;line-height:1.6;color:var(--txt)">'+msg+'</div>'
    +'<div style="display:flex;gap:10px">'
    +'<button class="btnG" style="flex:1" onclick="closeM(\'mv-confirm\')">'+cancelLabel+'</button>'
    +'<button class="btnM" style="flex:1'+(danger?';background:#C62828;box-shadow:0 4px 12px rgba(198,40,40,.3)':'')+'" onclick="closeM(\'mv-confirm\');(window._appConfirmCb&&window._appConfirmCb())">'+confirmLabel+'</button>'
    +'</div>';
  window._appConfirmCb=onOk;
  openM('mv-confirm');
}

function logout(){
  appConfirm(tx().confirmLogout, function(){
  if(unsub){unsub();unsub=null;}  // Clear local state only — keep Firestore householdId intact so partners aren't affected.
  if(unsubHH){unsubHH();unsubHH=null;}
  if(unsubJoinBadge){unsubJoinBadge();unsubJoinBadge=null;}
  stopChipListener();
  // bootApp will re-read Firestore on next login and route correctly.
  localStorage.removeItem('nb_household');
  localStorage.removeItem('nb_uid');
  hhId=null; lCfg=JSON.parse(JSON.stringify(DEF_CFG)); lPx=[];
  authReg=false;
  auth.signOut().catch(()=>{});
  chatHistory=[]; 
  toast((lang==='cw'?'Tionana posachedwa!':'See you soon!'),'i');
  }, 'Sign Out', true);
}

