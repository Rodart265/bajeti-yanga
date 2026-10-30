// ===============================================
// CHIPEREGANYU (rotating savings circle)
// ===============================================
// Data model — doc chipereganyu_groups/{code} (code = same style as household join codes):
//   name, contributionAmount, frequency ('monthly'|'weekly'), currency,
//   createdBy (uid), createdAt, memberUids:[uid,...] (for the array-contains query),
//   members:{uid:{name,color,joinedAt}}, rotationOrder:[uid,...],
//   status:'gathering'|'active',
//   currentCycle:{cycleNumber,recipientUid,dueDate,amount,contributions:{uid:{paid,paidAt,confirmedBy}}} | null,
//   history:[{cycleNumber,recipientUid,amount,date}]
// Membership is keyed on the signed-in account (curUser.uid), independent of
// household — one person can belong to a Chipereganyu circle with people who
// each have their own separate Bajeti Yanga household.

function activeChipGroup(){ return chipGroups.find(g=>g.id===chipActiveId) || chipGroups[0] || null; }
function setChipActive(id){ chipActiveId=id; chipTab='cycle'; rChip(); }
function setChipTab(t){ chipTab=t; rChip(); }

function chipNextDue(freq){
  if(freq==='weekly'){ const d=new Date(); d.setDate(d.getDate()+7); return localISO(d); }
  return addMonthClamped(today()); // clamps 31 Jan -> 28/29 Feb instead of rolling into March
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
  h+='<p style="font-size:.8rem;color:var(--mid);margin-bottom:12px">'+(isCW?'Sungani ndalama pamodzi ndi anzanu, mmodzi ndi mmodzi akulandira.':'Save together with a group, taking turns to receive the pot.')+'</p>';
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
}

function openChipCreate(){
  const isCW=lang==='cw';
  let h='<div class="dh"></div><h3><i data-lucide="plus-circle" style="width:16px;height:16px;margin-right:5px;vertical-align:-3px;color:var(--p1)"></i>'+(isCW?'Chipereganyu chatsopano':'New Chipereganyu')+'</h3>';
  h+='<div class="fsec"><label class="fl">'+(isCW?'Dzina la gulu':'Group name')+'</label><input type="text" class="fi" id="cg-name" placeholder="e.g. Family Chipereganyu"></div>';
  h+='<div class="fsec"><label class="fl">'+(isCW?'Ndalama pa munthu aliyense':'Contribution per member')+'</label><input type="number" class="fi" id="cg-amt" inputmode="numeric" placeholder="5000"></div>';
  h+='<div class="fsec"><label class="fl">'+(isCW?'Kangati':'Frequency')+'</label><div class="usel"><div class="usb on" id="cg-freq-monthly" onclick="chipPickFreq(\'monthly\')" style="flex:1"><div class="usnm">'+(isCW?'Mwezi ndi mwezi':'Monthly')+'</div></div><div class="usb" id="cg-freq-weekly" onclick="chipPickFreq(\'weekly\')" style="flex:1"><div class="usnm">'+(isCW?'Sabata ndi sabata':'Weekly')+'</div></div></div><input type="hidden" id="cg-freq" value="monthly"></div>';
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
  const code=randCode();
  const me=actU();
  const doc={
    name:name, contributionAmount:amt, frequency:freq, currency:'MWK',
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
  }).catch(function(e){ setDot('off'); if(btn) btn.disabled=false; toast((lang==='cw'?'Zalephera: ':'Failed: ')+(e&&e.code||'error'),'e'); });
}

function openChipJoin(){
  const isCW=lang==='cw';
  let h='<div class="dh"></div><h3><i data-lucide="log-in" style="width:16px;height:16px;margin-right:5px;vertical-align:-3px;color:var(--p1)"></i>'+(isCW?'Lowani mu Chipereganyu':'Join a Chipereganyu')+'</h3>';
  h+='<div class="fsec"><label class="fl">'+(isCW?'Nambala yolowera':'Group code')+'</label><input type="text" class="fi" id="cg-code" placeholder="e.g. a2f9k3xz" autocapitalize="none" autocorrect="off"></div>';
  h+='<div style="display:flex;gap:8px;margin-top:6px"><button class="btnG" style="flex:1" onclick="closeM(\'mv-e\')">'+(isCW?'Letsani':'Cancel')+'</button><button class="btnM" style="flex:2" onclick="joinChipGroup(this)"><i data-lucide="log-in" style="width:14px;height:14px;margin-right:4px;vertical-align:middle"></i>'+(isCW?'Lowani':'Join')+'</button></div>';
  g('mb-e').innerHTML=h; initIcons(); openM('mv-e');
}

function joinChipGroup(btn){
  const isCW=lang==='cw';
  const code=val('cg-code').trim().toLowerCase();
  if(!code){ toast(isCW?'Lowetsani nambala':'Please enter a code','e'); return; }
  if(!_validCode(code)){ toast(isCW?'Nambala siikuoneka bwino':'That code does not look right','e'); return; }
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
      if(outcome.already) toast(isCW?'Mulili mmenemo kale':'You are already in this group','i');
      else toast((isCW?'Mwalowa mu ':'Joined ')+(outcome.name||'Chipereganyu'),'s');
      openChipView();
    })
    .catch(function(e){
      setDot('off'); if(btn) btn.disabled=false;
      if(e&&e.code==='not-found') toast(isCW?'Nambala sipezeka':'Code not found','e');
      else if(e&&e.code==='already-started') toast(isCW?'Gululi lidayamba kale kuzungulira':'This group has already started its rotation','e');
      else if(e&&e.code==='cannot-join') toast(isCW?'Simungalowe. Onani nambala, kapena gululi lingakhale lidayamba kale.':'Could not join. Check the code, or the group may already have started its rotation.','e');
      else toast((lang==='cw'?'Zalephera: ':'Failed: ')+(e&&e.code||'error'),'e');
    });
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
      const contributions={};
      order.forEach(function(u){ if(u!==order[0]) contributions[u]={paid:false,paidAt:null,confirmedBy:null}; });
      tx.update(ref,{
        status:'active',
        currentCycle:{
          cycleNumber:1,
          recipientUid:order[0],
          dueDate:chipNextDue(d.frequency),
          amount:d.contributionAmount*(order.length-1),
          contributions:contributions
        }
      });
    });
  }).then(function(){ setDot(''); if(btn) btn.disabled=false; toast(isCW?'Chipereganyu chayamba!':'Chipereganyu started!','s'); })
    .catch(function(e){
      setDot('off'); if(btn) btn.disabled=false;
      if(e&&e.code==='already-started') toast(isCW?'Gululi lidayamba kale':'This group has already started','i');
      else if(e&&e.code==='too-few') toast(isCW?'Muyenera membala osachepera 2 kuti muyambe':'You need at least 2 members to start','e');
      else toast((lang==='cw'?'Zalephera: ':'Failed: ')+(e&&e.code||'error'),'e');
    });
}

function chipTogglePaid(uid, btn){
  const grp=activeChipGroup(); if(!grp||!grp.currentCycle) return;
  const isCW=lang==='cw';
  const cc=grp.currentCycle;
  const isSelf = curUser && uid===curUser.uid;
  const isRecipientUser = curUser && curUser.uid===cc.recipientUid;
  const isAdminUser = curUser && curUser.uid===grp.createdBy;
  if(!isSelf && !isRecipientUser && !isAdminUser){ toast(isCW?'Ndinu, wolandira, kapena mtsogoleri yekha amene angasinthe izi':'Only you, the recipient, or the admin can update this','e'); return; }
  const cur=grp.currentCycle.contributions[uid]||{};
  const next=!cur.paid;
  const patch={};
  patch['currentCycle.contributions.'+uid+'.paid']=next;
  patch['currentCycle.contributions.'+uid+'.paidAt']= next?firebase.firestore.FieldValue.serverTimestamp():null;
  patch['currentCycle.contributions.'+uid+'.confirmedBy']= next?curUser.uid:null;
  if(btn) btn.disabled=true;
  // Tag ties this specific budget entry back to this group+cycle+member, so
  // un-marking can find and remove it again below instead of leaving a
  // stale expense behind.
  const chipTag=grp.id+'#'+cc.cycleNumber+'#'+uid;
  // Deterministic id: marking paid twice (or from two devices) writes the SAME budget entry instead of a duplicate,
  // and un-marking can delete it by id even if it hasn't synced into lPx yet.
  const expDocId='chip_'+_hashStr(chipTag);
  const gRef=db.collection('chipereganyu_groups').doc(grp.id);
  // Transaction + cycle check: if the cycle advanced since this screen rendered, don't write the patch into the NEW cycle.
  db.runTransaction(function(tx){
    return tx.get(gRef).then(function(snap){
      const gd=snap.exists?snap.data():null;
      if(!gd || !gd.currentCycle || gd.currentCycle.cycleNumber!==cc.cycleNumber) throw {code:'stale-cycle'};
      tx.update(gRef,patch);
    });
  }).catch(function(e){
    // Transactions need a server round-trip. Offline (common here), fall back to a plain update, which Firestore queues and syncs later.
    if(e && e.code==='unavailable') return gRef.update(patch);
    throw e;
  }).then(function(){
    if(btn) btn.disabled=false;
    if(next && curUser && uid===curUser.uid){
      // Only auto-log to Bajeti Yanga's own budget when marking YOUR OWN contribution --
      // we can't write into another member's household purchases collection.
      addPx({item:(isCW?'Chipereganyu \u2014 '+grp.name:'Chipereganyu \u2014 '+grp.name), date:today(), timestamp:Date.now(), amount:grp.contributionAmount, userId:actU().id, type:'expense', notes:grp.name, chipTag:chipTag}, {docId:expDocId, quiet:true})
        .then(function(ok){
          toast(ok?(isCW?'Zalembedwa ndipo zawonjezedwa ku bajeti yanu':'Marked as paid and logged to your budget')
                  :(isCW?'Zalembedwa, koma sizinawonjezedwe ku bajeti yanu':'Marked as paid, but it could not be logged to your budget'), ok?'s':'i');
        });
    } else if(!next && isSelf){
      // Un-marking your own contribution: find the matching auto-logged
      // expense (by chipTag) and remove it too, so the budget doesn't keep
      // an entry for a payment that's no longer marked as made. Best-effort:
      // if the entry hasn't synced into lPx yet (rare race with the
      // purchases listener), there's nothing to find and it's skipped.
      const match=lPx.find(function(p){ return p.chipTag===chipTag; });
      delPx(match?match.id:expDocId).then(function(){
        toast(isCW?'Walembedwa kuti sanalipire, ndipo ndalamayo yachotsedwa ku bajeti yanu':'Marked as unpaid and removed from your budget','i');
      }).catch(function(){});
    } else {
      toast(next?(isCW?'Walembedwa kuti walipira':'Marked as paid'):(isCW?'Walembedwa kuti sanalipire':'Marked as unpaid'),'s');
    }
  }).catch(function(e){
    if(btn) btn.disabled=false;
    if(e && e.code==='stale-cycle') toast(isCW?'Gawoli lasintha kale. Pangani refresh.':'This round has already moved on. Please refresh.','e');
    else toast((lang==='cw'?'Kusintha kwalephera: ':'Update failed: ')+(e&&e.code||'error'),'e');
  });
}

function chipRemind(uid){
  const grp=activeChipGroup(); if(!grp) return;
  const isCW=lang==='cw';
  const nm=(grp.members[uid]||{}).name||'';
  // Client-side nudge only for now -- no push notification wired up yet.
  toast((isCW?'Chikumbutso chatumizidwa kwa ':'Reminder sent to ')+nm,'i');
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
  let payoutInfo=null;
  db.runTransaction(function(tx){
    return tx.get(ref).then(function(doc){
      if(!doc.exists) throw {code:'missing'};
      const d=doc.data();
      const cur=d.currentCycle;
      if(!cur) throw {code:'no-cycle'};
      const contributors=(d.rotationOrder||[]).filter(u=>u!==cur.recipientUid);
      const allPaid=contributors.length>0 && contributors.every(u=>cur.contributions[u]&&cur.contributions[u].paid);
      if(!allPaid && !force) throw {code:'not-all-paid'};
      const idx=d.rotationOrder.indexOf(cur.recipientUid);
      const nextRecipient=d.rotationOrder[(idx+1)%d.rotationOrder.length];
      const newContributions={};
      d.rotationOrder.forEach(function(u){ if(u!==nextRecipient) newContributions[u]={paid:false,paidAt:null,confirmedBy:null}; });
      const histEntry={cycleNumber:cur.cycleNumber, recipientUid:cur.recipientUid, amount:cur.amount, date:today(), contributions:cur.contributions};
      // Income to log = what was actually contributed (a force-confirmed short round pays out less than cur.amount).
      const paidCount=contributors.filter(u=>cur.contributions[u]&&cur.contributions[u].paid).length;
      payoutInfo={wasMyPayout: curUser && cur.recipientUid===curUser.uid, amount:paidCount*d.contributionAmount, groupName:d.name, cycleNumber:cur.cycleNumber, groupId:grp.id};
      tx.update(ref,{
        history: firebase.firestore.FieldValue.arrayUnion(histEntry),
        currentCycle:{
          cycleNumber:cur.cycleNumber+1,
          recipientUid:nextRecipient,
          dueDate:chipNextDue(d.frequency),
          amount:d.contributionAmount*(d.rotationOrder.length-1),
          contributions:newContributions
        }
      });
    });
  }).then(function(){
    setDot(''); if(btn) btn.disabled=false;
    if(payoutInfo && payoutInfo.wasMyPayout){
      // Only log an income entry when the current signed-in account is the one receiving --
      // we can't write into another member's household budget.
      const _ptag=payoutInfo.groupId+'#'+payoutInfo.cycleNumber+'#payout';
      if(payoutInfo.amount>0) addPx({item:(isCW?'Chipereganyu \u2014 '+payoutInfo.groupName:'Chipereganyu \u2014 '+payoutInfo.groupName), date:today(), timestamp:Date.now(), amount:payoutInfo.amount, userId:actU().id, type:'income', notes:payoutInfo.groupName, chipTag:_ptag}, {docId:'chip_'+_hashStr(_ptag), quiet:true});
    }
    toast(isCW?'Ndalama zatsimikizidwa!':'Payout confirmed!','s');
  }).catch(function(e){
    setDot('off'); if(btn) btn.disabled=false;
    if(e && e.code==='not-all-paid') toast(isCW?'Onse asanalipire':'Not everyone has paid yet','e');
    else toast((lang==='cw'?'Zalephera: ':'Failed: ')+(e&&e.code||'error'),'e');
  });
}

function chipForceConfirmPrompt(){
  const grp=activeChipGroup(); if(!grp||!grp.currentCycle||!curUser||curUser.uid!==grp.createdBy) return;
  const isCW=lang==='cw';
  const cc=grp.currentCycle;
  const unpaidNames=grp.rotationOrder.filter(function(u){ return u!==cc.recipientUid && !(cc.contributions[u]&&cc.contributions[u].paid); }).map(function(u){ return esc((grp.members[u]||{}).name||'?'); }).join(', ');
  appConfirm(
    (isCW
      ? (unpaidNames+' sanalipire. Kutsimikizira tsopano kudzasiya mbiri yosonyeza kuti sanalipire, ndipo sizingasinthidwe. Pitirizani?')
      : (unpaidNames+' hasn\u2019t paid yet. Confirming now will record this round as short and can\u2019t be undone. Continue anyway?')),
    function(){ chipConfirmPayout(null, true); },
    isCW?'Tsimikizani chonse':'Force confirm',
    true
  );
}

function renderChipHomeCard(){
  const isCW=lang==='cw';
  if(!chipGroups.length){
    return '<div class="cg-empty-card" onclick="openChipEntry()"><div class="cg-empty-ico"><i data-lucide="rotate-cw" style="width:20px;height:20px;color:var(--p1)"></i></div><div style="flex:1"><div class="cg-empty-ttl">Chipereganyu <span class="cg-new-tag">NEW</span></div><div class="cg-empty-sub">'+(isCW?'Yambani kapena lowani mu gulu':'Start or join a savings circle')+'</div></div><i data-lucide="chevron-right" style="color:var(--p1);flex-shrink:0"></i></div>';
  }
  const grp=activeChipGroup(); if(!grp) return '';
  if(grp.status!=='active'||!grp.currentCycle){
    const n=Object.keys(grp.members||{}).length;
    return '<div class="cg-home-card" onclick="openChipView()"><div class="cg-empty-ico" style="width:46px;height:46px;background:var(--p1-bg)"><i data-lucide="users" style="width:20px;height:20px;color:var(--p1)"></i></div><div class="cg-home-main"><div class="cg-home-ttl">'+esc(grp.name)+'</div><div class="cg-home-sub">'+n+' '+(isCW?'alowa \u00b7 akusonkhana':'joined \u00b7 gathering members')+'</div></div><i data-lucide="chevron-right" style="color:var(--p1);flex-shrink:0"></i></div>';
  }
  const cc=grp.currentCycle;
  const contributors=grp.rotationOrder.filter(u=>u!==cc.recipientUid);
  const paidCount=contributors.filter(u=>cc.contributions[u]&&cc.contributions[u].paid).length;
  const pct=contributors.length?paidCount/contributors.length:0;
  const recipientName=(grp.members[cc.recipientUid]||{}).name||'?';
  const circ2=2*Math.PI*19;
  return '<div class="cg-home-card" onclick="openChipView()"><div class="cg-mini"><svg width="46" height="46" viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" fill="none" stroke="var(--border)" stroke-width="4"/><circle cx="23" cy="23" r="19" fill="none" stroke="var(--p1)" stroke-width="4" stroke-linecap="round" stroke-dasharray="'+circ2.toFixed(1)+'" stroke-dashoffset="'+(circ2*(1-pct)).toFixed(1)+'"/></svg><div class="cg-mini-lbl">'+paidCount+'/'+contributors.length+'</div></div><div class="cg-home-main"><div class="cg-home-ttl">Chipereganyu</div><div class="cg-home-sub">'+esc(recipientName.split(' ')[0])+(isCW?'\u2019s gawo \u00b7 '+fmtDate(cc.dueDate):'\u2019s turn \u00b7 due '+fmtDate(cc.dueDate))+'</div></div><i data-lucide="chevron-right" style="color:var(--p1);flex-shrink:0"></i></div>';
}

function rChip(){
  const isCW=lang==='cw';
  const grp=activeChipGroup();
  if(!grp){
    let h0='<div class="page"><div class="cg-back" onclick="go(\'home\')"><i data-lucide="chevron-left"></i><div class="cg-title">Chipereganyu</div></div>';
    h0+='<div class="empty"><p><strong>'+(isCW?'Mulibe gulu lililonse.':'No group yet.')+'</strong></p></div></div>';
    setView(h0); return;
  }
  let h='<div class="page">';
  h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
  h+='<div class="cg-back" style="flex:1" onclick="go(\'home\')"><i data-lucide="chevron-left"></i><div><div class="cg-title">'+esc(grp.name)+'</div><div class="cg-sub">'+(Object.keys(grp.members||{}).length)+' '+(isCW?((Object.keys(grp.members||{}).length)===1?'membala':'mamembala'):'members')+'</div></div></div>';
  h+='<button class="btnG" style="padding:7px 10px" onclick="openChipEntry()"><i data-lucide="plus" style="width:13px;height:13px"></i></button>';
  h+='</div>';

  if(chipGroups.length>1){
    h+='<div style="display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;padding-bottom:2px">';
    chipGroups.forEach(function(g2){
      h+='<button class="btnG" style="white-space:nowrap;padding:6px 12px'+(g2.id===grp.id?';background:var(--p1);color:#fff;border-color:var(--p1)':'')+'" data-gid="'+esc(g2.id)+'" onclick="setChipActive(this.dataset.gid)">'+esc(g2.name)+'</button>';
    });
    h+='</div>';
  }

  if(grp.status!=='active'||!grp.currentCycle){
    const isAdmin = curUser && grp.createdBy===curUser.uid;
    h+='<div class="card"><div class="ch"><h2><i data-lucide="users" style="width:15px;height:15px;margin-right:5px;vertical-align:middle;color:var(--p1)"></i>'+(isCW?'Akusonkhanitsa mamembala':'Gathering members')+'</h2></div><div class="cb">';
    h+='<div class="cg-code-box">'+grp.id+'</div>';
    h+='<div style="display:flex;gap:8px;margin-bottom:14px"><button class="btnG" style="flex:1" onclick="cpChipCode(\''+grp.id+'\')"><i data-lucide="copy" style="width:13px;height:13px;margin-right:4px;vertical-align:middle"></i>'+(isCW?'Koperani':'Copy')+'</button><button class="btnG" style="flex:1" onclick="waChipCode(\''+grp.id+'\')"><i data-lucide="share-2" style="width:13px;height:13px;margin-right:4px;vertical-align:middle"></i>WhatsApp</button></div>';
    (grp.rotationOrder||[]).forEach(function(uid,i){
      const m=grp.members[uid]||{name:'?',color:'#999'};
      const isAdminRow=uid===grp.createdBy;
      h+='<div class="cg-row"><span class="cg-order-num">'+(i+1)+'</span><div class="cg-av2" style="background:'+sC(m.color)+'30">'+esc((m.name||'?')[0])+'</div><b style="font-size:.8rem;flex:1">'+esc(m.name)+(curUser&&uid===curUser.uid?' ('+(isCW?'Inu':'You')+')':'')+'</b>'+(isAdminRow?'<span style="font-size:.64rem;color:var(--p1);font-weight:700;margin-right:4px">'+(isCW?'Mtsogoleri':'Admin')+'</span>':'')+(isAdmin&&!isAdminRow?'<button class="cg-row-x" onclick="chipRemoveMember(\''+uid+'\')" title="'+(isCW?'Chotsani':'Remove')+'"><i data-lucide="x" style="width:14px;height:14px"></i></button>':'')+'</div>';
    });
    if(!isAdmin){
      h+='<button class="cg-link-danger" style="color:var(--mid)" onclick="chipLeaveGroup()">'+(isCW?'Tulukani mu gululi':'Leave this group')+'</button>';
    }
    if(isAdmin){
      h+='<button class="cg-cta on" onclick="startChipRotation(this)" style="margin-top:10px"><i data-lucide="play" style="width:14px;height:14px;margin-right:5px;vertical-align:middle"></i>'+(isCW?'Yambani Chipereganyu':'Start Chipereganyu')+'</button>';
      if((grp.rotationOrder||[]).length<2) h+='<p style="font-size:.7rem;color:var(--mid);text-align:center;margin-top:8px">'+(isCW?'Muyenera kukhala ndi mamembala osachepera awiri kuti muyambe.':'You need at least 2 members to start.')+'</p>';
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
  const contributors=grp.rotationOrder.filter(u=>u!==cc.recipientUid);
  const paidCount=contributors.filter(u=>cc.contributions[u]&&cc.contributions[u].paid).length;
  const pct=contributors.length?paidCount/contributors.length:0;
  const collected=paidCount*grp.contributionAmount;
  const circ=2*Math.PI*48;
  const recipientName=(grp.members[cc.recipientUid]||{}).name||'?';

  h+='<div style="text-align:center;margin-bottom:6px"><span class="cg-code-pill" onclick="cpChipCode(\''+grp.id+'\')" title="'+(isCW?'Kopelani nambala':'Tap to copy code')+'"><i data-lucide="hash" style="width:11px;height:11px"></i>'+grp.id+'<i data-lucide="copy" style="width:11px;height:11px"></i></span></div>';
  h+='<div class="cg-wheel">';
  h+='<svg class="cg-ring" width="250" height="250" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="none" stroke="var(--border)" stroke-width="3"/><circle cx="50" cy="50" r="48" fill="none" stroke="var(--g1)" stroke-width="3" stroke-linecap="round" stroke-dasharray="'+circ.toFixed(1)+'" stroke-dashoffset="'+(circ*(1-pct)).toFixed(1)+'" style="transition:stroke-dashoffset .5s"/></svg>';
  h+='<div class="cg-pot"><div class="cg-pot-lbl">'+(isCW?'Gawo ':'Round ')+cc.cycleNumber+'</div><div class="cg-pot-val">'+MK(collected)+'</div><div class="cg-pot-sub">'+(isCW?'mwa ':'of ')+MK(cc.amount)+'</div></div>';
  grp.rotationOrder.forEach(function(uid,i){
    const ang=(i*(360/grp.rotationOrder.length)-90)*Math.PI/180, R=38;
    const left=(50+R*Math.cos(ang))+'%', top=(50+R*Math.sin(ang))+'%';
    const m=grp.members[uid]||{name:'?'};
    const isRecipient=uid===cc.recipientUid;
    const receivedBefore=(grp.history||[]).some(function(hh){return hh.recipientUid===uid;});
    const status=isRecipient?'current':(receivedBefore?'done':'');
    const pendingPay=!isRecipient && !(cc.contributions[uid]&&cc.contributions[uid].paid);
    h+='<div class="cg-node" style="left:'+left+';top:'+top+'">';
    h+='<div class="cg-av '+status+'">'+esc((m.name||'?')[0]);
    if(status==='done') h+='<div class="cg-badge ok"><i data-lucide="check" style="width:9px;height:9px;color:#fff"></i></div>';
    if(pendingPay) h+='<div class="cg-badge due"></div>';
    h+='</div><div class="cg-nm'+(isRecipient?' current':'')+'">'+esc((m.name||'?').split(' ')[0])+'</div></div>';
  });
  h+='</div>';

  h+='<div class="cg-status"><div class="cg-status-1">'+(isCW?'Ndi nthawi ya '+esc(recipientName.split(' ')[0])+' yolandira':esc(recipientName.split(' ')[0])+'\u2019s turn to receive')+'</div><div class="cg-status-2"><i data-lucide="clock" style="width:12px;height:12px"></i>'+(isCW?'Lipira pofika ':'Due ')+fmtDate(cc.dueDate)+' \u00b7 '+paidCount+'/'+contributors.length+' '+(isCW?'alipira':'paid')+'</div></div>';

  h+='<div class="cg-tabs">';
  h+='<button class="cg-tab'+(chipTab==='cycle'?' on':'')+'" onclick="setChipTab(\'cycle\')">'+(isCW?'Gawo lino':'This cycle')+'</button>';
  h+='<button class="cg-tab'+(chipTab==='order'?' on':'')+'" onclick="setChipTab(\'order\')">'+(isCW?'Mzere':'Rotation')+'</button>';
  h+='<button class="cg-tab'+(chipTab==='hist'?' on':'')+'" onclick="setChipTab(\'hist\')">'+(isCW?'Mbiri':'History')+'</button>';
  h+='</div>';

  if(chipTab==='cycle'){
    const isRecipientView = curUser && curUser.uid===cc.recipientUid;
    const isAdminView = curUser && curUser.uid===grp.createdBy;
    contributors.forEach(function(uid){
      const m=grp.members[uid]||{name:'?',color:'#999'};
      const paidInfo=cc.contributions[uid]||{};
      const isSelfRow = curUser && uid===curUser.uid;
      h+='<div class="cg-row"><div class="cg-av2" style="background:'+sC(m.color)+'30">'+esc((m.name||'?')[0])+'</div><div class="cg-row-info"><b>'+esc(m.name)+(isSelfRow?' ('+(isCW?'Inu':'You')+')':'')+'</b><span>'+MK(grp.contributionAmount)+'</span></div>';
      if(paidInfo.paid){
        h+='<div class="cg-pill-ok"><i data-lucide="check" style="width:10px;height:10px"></i>'+(isCW?'Walipira':'Paid')+'</div>';
      } else if(isRecipientView || isSelfRow || isAdminView){
        h+='<div class="cg-pill-actions"><button class="cg-pill-remind" onclick="chipRemind(\''+uid+'\')"><i data-lucide="bell" style="width:11px;height:11px"></i></button><button class="cg-pill-mark" onclick="chipTogglePaid(\''+uid+'\',this)">'+(isCW?'Walipira':'Mark paid')+'</button></div>';
      } else {
        h+='<div class="cg-pill-actions"><button class="cg-pill-remind" onclick="chipRemind(\''+uid+'\')"><i data-lucide="bell" style="width:11px;height:11px"></i></button></div>';
      }
      h+='</div>';
    });
    const allPaid=contributors.length>0 && paidCount===contributors.length;
    const canConfirm = curUser && (curUser.uid===cc.recipientUid || curUser.uid===grp.createdBy);
    if(allPaid && canConfirm){
      h+='<button class="cg-cta on" onclick="chipConfirmPayout(this)">'+(isCW?'Tsimikizani kutumiza kwa '+esc(recipientName.split(' ')[0]):'Confirm payout to '+esc(recipientName.split(' ')[0]))+'</button>';
    } else if(allPaid){
      h+='<div style="text-align:center;font-size:.72rem;color:var(--mid);padding:12px 0">'+(isCW?'Onse alipira \u2014 mukudikira '+esc(recipientName.split(' ')[0])+' kuti atsimikizire':'All paid \u2014 waiting for '+esc(recipientName.split(' ')[0])+' to confirm')+'</div>';
    } else {
      h+='<button class="cg-cta off" disabled>'+(isCW?'Mukudikira '+(contributors.length-paidCount)+' ena':'Waiting on '+(contributors.length-paidCount)+' more contribution'+(contributors.length-paidCount===1?'':'s'))+'</button>';
      if(isAdminView){
        h+='<button class="cg-link-danger" style="margin-top:8px" onclick="chipForceConfirmPrompt()">'+(isCW?'Tsimikizani chonse ngakhale ena sanalipire':'Force confirm anyway')+'</button>';
      }
    }
  } else if(chipTab==='order'){
    const isAdminView = curUser && curUser.uid===grp.createdBy;
    const paidOutUids=(grp.history||[]).map(function(hh){return hh.recipientUid;});
    grp.rotationOrder.forEach(function(uid,i){
      const m=grp.members[uid]||{name:'?'};
      const isRecipient=uid===cc.recipientUid;
      const receivedBefore=paidOutUids.indexOf(uid)>-1;
      const isUpcoming=!isRecipient && !receivedBefore;
      const label=isRecipient?(isCW?'Akulandira tsopano':'Receiving now'):(receivedBefore?(isCW?'Analandira':'Received'):(isCW?'Akudikira':'Upcoming'));
      const color=isRecipient?'var(--p1)':(receivedBefore?'var(--g1)':'var(--mid)');
      // Only offer "move up" when the row right above is also upcoming --
      // i.e. not the current recipient or someone already paid this lap --
      // since those are frozen and chipMoveUp will refuse to cross them anyway.
      const prevUid=i>0?grp.rotationOrder[i-1]:null;
      const canMoveUp=isAdminView && isUpcoming && prevUid && prevUid!==cc.recipientUid && paidOutUids.indexOf(prevUid)<0;
      // Admin can remove anyone here except the current, unconfirmed recipient --
      // that payout has nowhere to go until it's confirmed. Removing someone who
      // already appears in `history` (received=true) is still allowed, but
      // chipRemoveMember shows an explicit warning first since it means they're
      // exiting without finishing their contributions to the rest of this lap.
      const canRemove=isAdminView && uid!==grp.createdBy && !isRecipient;
      h+='<div class="cg-row"><span class="cg-order-num">'+(i+1)+'</span><div class="cg-av2" style="background:'+(sC(m.color)||'#999')+'30">'+esc((m.name||'?')[0])+'</div><b style="font-size:.8rem;flex:1">'+esc(m.name)+'</b>'+(canMoveUp?'<button class="cg-pill-remind" style="margin-right:6px" onclick="chipMoveUp(\''+uid+'\')" title="'+(isCW?'Sinthani pamalo':'Move up')+'"><i data-lucide="arrow-up" style="width:11px;height:11px"></i></button>':'')+(isAdminView&&uid!==grp.createdBy?'<button class="cg-pill-remind" style="margin-right:6px" onclick="chipMakeAdmin(\''+uid+'\')">'+(isCW?'Mtsogoleri':'Make admin')+'</button>':'')+'<span class="cg-order-st" style="color:'+color+'">'+label+'</span>'+(canRemove?'<button class="cg-row-x" onclick="chipRemoveMember(\''+uid+'\')" title="'+(isCW?'Chotsani':'Remove')+'"><i data-lucide="x" style="width:14px;height:14px"></i></button>':'')+'</div>';
    });
    if(curUser && curUser.uid!==grp.createdBy){
      h+='<button class="cg-link-danger" style="color:var(--mid);margin-top:10px" onclick="chipLeaveGroup()">'+(isCW?'Tulukani mu gululi':'Leave this group')+'</button>';
    }
  } else {
    if(grp.history && grp.history.length){
      grp.history.slice().reverse().forEach(function(hh){
        const m=grp.members[hh.recipientUid]||{name:'?'};
        // Older entries (from before this snapshot field existed) won't have
        // `contributions` at all -- treat those as clean rather than short,
        // since we have no record either way.
        const short = hh.contributions && Object.keys(hh.contributions).some(function(u){ return !(hh.contributions[u]&&hh.contributions[u].paid); });
        h+='<div class="cg-row"><div class="cg-av2">'+esc((m.name||'?')[0])+'</div><div class="cg-row-info"><b>'+esc(m.name)+(short?' <span style="color:var(--warn,#B36B00);font-size:.68rem;font-weight:700">'+(isCW?'\u00b7 sanalipire onse':'\u00b7 not everyone paid')+'</span>':'')+'</b><span>'+(isCW?'Gawo ':'Round ')+hh.cycleNumber+' \u00b7 '+fmtDate(hh.date)+'</span></div><b style="color:var(--g1);font-size:.8rem">'+MK(hh.amount)+'</b></div>';
      });
    } else {
      h+='<p style="font-size:.75rem;color:var(--mid);text-align:center;padding:16px 0">'+(isCW?'Palibe gawo lomaliza.':'No completed rounds yet.')+'</p>';
    }
  }

  h+='</div>';
  setView(h);
}

function cpChipCode(code){ navigator.clipboard && navigator.clipboard.writeText(code).then(()=>toast(lang==='cw'?'Nambala yakoperedwa':'Code copied','i')).catch(()=>toast(lang==='cw'?'Nambala yakoperedwa':'Code copied','i')); }
function waChipCode(code){ window.open('https://wa.me/?text='+encodeURIComponent('Join my Chipereganyu on Bajeti Yanga!\nCode: '+code),'_blank'); }

function chipLeaveGroup(){
  const grp=activeChipGroup(); if(!grp||!curUser) return;
  const isCW=lang==='cw';
  if(curUser.uid===grp.createdBy){ toast(isCW?'Mtsogoleri sangatuluke. Chotsani gululi m\u2019malo mwake.':'The admin can\u2019t leave. Delete the group instead.','e'); return; }
  if(grp.status==='active' && grp.currentCycle && curUser.uid===grp.currentCycle.recipientUid){
    toast(isCW?'Simungatuluke pamene mukulandira gawo lino. Tsimikizani kutumiza kaye.':'You can\u2019t leave while it\u2019s your turn to receive this round. That payout needs to be confirmed first.','e'); return;
  }
  const alreadyReceived = grp.status==='active' && (grp.history||[]).some(function(hh){ return hh.recipientUid===curUser.uid; });
  const doLeave=function(){
    setDot('spin');
    const patch={
      memberUids: firebase.firestore.FieldValue.arrayRemove(curUser.uid),
      rotationOrder: firebase.firestore.FieldValue.arrayRemove(curUser.uid)
    };
    patch['members.'+curUser.uid]=firebase.firestore.FieldValue.delete();
    if(grp.status==='active'){
      patch['currentCycle.contributions.'+curUser.uid]=firebase.firestore.FieldValue.delete();
    }
    db.collection('chipereganyu_groups').doc(grp.id).update(patch).then(function(){
      setDot(''); chipActiveId=null; toast(isCW?'Mwatuluka mu gulu':'Left the group','i'); go('home');
    }).catch(function(e){ setDot('off'); toast((lang==='cw'?'Zalephera: ':'Failed: ')+(e&&e.code||'error'),'e'); });
  };
  if(alreadyReceived){
    // They've already taken a payout this lap but the lap isn't done, so
    // leaving now means the app has no further way to collect their share
    // toward everyone else's turn. Can't be prevented outright (no bank
    // integration to hold them to it), but this makes the tradeoff explicit
    // instead of a silent, clean-looking exit.
    appConfirm(isCW?'Mudalandira kale ndalama pa gawo lino ndipo simunamalize kulipira ena onse. Mukatuluka tsopano, app sidzathanso kutola ndalama zimenezo. Mutulukebe?':'You already received a payout this lap and haven\u2019t finished contributing to everyone else\u2019s turn yet. Leaving now means the app can\u2019t collect that from you going forward. Leave anyway?', doLeave, isCW?'Tulukani chonse':'Leave anyway', true);
  } else {
    appConfirm(isCW?'Mutuluka mu gululi?':'Leave this group?', doLeave, isCW?'Tulukani':'Leave', true);
  }
}

function chipRemoveMember(uid){
  const grp=activeChipGroup(); if(!grp||!curUser||grp.createdBy!==curUser.uid) return;
  const isCW=lang==='cw';
  if(grp.status==='active' && grp.currentCycle && uid===grp.currentCycle.recipientUid){
    toast(isCW?'Simungachotse amene akulandira gawo lino. Tsimikizani kutumiza kaye.':'Can\u2019t remove the person currently receiving this round. Confirm that payout first.','e'); return;
  }
  const nm=esc((grp.members[uid]||{}).name||'');
  const alreadyReceived = grp.status==='active' && (grp.history||[]).some(function(hh){ return hh.recipientUid===uid; });
  const doRemove=function(){
    setDot('spin');
    const patch={
      memberUids: firebase.firestore.FieldValue.arrayRemove(uid),
      rotationOrder: firebase.firestore.FieldValue.arrayRemove(uid)
    };
    patch['members.'+uid]=firebase.firestore.FieldValue.delete();
    if(grp.status==='active'){
      patch['currentCycle.contributions.'+uid]=firebase.firestore.FieldValue.delete();
    }
    db.collection('chipereganyu_groups').doc(grp.id).update(patch).then(function(){
      setDot(''); toast(isCW?'Wachotsedwa':'Removed','i');
    }).catch(function(e){ setDot('off'); toast((lang==='cw'?'Zalephera: ':'Failed: ')+(e&&e.code||'error'),'e'); });
  };
  if(alreadyReceived){
    appConfirm((isCW?nm+' walandira kale ndalama pa gawo lino ndipo sanamalize kulipira ena onse. Mukamuchotsa tsopano, app sidzathanso kutola ndalama zimenezo. Mumuchotsebe?':nm+' already received a payout this lap and hasn\u2019t finished contributing to everyone else\u2019s turn yet. Removing them now means the app can\u2019t collect that going forward. Remove anyway?'), doRemove, isCW?'Chotsani chonse':'Remove anyway', true);
  } else {
    appConfirm((isCW?'Chotsani ':'Remove ')+nm+(isCW?' mgululi?':' from the group?'), doRemove, isCW?'Chotsani':'Remove', true);
  }
}

function chipDeleteGroup(){
  const grp=activeChipGroup(); if(!grp||!curUser||grp.createdBy!==curUser.uid) return;
  const isCW=lang==='cw';
  if(grp.status!=='gathering'){ toast(isCW?'Simungathe kuchotsa gulu lomwe layamba kale':'Can\'t delete a group once it has started','e'); return; }
  appConfirm(isCW?'Chotsani gulu lonseli? Izi sizingasinthidwe.':'Delete this group entirely? This can\u2019t be undone.', function(){
    setDot('spin');
    db.collection('chipereganyu_groups').doc(grp.id).delete().then(function(){
      setDot(''); chipActiveId=null; toast(isCW?'Gulu lachotsedwa':'Group deleted','i'); go('home');
    }).catch(function(e){ setDot('off'); toast((lang==='cw'?'Zalephera: ':'Failed: ')+(e&&e.code||'error'),'e'); });
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
    }).catch(function(e){ setDot('off'); toast((lang==='cw'?'Zalephera: ':'Failed: ')+(e&&e.code||'error'),'e'); });
  }, isCW?'Sankhani':'Make admin', false);
}

// Bumps a not-yet-paid-out member one place earlier in the rotation, e.g.
// "Mary needs the money urgently" -> admin moves her ahead of whoever was
// next after her. Refuses to cross the current recipient or anyone the
// rule considers already paid, since that's the one thing that actually
// matters here (skipping someone who's already had their turn). This is
// a client-side guard only -- the Firestore rule (validChipReorder) can
// only confirm the result is a genuine permutation of the same members,
// not that frozen members kept their place, so this check is the real
// gate for that part. See the rule's comment for why.
// KNOWN LIMITATION: "already paid" is read from the flat `history` list,
// which doesn't separate laps -- once someone has ever received a payout,
// they're treated as frozen in this check even in a later lap where they
// should be eligible again. Same ambiguity already present in the
// Received/Upcoming labels this screen shows. Fine for a group's first
// lap through the rotation; worth revisiting before this sees a lot of
// multi-lap use.
function chipMoveUp(uid){
  const grp=activeChipGroup(); if(!grp||!grp.currentCycle) return;
  const isCW=lang==='cw';
  if(!curUser||grp.createdBy!==curUser.uid){ toast(isCW?'Ndi mtsogoleri yekha amene angasinthe dongosolo':'Only the admin can reorder the rotation','e'); return; }
  const cc=grp.currentCycle;
  const order=(grp.rotationOrder||[]).slice();
  const idx=order.indexOf(uid);
  if(idx<1) return; // not found, or already at the front -- nothing to move past
  const paidOutUids=(grp.history||[]).map(function(hh){return hh.recipientUid;});
  if(uid===cc.recipientUid || paidOutUids.indexOf(uid)>-1){
    toast(isCW?'Ameneyu walandira kale':'This member has already received their payout','e'); return;
  }
  const prevUid=order[idx-1];
  if(prevUid===cc.recipientUid || paidOutUids.indexOf(prevUid)>-1){
    toast(isCW?'Simungapitirire pa wolandira wapano':'Can\'t move ahead of the current recipient','e'); return;
  }
  order[idx-1]=uid; order[idx]=prevUid;
  setDot('spin');
  db.collection('chipereganyu_groups').doc(grp.id).update({rotationOrder:order}).then(function(){
    setDot(''); toast(isCW?'Dongosolo lasinthidwa':'Rotation order updated','i');
  }).catch(function(e){ setDot('off'); toast((lang==='cw'?'Zalephera: ':'Failed: ')+(e&&e.code||'error'),'e'); });
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

