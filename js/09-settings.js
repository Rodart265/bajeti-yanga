// ===============================================
// 14. SETTINGS
// ===============================================

function rStg(){
  _stgSection = null; // hub view — no drill-down active
  _stopJoinReqListener();
  const t=tx(), u=actU(), cu=curUser, isDark=document.body.classList.contains('dark');
  const displayName=cu?(cu.displayName||cu.email||u.name):u.name;
  const initials=displayName.split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,2)||u.name[0];
  const photo=cu&&cu.photoURL;
  let h='<div class="page">';

  // -- Profile Header (premium chip on the right) --
  const pStatus = getPremiumStatus();
  let premiumChip = '';
  if(pStatus.isExpired){
    premiumChip = '<button onclick="showPremiumPage()" style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;background:none;border:none;cursor:pointer;padding:0">'
      +'<span style="display:inline-flex;align-items:center;gap:4px;background:#FFEBEE;color:#B71C1C;font-size:.65rem;font-weight:800;padding:4px 10px;border-radius:var(--cr-md);white-space:nowrap"><i data-lucide="alert-triangle" style="width:11px;height:11px;color:#C62828"></i> '+(lang==='cw'?'Yathera':'Expired')+'</span>'
      +'<span style="font-size:.58rem;color:#C62828;font-weight:700;white-space:nowrap">'+(lang==='cw'?'Bwezani tsopano':'Tap to renew')+'</span>'
      +'</button>';
  } else if(pStatus.isPremium && !pStatus.isTrial){
    const expiry = lCfg.premiumExpiry || (lHHDoc && lHHDoc.premiumExpiry) || null;
    const expiryStr = expiry ? fmtDate(expiry.split('T')[0]) : '';
    const nearExpiry = pStatus.daysLeft !== null && pStatus.daysLeft <= 7;
    if(nearExpiry){
      premiumChip = '<button onclick="showPremiumPage()" style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;background:none;border:none;cursor:pointer;padding:0">'
        +'<span style="display:inline-flex;align-items:center;gap:4px;background:#FFF3E0;color:#E65100;font-size:.65rem;font-weight:800;padding:4px 10px;border-radius:var(--cr-md);white-space:nowrap"><i data-lucide="clock" style="width:11px;height:11px;color:#E65100"></i> '+pStatus.daysLeft+'d left</span>'
        +'<span style="font-size:.58rem;color:#E65100;white-space:nowrap">'+(lang==='cw'?'Bwezani tsopano':'Tap to renew')+'</span>'
        +'</button>';
    } else {
      premiumChip = '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0">'
        +'<span style="display:inline-flex;align-items:center;gap:4px;background:#E8F5E9;color:#1B5E20;font-size:.65rem;font-weight:800;padding:4px 10px;border-radius:var(--cr-md);white-space:nowrap"><i data-lucide="gem" style="width:11px;height:11px;color:#2E7D32"></i> Premium</span>'
        +(expiryStr?'<span style="font-size:.58rem;color:var(--mid);white-space:nowrap">Until '+expiryStr+'</span>':'')
        +'</div>';
    }
  } else if(pStatus.isPremium && pStatus.isTrial){
    premiumChip = '<button onclick="showPremiumPage()" style="display:inline-flex;align-items:center;gap:4px;background:#F3E5F5;color:var(--p1);font-size:.65rem;font-weight:800;padding:4px 10px;border-radius:var(--cr-md);border:none;cursor:pointer;font-family:Hanken Grotesk,sans-serif;flex-shrink:0;white-space:nowrap"><i data-lucide="gem" style="width:11px;height:11px"></i> Trial · '+pStatus.daysLeft+'d</button>';
  } else {
    premiumChip = '<button onclick="showPremiumPage()" style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg,var(--p1),var(--p2));color:#fff;font-size:.65rem;font-weight:800;padding:4px 10px;border-radius:var(--cr-md);border:none;cursor:pointer;font-family:Hanken Grotesk,sans-serif;flex-shrink:0;white-space:nowrap"><i data-lucide="gem" style="width:11px;height:11px"></i> Upgrade</button>';
  }
  h+='<div class="prof-hdr" style="align-items:center">';
  if(photo && /^https:\/\//i.test(photo)){h+='<div class="prof-av"><img src="'+esc(photo)+'" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:14px"></div>';}
  else{h+='<div class="prof-av" style="background:'+sC(u.color)+'">'+esc(initials)+'</div>';}
  h+='<div class="prof-info" style="flex:1;min-width:0">';
  h+='<div class="prof-name" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(displayName)+'</div>';
  if(cu&&cu.email)h+='<div class="prof-email" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(cu.email)+'</div>';
  else if(cu&&cu.phoneNumber)h+='<div class="prof-email">'+esc(cu.phoneNumber)+'</div>';
  h+='</div>';
  h+=premiumChip;
  h+='</div>';

  // -- General --
  h+='<span class="stg-sec-lbl">'+(lang==='cw'?'Zonse':'General')+'</span>';
  h+='<div class="stg-grp">';
  h+='<div class="stg-row" onclick="toggleLang()"><div class="stg-row-ico" style="background:var(--p1-bg)"><i data-lucide="globe" style="color:var(--p1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Chiyankhulo':'Language')+'</div></div><div class="stg-row-right"><span class="stg-row-val">'+(lang==='en'?'English':'Chichewa')+'</span><span class="stg-chev">›</span></div></div>';
  h+='<div class="stg-row no-tap"><div class="stg-row-ico" style="background:var(--ix1-bg)"><i data-lucide="'+(isDark?'sun':'moon')+'" style="width:16px;height:16px;color:var(--ix1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Mdima':'Dark Mode')+'</div></div><label class="toggle-sw" style="margin:0"><input type="checkbox" '+(isDark?'checked':'')+' onchange="tgDark(this.checked)"><div class="toggle-tr"></div></label></div>';
  h+='<div class="stg-row" onclick="openNotifs()"><div class="stg-row-ico" style="background:var(--o1-bg)"><i data-lucide="bell" style="color:var(--a1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Zidziwitso':'Notifications')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  h+='</div>';

  // -- Household --
  h+='<span class="stg-sec-lbl">'+(lang==='cw'?'Nyumba':'Household')+'</span>';
  h+='<div class="stg-grp">';
  // Members
  h+='<div class="stg-row" onclick="stgOpenSection(this.dataset.s)" data-s="members"><div class="stg-row-ico" style="background:var(--b1-bg)"><i data-lucide="users" style="color:var(--b1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Ma membala':'Members')+'</div><div class="stg-row-sub">'+lCfg.users.length+' '+(lang==='cw'?'Mamembala':'members')+'</div></div><div class="stg-row-right"><span id="pending-join-badge"></span><span class="stg-chev">›</span></div></div>';
  // Items & Budgets
  h+='<div class="stg-row" onclick="stgOpenSection(this.dataset.s)" data-s="items"><div class="stg-row-ico" style="background:var(--g1-bg)"><i data-lucide="list-checks" style="color:var(--g1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Zinthu ndi Bajeti':'Items & Budgets')+'</div><div class="stg-row-sub">'+lCfg.items.length+' '+(lang==='cw'?'zinthu':'items')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  // Goals
  h+='<div class="stg-row" onclick="stgOpenSection(this.dataset.s)" data-s="goals"><div class="stg-row-ico" style="background:var(--o1-bg)"><i data-lucide="target" style="color:var(--a1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Ndalama Zosungidwa':'Savings Goals')+'</div><div class="stg-row-sub">'+((lCfg.goals&&lCfg.goals.length)||0)+' '+(lang==='cw'?'zolinga':'goals')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  // Bill Tracker
  h+='<div class="stg-row" onclick="stgOpenSection(this.dataset.s)" data-s="bills"><div class="stg-row-ico" style="background:var(--o1-bg)"><i data-lucide="alarm-clock" style="color:var(--o1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+t.billTracker+(pStatus.isPremium?'':' <i data-lucide="gem" style="width:11px;height:11px;color:var(--p1)"></i>')+'</div><div class="stg-row-sub">'+((lCfg.bills&&lCfg.bills.length)||0)+' '+(lang==='cw'?'zolipira':'bills')+(pStatus.isPremium?'':' · Premium')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  // Overall budget
  h+='<div class="stg-row no-tap"><div class="stg-row-ico" style="background:var(--p1-bg)"><i data-lucide="wallet" style="color:var(--p1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Ndalama Yonse ya Mwezi':'Monthly Budget Cap')+'</div></div><div class="stg-row-right"><input type="number" style="width:90px;text-align:right;border:1.5px solid var(--border);border-radius:var(--cr-sm);padding:4px 7px;font-size:.78rem;background:var(--white);color:var(--ink);font-family:Hanken Grotesk,sans-serif;font-weight:700" value="'+lCfg.overallBudget+'" inputmode="numeric" onchange="updOB(this.value)"></div></div>';
  // Salary Day / Budget Period -- collapsed by default. Tapping the row reveals
  // both the active-period detail and the day input inside the same panel,
  // instead of having the input and detail always sitting in the settings list.
  const _sd=lCfg.salaryDay||'';
  const _periodActive=_sd>1;
  h+='<div class="stg-row" style="flex-direction:column;align-items:stretch;gap:0" onclick="toggleSalaryPanel()">'
    +'<div style="display:flex;align-items:center;gap:11px;padding:0">'
    +'<div class="stg-row-ico" style="background:var(--b1-bg);flex-shrink:0"><i data-lucide="calendar-check" style="color:var(--b1)"></i></div>'
    +'<div class="stg-row-body" style="flex:1">'
    +'<div class="stg-row-lbl">'+(lang==='cw'?'Tsiku la Malipiro (Salary Day)':'Salary Day')+'</div>'
    +'<div class="stg-row-sub" style="font-size:.68rem;color:'+(_periodActive?'var(--p1)':'var(--mid)')+'">'+(_periodActive?'Period: '+budgetPeriodLabel():(lang==='cw'?'Yosakhazikitsidwa, wogwiritsa ntchito mwezi wathunthu':'Not set. Using calendar month'))+'</div>'
    +'</div>'
    +'<span class="stg-chev" style="display:inline-block;transform:rotate('+(_sdPanelOpen?'90deg':'0deg')+');transition:transform .2s">›</span>'
    +'</div>'
    +(_sdPanelOpen?'<div style="margin:10px 0 4px 52px" onclick="event.stopPropagation()">'
    +'<label class="fl" style="display:block;font-size:.68rem;font-weight:700;color:var(--mid);margin-bottom:5px">'+(lang==='cw'?'Tsiku la Malipiro (1-28)':'Salary day (1-28)')+'</label>'
    +'<div style="display:flex;align-items:center;gap:8px">'
    +'<input type="number" min="1" max="28" id="stg-sd-inp" style="width:64px;text-align:center;border:1.5px solid '+ (_periodActive?'var(--p1)':'var(--border)')+';border-radius:var(--cr-sm);padding:7px 6px;font-size:.9rem;background:var(--white);color:var(--ink);font-family:Hanken Grotesk,sans-serif;font-weight:800" placeholder="e.g. 25" value="'+(_sd||'')+'" inputmode="numeric" onchange="updSalaryDay(this.value)">'
    +(_periodActive?'<button onclick="updSalaryDay(\'\')" style="background:none;border:1.5px solid var(--border);border-radius:var(--cr-sm);padding:6px 10px;font-size:.7rem;font-family:inherit;cursor:pointer;color:var(--mid);display:inline-flex;align-items:center;gap:4px"><i data-lucide="x" style="width:11px;height:11px"></i> '+(lang==='cw'?'Bwelera':'Reset')+'</button>':'')
    +'</div>'
    +(_periodActive?'<div style="margin-top:9px;font-size:.72rem;background:var(--mist);border-radius:var(--cr-sm);padding:7px 11px;color:var(--mid);line-height:1.6">'
    +'<span style="font-weight:700;color:var(--ink)">Active budget period:</span><br>'
    +'📅 <strong>'+budgetPeriodLabel()+'</strong><br>'
    +'All totals, budget caps, summary and insights track this window, not the calendar month.'
    +'</div>':'')
    +'</div>':'')
    +'</div>';
  // Household Code
  if(hhId)h+='<div class="stg-row" onclick="openQRCode()"><div class="stg-row-ico" style="background:var(--ix1-bg)"><i data-lucide="qr-code" style="color:var(--p1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Kodi ya Nyumba':'Household Code')+'</div><div class="stg-row-sub" style="font-family:monospace;letter-spacing:1px">'+hhId+'</div></div><div class="stg-row-right"><button class="bsm be" onclick="event.stopPropagation();cpCode()" style="padding:4px 9px;font-size:.65rem"><i data-lucide="copy" style="width:13px;height:13px;vertical-align:middle;color:var(--p1)"></i></button><button class="hc-btn hc-wa" onclick="event.stopPropagation();waCode()" style="font-size:.65rem;padding:5px 8px"><i data-lucide="send" style="width:13px;height:13px;vertical-align:middle"></i></button><span class="stg-chev">›</span></div></div>';
  h+='<div class="stg-row" onclick="switchHousehold()"><div class="stg-row-ico" style="background:var(--o1-bg)"><i data-lucide="arrow-left-right" style="color:var(--o1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl" style="color:#E65100">'+(lang==='cw'?'Siyani / Sintha Nyumba':'Switch / Leave Household')+'</div><div class="stg-row-sub">'+(lang==='cw'?'Lowani nyumba ina osaloka kwathunthu':'Join a different household without signing out')+'</div></div><div class="stg-row-right"><span class="stg-chev" style="color:#E65100">›</span></div></div>';
  h+='</div>';

  // -- Security --
  h+='<span class="stg-sec-lbl">'+(lang==='cw'?'Chitetezo':'Security')+'</span>';
  h+='<div class="stg-grp">';
  if(hasPIN()){
    h+='<div class="stg-row" onclick="openSetPIN()"><div class="stg-row-ico" style="background:var(--g1-bg)"><i data-lucide="lock" style="color:var(--g1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">PIN Lock</div><div class="stg-row-sub">'+(lang==='cw'?'Ikugwira ntchito -- dinani kuti musinthe':'Active -- tap to change')+'</div></div><div class="stg-row-right"><button class="bsm bd" onclick="event.stopPropagation();removePIN()" style="padding:4px 9px;font-size:.65rem">'+(lang==='cw'?'Chotsani':'Remove')+'</button><span class="stg-chev">›</span></div></div>';
  } else {
    h+='<div class="stg-row" onclick="openSetPIN()"><div class="stg-row-ico" style="background:var(--o1-bg)"><i data-lucide="unlock" style="color:var(--a1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Ikani PIN':'Set PIN Lock')+'</div><div class="stg-row-sub">'+(lang==='cw'?'Tetezani pulogalamuyi ndi PIN':'Protect app with a 4-digit PIN')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  }
  // Biometrics
  if(hasBio()){
    h+='<div class="stg-row" onclick="removeBio()"><div class="stg-row-ico" style="background:var(--g1-bg)"><i data-lucide="fingerprint" style="color:var(--g1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Biometrics':'Biometrics')+'</div><div class="stg-row-sub">'+(lang==='cw'?'Ikugwira ntchito':'Enabled -- tap to remove')+'</div></div><div class="stg-row-right"><span style="font-size:.7rem;color:#2E7D32;font-weight:700">ON</span><span class="stg-chev">›</span></div></div>';
  } else {
    h+='<div class="stg-row" onclick="registerBio()"><div class="stg-row-ico" style="background:var(--p1-bg)"><i data-lucide="fingerprint" style="color:var(--p1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Biometrics':'Biometrics')+'</div><div class="stg-row-sub">'+(lang==='cw'?'Gwiritsa ntchito chala kapena nkhope kuti mutsegule':'Use fingerprint or face to unlock')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  }
  if(cu&&cu.email)h+='<div class="stg-row" onclick="doPwReset()"><div class="stg-row-ico" style="background:var(--p1-bg)"><i data-lucide="key" style="color:var(--p1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Sinthani mawu a Chinsinsi':'Change Password')+'</div><div class="stg-row-sub">'+(lang==='cw'?'Tumizani link ku '+cu.email:'Send reset link to '+cu.email)+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  h+='</div>';

  // -- Data --
  h+='<span class="stg-sec-lbl">'+(lang==='cw'?'Deta':'Data')+'</span>';
  h+='<div class="stg-grp">';
  h+='<div class="stg-row" onclick="doExport()"><div class="stg-row-ico" style="background:var(--g1-bg)"><i data-lucide="table-2" style="color:var(--g1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+t.exportCSV+'</div><div class="stg-row-sub">'+(lang==='cw'?'Sankhani nthawi kenako tsitsani':'Choose a period, then download')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  h+='<div class="stg-row" onclick="doExportPDF()"><div class="stg-row-ico" style="background:var(--pk1-bg)"><i data-lucide="file-text" style="color:var(--pk1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">Export PDF'+(pStatus.isPremium?'':' <i data-lucide="gem" style="width:11px;height:11px;color:var(--p1)"></i>')+'</div><div class="stg-row-sub">'+(lang==='cw'?'Tulutsani Lipoti':(pStatus.isPremium?'Printable report':'Printable report -- Premium'))+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  h+='<div class="stg-row" onclick="openDeleteAccount()"><div class="stg-row-ico" style="background:var(--r1-bg)"><i data-lucide="trash-2" style="color:var(--r1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl" style="color:var(--r1)">'+(lang==='cw'?'Chotsani Akaunti':'Delete Account')+'</div><div class="stg-row-sub">'+(lang==='cw'?'Data isungidwa kwa masiku 30':'Data kept for 30 days -- restorable')+'</div></div><div class="stg-row-right"><span class="stg-chev" style="color:var(--r1)">›</span></div></div>';
  h+='</div>';

  // -- Help --
  h+='<span class="stg-sec-lbl">'+(lang==='cw'?'Thandizo':'Help & Support')+'</span>';
  h+='<div class="stg-grp">';
  h+='<div class="stg-row" onclick="openFAQ()"><div class="stg-row-ico" style="background:var(--p1-bg)"><i data-lucide="help-circle" style="color:var(--p1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">FAQ</div><div class="stg-row-sub">'+(lang==='cw'?'Mafunso ofunsidwa kawirikawiri':'Frequently asked questions')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  h+='<div class="stg-row"><a href="https://wa.me/265888029029" target="_blank" style="display:flex;align-items:center;gap:12px;flex:1;color:inherit;text-decoration:none"><div class="stg-row-ico" style="background:var(--g1-bg)"><i data-lucide="message-circle" style="color:#25D366"></i></div><div class="stg-row-body"><div class="stg-row-lbl">WhatsApp</div><div class="stg-row-sub">+265 888 029 029</div></div></a><span class="stg-chev" style="color:#25D366">›</span></div>';
  h+='<div class="stg-row"><a href="mailto:rodartcreatives@gmail.com" style="display:flex;align-items:center;gap:12px;flex:1;color:inherit;text-decoration:none"><div class="stg-row-ico" style="background:var(--p1-bg)"><i data-lucide="mail" style="color:var(--p1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">Email</div><div class="stg-row-sub">rodartcreatives@gmail.com</div></div></a><span class="stg-chev">›</span></div>';
  h+='<div class="stg-row" onclick="openPrivacySheet()"><div class="stg-row-ico" style="background:var(--p1-bg)"><i data-lucide="shield" style="color:var(--p1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Ndondomeko ya Chinsinsi':'Privacy Policy')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  h+='<div class="stg-row" onclick="openTerms()"><div class="stg-row-ico" style="background:var(--p1-bg)"><i data-lucide="file-text" style="color:var(--p1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(lang==='cw'?'Mgwirizano wa kagwiritsidwe ntchito':'Terms of Service')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></div>';
  h+='</div>';

  // -- About --
  h+='<span class="stg-sec-lbl">'+(lang==='cw'?'Za Pulogalamuyi':'About')+'</span>';
  h+='<div class="stg-grp">';
  h+='<div class="stg-row no-tap"><div class="stg-row-ico" style="background:var(--p1-bg)"><i data-lucide="home" style="color:var(--p1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">Bajeti Yanga</div><div class="stg-row-sub">Version '+APP_VERSION+' · © Rodart Creatives</div></div><div class="stg-row-right"><button onclick="showWhatsNew()" style="background:linear-gradient(135deg,var(--p1),var(--p2));color:#fff;border:none;border-radius:var(--cr-sm);padding:4px 9px;font-size:.63rem;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif">What\'s New</button></div></div>';
  h+='</div>';

  h+='<button class="stg-logout" onclick="logout()"><i data-lucide="log-out" style="width:15px;height:15px;margin-right:6px;vertical-align:middle"></i> '+t.logout+'</button>';
  h+='</div>';
  g('view').innerHTML=h;
  if(window.lucide) lucide.createIcons({nodes:[g('view')]});
}

function showWhatsNew(){
  const isCW=lang==='cw';
  const changes=[
    {icon:'refresh-cw',    color:'#1565C0', title:'Safer Shared Editing',      desc:'Budget items, bills and savings goals are now tracked by ID, so two people editing the same household can no longer change the wrong one by mistake.'},
    {icon:'users',         color:'#2E7D32', title:'Chipereganyu',              desc:'Run a rotating savings circle with people across households. Create or join with a code, track contributions, and payouts log straight to your budget.'},
    {icon:'user-x',        color:'#C62828', title:'Household Join Fixes',      desc:'Cancelling a join request and detecting a declined one now actually work. Removed members can no longer slip back in without a new approval.'},
    {icon:'alarm-clock',   color:'#2E7D32', title:'Bill Tracker: Mark as Paid', desc:'Tap the new checkmark on a bill to log the payment as an expense and roll the due date forward a month.'},
    {icon:'zap',           color:'#7B1FA2', title:'Faster, Focused Quick Pick', desc:'Trimmed down to your most-used staples so logging an entry is quicker.'},
    {icon:'shield-check',  color:'#1565C0', title:'Safer Member Removal',       desc:'Removing a household member now also revokes their access, not just their name from the list.'},
    {icon:'save',          color:'#1565C0', title:'Sticky Save Button',        desc:'The Save button on the Log screen now stays visible while you scroll.'},
    {icon:'bell',          color:'#7B1FA2', title:'Bills Due Soon on Home',    desc:'Upcoming bills now surface on the Home screen when they are due.'},
    {icon:'zap',           color:'#F57F17', title:'Faster Boot Splash',        desc:'The app icon now appears reliably every time you open the app.'},
    {icon:'languages',     color:'#607D8B', title:'Chichewa Paused',           desc:'Temporarily turned off while we improve translation quality. English works as normal.'},
  ];
  let h='<div class="dh"></div>';
  h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">';
  h+='<div style="width:44px;height:44px;background:linear-gradient(135deg,var(--p1),var(--p2));border-radius:var(--cr-md);display:flex;align-items:center;justify-content:center;flex-shrink:0">';
  h+='<i data-lucide="sparkles" style="width:22px;height:22px;color:#fff"></i></div>';
  h+='<div><div style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1rem">What\'s New in v'+APP_VERSION+'</div>';
  h+='<div style="font-size:.7rem;color:var(--mid)">Release notes</div></div></div>';
  changes.forEach(function(c){
    h+='<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)">';
    h+='<div style="width:36px;height:36px;border-radius:var(--cr-md);background:'+c.color+'18;display:flex;align-items:center;justify-content:center;flex-shrink:0">';
    h+='<i data-lucide="'+c.icon+'" style="width:18px;height:18px;color:'+c.color+'"></i></div>';
    h+='<div style="flex:1"><div style="font-weight:700;font-size:.82rem;color:var(--ink)">'+c.title+'</div>';
    h+='<div style="font-size:.72rem;color:var(--mid);margin-top:1px;line-height:1.45">'+c.desc+'</div></div></div>';
  });
  h+='<button class="btnG" style="width:100%;margin-top:14px" onclick="closeM(&quot;mv-u&quot;)">Close</button>';
  g('mb-u').innerHTML=h;
  if(window.lucide) lucide.createIcons({nodes:[g('mb-u')]});
  openM('mv-u');
}


function buildStgSortBar(t){
  const ic=function(name){return '<i data-lucide="'+name+'" style="width:12px;height:12px;vertical-align:-2px;margin-right:3px;color:currentColor"></i>';};
  const modes=[['cat',ic('layout-grid')+t.sortCat],['az',t.sortAZ],['over',ic('alert-circle')+t.sortOver],['spend',ic('flame')+t.sortSpend]];
  return '<div class="sort-bar">'+modes.map(function(m){return '<div class="sb'+(sortMode===m[0]?' on':'')+'" onclick="sortAndStg(\''+m[0]+'\')" >'+m[1]+'</div>';}).join('')+'</div>';
}
function stgOpenSection(sec){
  if(sec==='bills' && !getPremiumStatus().isPremium){
    premiumGate('bill_tracker', function(){ stgOpenSection('bills'); });
    return;
  }
  _stopJoinReqListener(); // torn down here; re-attached below only if we land back on members
  if(sec==='members'||sec==='items'||sec==='goals'||sec==='bills'){
    // Render manage but scroll to section
    tab='stg'; // stay in profile tab highlight
    _stgSection = sec;
    // Give this drill-down its own history entry so device back returns to the
    // main Settings list (the entry pushed when the Settings tab was opened)
    // instead of falling out of the app entirely.
    try{ history.pushState({tab:'stg',section:sec},'',(location.pathname||'/')); }catch(e){}
    const t=tx();
    let h='<div class="page">';
    h+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px"><button onclick="history.back()" style="background:var(--mist);border:1.5px solid var(--border);border-radius:var(--cr);padding:7px 14px;font-size:.78rem;font-weight:700;cursor:pointer;color:var(--ink);display:inline-flex;align-items:center;gap:5px;font-family:Hanken Grotesk,sans-serif"><i data-lucide="chevron-left" style="width:14px;height:14px"></i>'+(lang==='cw'?'Kubwerera':'Back')+'</button><h2 style="font-family:Hanken Grotesk,sans-serif;font-weight:800;font-size:1rem">'+(sec==='members'?(lang==='cw'?'Mamembala':'Members'):sec==='items'?(lang==='cw'?'Zinthu ndi Bajeti':'Items & Budgets'):sec==='goals'?(lang==='cw'?'Zolinga zosungira':'Savings Goals'):(lang==='cw'?'Zolipira':'Bill Tracker'))+'</h2></div>';
    if(sec==='members'){
      h+='<div class="card"><div class="ch"><h2><i data-lucide="users" style="margin-right:5px;vertical-align:middle;color:#1565C0"></i> '+t.members+'</h2><button class="bsm be" onclick="openAddM()"><i data-lucide="plus" style="width:12px;height:12px;vertical-align:-2px;margin-right:2px"></i> '+t.addMember+'</button></div><div class="cb"><div class="umg">'+lCfg.users.map((u,i)=>'<div class="umc" style="background:'+sC(u.color)+'18">'+(lCfg.users.length>1&&curUser&&lHHDoc&&curUser.uid===lHHDoc.owner?'<button class="umdel" onclick="delMember('+i+')"><i data-lucide="x" style="width:12px;height:12px"></i></button>':'')+'<button class="umed" onclick="openEU('+i+')"><i data-lucide="pencil" style="width:12px;height:12px"></i></button><div class="umav" style="background:'+sC(u.color)+'">'+esc(u.name[0])+'</div><div class="umnm">'+esc(u.name)+'</div><div class="umct">'+lPx.filter(p=>p.userId===u.id&&isTM(p.date)).length+' this month</div></div>').join('')+'</div></div></div>';
      // Pending join requests — visible to owner
      // Check lHHDoc.owner first, fall back to ownedHouseholds on user doc for old households
      const isOwner = curUser && (
        (lHHDoc && lHHDoc.owner === curUser.uid) ||
        (lCfg && lCfg.users && lCfg.users.length === 1 && lCfg.users[0].id === 'u1' && localStorage.getItem('nb_uid') === 'u1') ||
        (curUser && window._userOwnedHouseholds && window._userOwnedHouseholds.includes(hhId))
      );
      if(isOwner){
        h += '<div class="card" id="join-requests-card">';
        h += '<div class="ch"><h2><i data-lucide="user-plus" style="margin-right:5px;vertical-align:middle;color:#E65100"></i> '+(lang==='cw'?'Zipemho za Kulowa':'Pending Join Requests')+'</h2></div>';
        h += '<div class="cb" id="join-requests-body"><div style="text-align:center;padding:12px;color:var(--mid);font-size:.78rem"><i data-lucide="loader" style="width:16px;height:16px;animation:spin 1s linear infinite;display:block;margin:0 auto 6px"></i>'+(lang==='cw'?'Kuyang\'ana...':'Loading...')+'</div></div>';
        h += '</div>';
        setTimeout(function(){
          if(!hhId) return;
          _stopJoinReqListener(); // clear any listener from a previous visit before attaching a new one
          _joinReqUnsub = db.collection('households').doc(hhId).collection('joinRequests').onSnapshot(function(snap){
              const body = g('join-requests-body');
              if(!body) return; // screen has moved on — listener will be torn down on next navigation
              if(snap.empty){
                body.innerHTML = '<div style="text-align:center;padding:12px;color:var(--mid);font-size:.78rem">'+(lang==='cw'?'Palibe zipemho':'No pending requests')+'</div>';
                return;
              }
              let rh = '';
              snap.docs.forEach(function(jd){
                const jData = jd.data();
                const name = esc(jData.displayName || jData.uid);
                const email = jData.email ? '<div style="font-size:.63rem;color:var(--mid)">'+esc(jData.email)+'</div>' : '';
                rh += '<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">';
                rh += '<div style="width:36px;height:36px;border-radius:var(--cr-md);background:#E65100;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:.9rem;flex-shrink:0">'+esc((jData.displayName||'?')[0].toUpperCase())+'</div>';
                rh += '<div style="flex:1"><div style="font-weight:700;font-size:.82rem">'+name+'</div>'+email+'</div>';
                rh += '<div style="display:flex;gap:6px">';
                rh += '<button data-uid="'+esc(jd.id)+'" onclick="approveJoin(this.dataset.uid)" style="background:#2E7D32;color:#fff;border:none;border-radius:var(--cr-sm);padding:6px 10px;font-size:.7rem;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;display:flex;align-items:center;gap:3px"><i data-lucide="check" style="width:12px;height:12px"></i> '+(lang==='cw'?'Vomeleza':'Approve')+'</button>';
                rh += '<button data-uid="'+esc(jd.id)+'" onclick="declineJoin(this.dataset.uid)" style="background:#FFEBEE;color:#C62828;border:none;border-radius:var(--cr-sm);padding:6px 10px;font-size:.7rem;font-weight:700;cursor:pointer;font-family:Hanken Grotesk,sans-serif;display:flex;align-items:center;gap:3px"><i data-lucide="x" style="width:12px;height:12px"></i> '+(lang==='cw'?'Kanani':'Decline')+'</button>';
                rh += '</div></div>';
              });
              body.innerHTML = rh;
              if(window.lucide) lucide.createIcons({nodes:[body]});
            }, function(){ const b=g('join-requests-body'); if(b) b.innerHTML='<div style="padding:10px;font-size:.75rem;color:var(--mid)">Could not load requests.</div>'; });
        }, 300);
      }
    } else if(sec==='items'){
      h+='<div class="obra"><label class="oblbl"><i data-lucide="home" style="color:var(--p1)"></i> '+t.overallCap+'</label><input type="number" class="obinp" id="ob-v" value="'+esc(lCfg.overallBudget)+'" inputmode="numeric" onchange="updOB(this.value)"></div>';
      h+='<div class="card" style="overflow:hidden"><div class="ch"><h2><i data-lucide="shopping-cart" style="margin-right:5px;vertical-align:middle;color:var(--p1)"></i> '+t.itemsLbl+'</h2></div>';
      h+=buildStgSortBar(t);
      const items=lCfg.items;
      if(sortMode==='cat'){['Food','Household','Personal','Transport','Other'].forEach(cat=>{const ci=items.map((it,i)=>({...it,i})).filter(it=>catOf(it.name)===cat);if(!ci.length)return;const _ci=CAT_OPTS.find(c=>c.key===cat);h+='<div class="cat-hdr"><i data-lucide="'+(_ci?_ci.icon:'tag')+'" style="width:13px;height:13px;vertical-align:middle;margin-right:5px;color:'+CAT_COLORS[cat]+'"></i><span style="color:'+CAT_COLORS[cat]+'">'+(t.cats[cat]||cat)+'</span></div>';ci.forEach(it=>h+=rMGI(it,it.i));});}
      else{let sorted=items.map((it,i)=>({...it,i,sp:iSpent(it.name)}));if(sortMode==='az')sorted.sort((a,b)=>a.name.localeCompare(b.name));else if(sortMode==='over')sorted.sort((a,b)=>(b.sp/b.budget)-(a.sp/a.budget));else if(sortMode==='spend')sorted.sort((a,b)=>b.sp-a.sp);sorted.forEach(it=>h+=rMGI(it,it.i));}
      h+='<div class="addform"><h3><i data-lucide="plus" style="width:14px;height:14px;vertical-align:-2px;margin-right:2px"></i> '+t.addItem+'</h3><input type="text" class="fi" id="ni-n" placeholder="'+t.iname+'" style="margin-bottom:9px"><div style="display:flex;gap:7px"><input type="number" class="fi" id="ni-b" placeholder="'+t.ibudget+'" inputmode="numeric" style="flex:1"><button class="btnM" onclick="addItAndStay()" style="width:auto;padding:9px 18px;font-size:.82rem">'+t.add+'</button></div></div></div>';
    } else if(sec==='goals'){
      h+='<div class="card"><div class="ch"><h2><i data-lucide="target" style="margin-right:5px;vertical-align:middle;color:var(--a1)"></i> '+t.goals+'</h2><button class="bsm be" onclick="openAddGoal()"><i data-lucide="plus" style="width:12px;height:12px;vertical-align:-2px;margin-right:2px"></i> '+t.addGoal+'</button></div><div class="cb">';
      if(lCfg.goals&&lCfg.goals.length){lCfg.goals.forEach((gl,i)=>{
        const pct=Math.min(gl.saved/gl.target,1),done=gl.saved>=gl.target;
        const ml=goalMonthsLeft(gl.deadline),mn=goalMonthlyNeed(gl);
        h+='<div class="goal-card" style="margin-bottom:9px'+(done?';background:linear-gradient(135deg,#E8F5E9,#C8E6C9)':'')+'">';
        h+='<div class="goal-top"><div class="goal-name"'+(done?' style="color:#1B5E20"':'')+'>'+( done?'&#127881; ':'')+esc(gl.name)+'</div>';
        h+='<div style="display:flex;gap:5px;align-items:center"><div class="goal-pct"'+(done?' style="color:#1B5E20"':'')+'>'+Math.round(pct*100)+'%</div>';
        if(!done)h+='<button class="bsm be" style="padding:3px 8px;font-size:.63rem" onclick="openTopUp(\''+recKey(gl,i)+'\')"><i data-lucide="arrow-up" style="width:11px;height:11px;vertical-align:-1px"></i> '+t.topup+'</button>';
        h+='<button class="bsm bd" style="padding:3px 7px;font-size:.63rem" onclick="delGoal(\''+recKey(gl,i)+'\')"><i data-lucide="trash-2" style="width:12px;height:12px"></i></button></div></div>';
        h+='<div class="goal-bar"><div class="goal-fill" style="width:'+Math.round(pct*100)+'%'+(done?';background:linear-gradient(90deg,#2E7D32,#43A047)':'')+'"></div></div>';
        h+='<div class="goal-meta"><span>'+MK(gl.saved)+' '+(lang==='cw'?'yosungidwa':'saved')+'</span><span>'+(lang==='cw'?'Cholinga':'Target')+': '+MK(gl.target)+'</span></div>';
        if(!done&&mn!==null)h+='<div style="margin-top:6px;font-size:.65rem;color:#E65100;font-weight:700;background:#FFF3E0;border-radius:var(--cr-sm);padding:5px 8px"><i data-lucide="calendar" style="margin-right:3px;vertical-align:middle;color:var(--a1)"></i> '+MK(mn)+'/'+(lang==='cw'?'mwezi':'month')+' needed'+(ml!==null?' · '+ml+(lang==='cw'?' miyezi':'mths left'):'')+'</div>';
        h+='</div>';
      });}
      else{h+='<div class="empty" style="padding:10px 0"><p>'+t.noGoals+'</p></div>';}
      h+='</div></div>';
    } else if(sec==='bills'){
      h+='<div class="card"><div class="ch"><h2><i data-lucide="alarm-clock" style="margin-right:6px;vertical-align:middle"></i>'+t.billTracker+'</h2><button class="bsm be" onclick="openAddBill()">+ '+t.add+'</button></div><div class="cb" id="bill-list-wrap">';
      const bills = lCfg.bills || [];
      if(bills.length){
        const today2 = new Date(); today2.setHours(0,0,0,0);
        bills.forEach(function(b,i){
          const due = new Date(b.dueDate); due.setHours(0,0,0,0);
          const diff = Math.round((due - today2)/86400000);
          const urgent = diff<=3;
          h+='<div class="bill-item">';
          h+='<div class="bill-ico"><i data-lucide="'+esc(b.icon||'receipt')+'" style="width:17px;height:17px;color:var(--p1)"></i></div>';
          h+='<div class="bill-info"><div class="bill-name">'+esc(b.name)+'</div>';
          h+='<div class="bill-due'+(urgent?' urgent':'')+'">'+t.dueLbl+': '+fmtDate(b.dueDate)+(diff===0?' -- '+t.todayLbl:(diff<0?' -- '+t.overdueLbl:(diff<=3?' -- '+diff+' '+t.daysLeftLbl:'')))+'</div></div>';
          h+='<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">';
          h+='<div class="bill-amt">'+MK(b.amount)+'</div>';
          h+='<div style="display:flex;gap:8px">';
          h+='<button class="bsm" onclick="markBillPaid(\''+recKey(b,i)+'\')" style="font-size:.68rem;padding:6px 9px;background:#2E7D32;color:#fff;border:none" aria-label="'+t.markPaid+'"><i data-lucide="check" style="width:13px;height:13px"></i></button>';
          h+='<button class="bsm be" onclick="editBill(\''+recKey(b,i)+'\')" style="font-size:.68rem;padding:6px 9px" aria-label="'+t.editP+'"><i data-lucide="pencil" style="width:13px;height:13px"></i></button>';
          h+='<button class="bsm bd" onclick="delBill(\''+recKey(b,i)+'\')" style="font-size:.68rem;padding:6px 9px" aria-label="'+t.del+'"><i data-lucide="trash-2" style="width:13px;height:13px"></i></button>';
          h+='</div></div></div>';
        });
      } else {
        h+='<div class="empty" style="padding:10px 0"><div class="ei"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><p><strong>'+t.noBillsYet+'</strong><br><span style="font-size:.75rem;color:var(--mid)">'+t.noBillsSub+'</span></p></div>';
      }
      h+='</div></div>';
    }
    h+='</div>';
    g('view').innerHTML=h;
    if(window.lucide) lucide.createIcons({nodes:[g('view')]});
  }
}
function sortAndStg(s){sortMode=s;stgOpenSection('items');}
function addItAndStay(){
  const t=tx(),n=val('ni-n').trim(),b=parseFloat(val('ni-b'));
  if(!n){toast(lang==='cw'?'Lowetsani dzina':'Enter a name','e');return;}
  if(!b||isNaN(b)||b<=0||b>99999999){toast(lang==='cw'?'Lowetsani bajeti yabwino':'Enter a valid budget','e');return;}
  if(lCfg.items.find(it=>it.name.toLowerCase()===n.toLowerCase())){toast(lang==='cw'?'Chinthu chimenechi chilipo kale':'Item already exists','e');return;}
  const cfg=JSON.parse(JSON.stringify(lCfg));cfg.items.push({name:n,budget:b});saveCfg(cfg);toast(t.itemAdded);stgOpenSection('items');
}
function tgDark(on){ document.body.classList.toggle('dark',on); localStorage.setItem('nb_dark',on?'1':'0'); toast(on?'Dark mode on':'Dark mode off','i'); }
function doPwReset(){ if(!curUser||!curUser.email){toast('No email on account.','e');return;} auth.sendPasswordResetEmail(curUser.email).then(()=>toast('Reset link sent to '+curUser.email,'s')).catch(e=>toast(e.message,'e')); }
function buildAndDownloadCSV(fromD, toD, periodLabel){
  const t=tx();
  const now=new Date();
  const dateStr=now.toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'});
  const hhName=lCfg.users.map(u=>u.name).join(' & ');

  // Normalize to start/end of day for inclusive comparison, matching the PDF export logic
  const fromTime = new Date(fromD.getFullYear(), fromD.getMonth(), fromD.getDate()).getTime();
  const toTime   = new Date(toD.getFullYear(), toD.getMonth(), toD.getDate(), 23, 59, 59).getTime();
  const inRange = p => {
    if(!p.date || p.deleted) return false;
    const parts = String(p.date).split('-');
    if(parts.length !== 3) return false;
    const pd = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10)).getTime();
    return pd >= fromTime && pd <= toTime;
  };

  const income=lPx.filter(p=>p.type==='income'&&inRange(p));
  const expenses=lPx.filter(p=>p.type!=='income'&&inRange(p));

  if(!income.length && !expenses.length){
    toast(lang==='cw'?'Palibe zolemba mu nthawi imeneyi.':'No transactions found in that period.','e');
    return;
  }

  const totalInc=income.reduce((s,p)=>s+Number(p.amount||0),0);
  const totalExp=expenses.reduce((s,p)=>s+Number(p.amount||0),0);
  const net=totalInc-totalExp;

  // Neutralise spreadsheet formula injection: text cells beginning with = + - @ (or tab/CR) are prefixed with an apostrophe.
  // Plain numbers like "-5,000" are left alone.
  const q=v=>{
    let t=String(v===undefined||v===null?'':v);
    if(/^[=+\-@\t\r]/.test(t) && !/^-?[\d,.]+$/.test(t)) t="'"+t;
    return '"'+t.replace(/"/g,'""')+'"';
  };
  const row=(...cells)=>cells.map(q).join(',')+String.fromCharCode(13,10);
  const blank=()=>String.fromCharCode(13,10);

  let csv='';
  // Header block
  csv+=row('BAJETI YANGA: HOUSEHOLD BUDGET EXPORT','','','','','','','');
  csv+=row('Household:',hhName,'','','','','','');
  csv+=row('Period:',periodLabel,'','','','','','');
  csv+=row('Exported:',dateStr,'','','','','','');
  csv+=row('Household Code:',hhId||'N/A','','','','','','');
  csv+=blank();

  // Summary block
  csv+=row('SUMMARY','','','','','','','');
  csv+=row('Total Income','MK '+Number(totalInc).toLocaleString(),'','','','','','');
  csv+=row('Total Expenses','MK '+Number(totalExp).toLocaleString(),'','','','','','');
  csv+=row('Net Balance','MK '+Number(net).toLocaleString(),'','','','','','');
  csv+=row('Budget (Monthly)','MK '+Number(lCfg.overallBudget).toLocaleString(),'','','','','','');
  csv+=blank();

  // Income section
  if(income.length){
    csv+=row('INCOME','Date','Source','Amount (MK)','Member','Notes','','');
    income.sort((a,b)=>a.date<b.date?1:-1).forEach((p,i)=>{
      const u=uById(p.userId);
      csv+=row(i+1,p.date,p.item,Number(p.amount).toLocaleString(),u.name,p.notes||'','','');
    });
    csv+=row('','','TOTAL',Number(totalInc).toLocaleString(),'','','','');
    csv+=blank();
  }

  // Expenses section
  if(expenses.length){
    csv+=row('EXPENSES','Date','Item','Amount (MK)','Member','Qty','Unit','Notes');
    expenses.sort((a,b)=>a.date<b.date?1:-1).forEach((p,i)=>{
      const u=uById(p.userId);
      csv+=row(i+1,p.date,p.item,Number(p.amount).toLocaleString(),u.name,p.qty||'',p.unit||'',p.notes||'');
    });
    csv+=row('','','TOTAL',Number(totalExp).toLocaleString(),'','','','');
    csv+=blank();
  }

  // Budget performance section (reflects current configured budgets, not the export range)
  csv+=row('BUDGET PERFORMANCE (current)','Item','Budget (MK)','Spent (MK)','Remaining (MK)','Status','','');
  lCfg.items.forEach(it=>{
    const sp=iSpent(it.name);
    const rem=it.budget-sp;
    const pct=it.budget>0?Math.round(sp/it.budget*100):0;
    const status=sp>it.budget?'OVER BUDGET':pct>=80?'Near Limit':'On Track';
    csv+=row('',it.name,Number(it.budget).toLocaleString(),Number(sp).toLocaleString(),Number(rem).toLocaleString(),status,'','');
  });
  csv+=blank();
  csv+=row('Generated by Bajeti Yanga v'+APP_VERSION+', Rodart Creatives','','','','','','','');

  const BOM='﻿'; // UTF-8 BOM for Excel compatibility
  const blob=new Blob([BOM+csv],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  const filename='BajetiYanga_'+hhName.replace(/[^a-zA-Z0-9]/g,'_')+'_'+now.getFullYear()+String(now.getMonth()+1).padStart(2,'0')+'.csv';
  a.href=url; a.download=filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  toast('CSV downloaded: '+(income.length+expenses.length)+' entries.','s');
}

function doExportPDF(){
  premiumGate('export_pdf', function(){
    openExportRangePicker('pdf');
  });
}
function doExport(){
  openExportRangePicker('csv');
}

// Opens a modal asking the user which period to export, for either CSV or PDF.
// "Pick a Past Month" is capped to the last 12 calendar months.
function openExportRangePicker(format){
  const isCW = lang === 'cw';
  const isPdf = format === 'pdf';
  const now = new Date();
  let monthOptions = '';
  for(let i=0;i<12;i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const val = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
    const lbl = tx().months[d.getMonth()]+' '+d.getFullYear();
    monthOptions += '<option value="'+val+'">'+lbl+'</option>';
  }
  const todayStr = today();
  const monthAgoStr = localISO(new Date(now.getFullYear(), now.getMonth(), now.getDate()-30));

  let h = '<div class="dh"></div><h3 style="font-family:Hanken Grotesk,sans-serif;margin-bottom:14px">'+(isCW?'Sankhani Nthawi':'Choose Report Period')+'</h3>';

  h += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">';
  h += '<button class="stg-row" style="border:1.5px solid var(--border);border-radius:var(--cr-md);background:var(--white)" onclick="genExportForRange(\'all\',\''+format+'\')"><div class="stg-row-ico" style="background:var(--mist)"><i data-lucide="infinity" style="color:var(--p1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(isCW?'Nthawi Zonse':'All Time')+'</div><div class="stg-row-sub">'+(isCW?'Zolemba zonse':'Everything on record')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></button>';
  h += '<button class="stg-row" style="border:1.5px solid var(--border);border-radius:var(--cr-md);background:var(--white)" onclick="genExportForRange(\'week\',\''+format+'\')"><div class="stg-row-ico" style="background:var(--b1-bg)"><i data-lucide="calendar-days" style="color:var(--b1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(isCW?'Sabata Lino':'This Week')+'</div><div class="stg-row-sub">'+(isCW?'Masiku 7 apitawa':'Last 7 days')+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></button>';
  h += '<button class="stg-row" style="border:1.5px solid var(--border);border-radius:var(--cr-md);background:var(--white)" onclick="genExportForRange(\'month\',\''+format+'\')"><div class="stg-row-ico" style="background:var(--g1-bg)"><i data-lucide="calendar-check" style="color:var(--g1)"></i></div><div class="stg-row-body"><div class="stg-row-lbl">'+(isCW?'Mwezi Uno':'This Month')+'</div><div class="stg-row-sub">'+budgetPeriodLabel()+'</div></div><div class="stg-row-right"><span class="stg-chev">›</span></div></button>';
  h += '</div>';

  h += '<div style="border-top:1.5px solid var(--border);padding-top:12px;margin-bottom:12px">';
  h += '<label style="font-size:.72rem;font-weight:700;color:var(--mid);display:block;margin-bottom:6px">'+(isCW?'Mwezi wapita (miyezi 12)':'Pick a Past Month (last 12 months)')+'</label>';
  h += '<div style="display:flex;gap:8px"><select id="exp-month-sel" style="flex:1;border:1.5px solid var(--border);border-radius:var(--cr-md);padding:9px;font-size:.8rem;background:var(--white);color:var(--ink);font-family:Hanken Grotesk,sans-serif">'+monthOptions+'</select>';
  h += '<button class="btnM" style="width:auto;padding:9px 16px;font-size:.78rem" onclick="genExportForMonth(g(\'exp-month-sel\').value,\''+format+'\')">'+(isCW?'Tulutsani':'Export')+'</button></div>';
  h += '</div>';

  h += '<div style="border-top:1.5px solid var(--border);padding-top:12px">';
  h += '<label style="font-size:.72rem;font-weight:700;color:var(--mid);display:block;margin-bottom:6px">'+(isCW?'Nthawi Yanu':'Custom Range')+'</label>';
  h += '<div style="display:flex;gap:8px;margin-bottom:8px">';
  h += '<input type="date" id="exp-from" value="'+monthAgoStr+'" max="'+todayStr+'" style="flex:1;border:1.5px solid var(--border);border-radius:var(--cr-md);padding:8px;font-size:.76rem;background:var(--white);color:var(--ink);font-family:Hanken Grotesk,sans-serif">';
  h += '<input type="date" id="exp-to" value="'+todayStr+'" max="'+todayStr+'" style="flex:1;border:1.5px solid var(--border);border-radius:var(--cr-md);padding:8px;font-size:.76rem;background:var(--white);color:var(--ink);font-family:Hanken Grotesk,sans-serif">';
  h += '</div>';
  h += '<button class="btnM" style="width:100%" onclick="genExportCustomRange(\''+format+'\')">'+(isCW?(isPdf?'Tulutsani Lipoti':'Tulutsani'):(isPdf?'Generate Report':'Generate CSV'))+'</button>';
  h += '</div>';

  g('mb-u').innerHTML = h;
  if(window.lucide) lucide.createIcons({nodes:[g('mb-u')]});
  openM('mv-u');
}

function genExportForRange(kind, format){
  const now = new Date();
  let fromD, toD, label;
  if(kind === 'all'){
    fromD = new Date(2000,0,1);
    toD = now;
    label = (lang==='cw'?'Nthawi Zonse':'All Time');
  } else if(kind === 'week'){
    fromD = new Date(now.getFullYear(), now.getMonth(), now.getDate()-6);
    toD = now;
    label = (lang==='cw'?'Sabata Lino':'This Week');
  } else {
    const p = getBudgetPeriod();
    fromD = new Date(p.startY, p.startM, p.startD);
    toD = new Date(p.endY, p.endM, p.endD);
    label = budgetPeriodLabel();
  }
  closeM('mv-u');
  if(format==='csv') buildAndDownloadCSV(fromD, toD, label);
  else buildAndDownloadPdf(fromD, toD, label);
}

function genExportForMonth(monthVal, format){
  if(!monthVal) return;
  const parts = monthVal.split('-');
  const y = parseInt(parts[0],10), m = parseInt(parts[1],10)-1;
  const fromD = new Date(y, m, 1);
  const toD = new Date(y, m+1, 0);
  const label = tx().months[m]+' '+y;
  closeM('mv-u');
  if(format==='csv') buildAndDownloadCSV(fromD, toD, label);
  else buildAndDownloadPdf(fromD, toD, label);
}

function genExportCustomRange(format){
  const fromVal = g('exp-from').value, toVal = g('exp-to').value;
  if(!fromVal || !toVal){ toast(lang==='cw'?'Sankhani masiku onse awiri.':'Please pick both dates.','e'); return; }
  const fromD = new Date(fromVal+'T00:00:00');
  const toD = new Date(toVal+'T00:00:00');
  if(fromD > toD){ toast(lang==='cw'?'Tsiku loyamba liyenera kukhala lisanafike lomaliza.':'Start date must be before end date.','e'); return; }
  const label = fmtDate(fromVal)+' – '+fmtDate(toVal);
  closeM('mv-u');
  if(format==='csv') buildAndDownloadCSV(fromD, toD, label);
  else buildAndDownloadPdf(fromD, toD, label);
}

function buildAndDownloadPdf(fromD, toD, periodLabel){
  // Normalize to start/end of day for inclusive comparison
  const fromTime = new Date(fromD.getFullYear(), fromD.getMonth(), fromD.getDate()).getTime();
  const toTime   = new Date(toD.getFullYear(), toD.getMonth(), toD.getDate(), 23, 59, 59).getTime();

  const rangePx = lPx.filter(function(p){
    if(!p.date || p.deleted) return false;
    const parts = String(p.date).split('-');
    if(parts.length !== 3) return false;
    const pd = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10)).getTime();
    return pd >= fromTime && pd <= toTime;
  }).sort(function(a,b){ return (b.timestamp||0)-(a.timestamp||0); });

  if(!rangePx.length){
    toast(lang==='cw'?'Palibe zolemba mu nthawi imeneyi':'No transactions found in that period','e');
    return;
  }

  const sp = rangePx.filter(function(p){return p.type!=='income';}).reduce(function(s,p){return s+Number(p.amount||0);},0);
  const inc = rangePx.filter(function(p){return p.type==='income';}).reduce(function(s,p){return s+Number(p.amount||0);},0);
  const bg = Number(lCfg.overallBudget)||0;
  const periodIsSingle = (toTime - fromTime) <= 32*86400000;

  // No silent cap — all matching transactions are included
  const rows = rangePx.map(function(p){
    const u = uById(p.userId);
    return '<tr><td>'+fmtDate(p.date)+'</td><td>'+esc(p.item)+'</td><td>'+(p.type==='income'?'Income':'Expense')+'</td><td style="text-align:right;font-weight:700;color:'+(p.type==='income'?'#1B5E20':'#B71C1C')+'">MK '+Number(p.amount).toLocaleString()+'</td><td>'+esc(u.name)+'</td></tr>';
  }).join('');

  const catSpendPDF = {};
  rangePx.filter(function(p){return p.type!=='income';}).forEach(function(p){
    const c = catOf(p.item, p.cat);
    catSpendPDF[c] = (catSpendPDF[c]||0) + Number(p.amount||0);
  });
  const catRows = Object.entries(catSpendPDF).sort(function(a,b){return b[1]-a[1];}).map(function(e){
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #EDE7F6;font-size:12px"><span>'+esc(e[0])+'</span><span style="font-weight:700;color:#7B1FA2">MK '+Number(e[1]).toLocaleString()+'</span></div>';
  }).join('');

  const memberRows = lCfg.users.map(function(u){
    const ms = rangePx.filter(function(p){return p.userId===u.id && p.type!=='income';}).reduce(function(s,p){return s+Number(p.amount||0);},0);
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #EDE7F6;font-size:12px"><div style="display:flex;align-items:center;gap:8px"><div style="width:20px;height:20px;border-radius:50%;background:'+sC(u.color)+';display:flex;align-items:center;justify-content:center;color:#fff;font-size:9px;font-weight:800">'+esc(u.name[0])+'</div>'+esc(u.name)+'</div><span style="font-weight:700">MK '+Number(ms).toLocaleString()+'</span></div>';
  }).join('');

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bajeti Yanga -- '+esc(periodLabel)+' Report</title><style>@import url(\'https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap\');:root{--cr:14px}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Manrope,Arial,sans-serif;background:#F8F0FF;color:#1A1A2E;padding:32px 24px;max-width:680px;margin:0 auto}.header{background:linear-gradient(135deg,#7B1FA2,#4A148C);border-radius:var(--cr);padding:24px 28px;color:#fff;margin-bottom:24px;display:flex;align-items:center;gap:20px}.logo{width:56px;height:56px;background:rgba(255,255,255,.2);border-radius:var(--cr);display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0}.header-info h1{font-size:24px;font-weight:800;margin-bottom:4px}.header-info p{font-size:12px;opacity:.75}.summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}.sum-card{background:#fff;border-radius:var(--cr);padding:16px;text-align:center;box-shadow:0 2px 12px rgba(123,31,162,.1)}.sum-val{font-size:20px;font-weight:800;color:#7B1FA2;margin-bottom:4px}.sum-lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#607D8B}.sum-card.spent .sum-val{color:#B71C1C}.sum-card.income .sum-val{color:#1B5E20}.section{background:#fff;border-radius:var(--cr);padding:18px 20px;margin-bottom:16px;box-shadow:0 2px 12px rgba(0,0,0,.06)}.section h2{font-size:14px;font-weight:800;color:#7B1FA2;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid #EDE7F6}.tx-table{width:100%;border-collapse:collapse}.tx-table th{background:#F3E5F5;color:#4A148C;padding:8px 10px;text-align:left;font-size:11px;font-weight:700;border-radius:4px}.tx-table td{padding:7px 10px;border-bottom:1px solid #F3E5F5;font-size:12px}.tx-table tr:last-child td{border-bottom:none}.footer{text-align:center;font-size:10px;color:#9E9E9E;margin-top:24px;padding-top:16px;border-top:1px solid #EDE7F6}@media print{body{background:#fff;padding:16px}.header{-webkit-print-color-adjust:exact;print-color-adjust:exact}.section{box-shadow:none;border:1px solid #EDE7F6}}</style></head><body>';
  const fullHtml = html + '<div class="header"><div class="logo"><svg width="36" height="36" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="52" height="52" rx="13" fill="rgba(255,255,255,0.2)"/><rect x="8" y="34" width="9" height="10" rx="2.5" fill="rgba(255,255,255,0.4)"/><rect x="21" y="24" width="9" height="20" rx="2.5" fill="rgba(255,255,255,0.65)"/><rect x="34" y="14" width="9" height="30" rx="2.5" fill="#fff"/><polygon points="34,18 38.5,9 43,18" fill="#00E5FF"/></svg></div><div class="header-info"><h1>Bajeti Yanga</h1><p>Financial Report &bull; '+esc(periodLabel)+'<br>Household: '+esc(hhId)+' &bull; Generated: '+new Date().toLocaleDateString()+'</p></div></div>'
    + '<div class="summary-grid"><div class="sum-card spent"><div class="sum-val">MK '+Number(sp).toLocaleString()+'</div><div class="sum-lbl">Total Spent</div></div><div class="sum-card income"><div class="sum-val">MK '+Number(inc).toLocaleString()+'</div><div class="sum-lbl">Income</div></div><div class="sum-card"><div class="sum-val">MK '+Number(periodIsSingle ? Math.max(0,bg-sp) : (inc-sp)).toLocaleString()+'</div><div class="sum-lbl">'+(periodIsSingle?'Budget Remaining':'Net (Income - Spent)')+'</div></div></div>'
    + '<div class="section"><h2>Spending by Category</h2>'+catRows+'</div>'
    + '<div class="section"><h2>Spending by Member</h2>'+memberRows+'</div>'
    + '<div class="section"><h2>All Transactions ('+rangePx.length+')</h2><table class="tx-table"><thead><tr><th>Date</th><th>Item</th><th>Type</th><th>Amount</th><th>Member</th></tr></thead><tbody>'+rows+'</tbody></table></div>'
    + '<div class="footer">Bajeti Yanga v'+APP_VERSION+' &middot; &copy; 2026 Rodart Creatives &bull; Made in Malawi</div></body></html>';

  const w = window.open('','_blank');
  if(w){
    w.document.write(fullHtml); w.document.close();
    w.onafterprint = function(){ try{ w.close(); }catch(e){} };
    setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} },800);
  } else {
    try {
      const blob = new Blob([fullHtml], {type:'text/html'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'BajetiYanga_'+periodLabel.replace(/[\s,–]+/g,'_')+'_Report.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
      toast(lang==='cw'?'Lipoti latsitsidwa!':'Report downloaded! Open it in your browser to print.','s');
    } catch(e){
      toast(lang==='cw'?'Zalephera. Loleni ma popup ndipo yesaninso.':'Export failed. Allow popups and try again.','e');
    }
    return;
  }
  toast(lang==='cw'?'Lipoti lakonzeka -- Print kuti musunge':'PDF ready -- tap Print to save');
}

// ===============================================
// 15. USER SWITCH + MODALS
// ===============================================


function buildNotifs(){
  const notifs=[]; const t=tx(); const sp=totSp(), bg=lCfg.overallBudget, rem=bg-sp, pct=sp/bg;
  if(pct>=1) notifs.push({ico:'<i data-lucide="alert-triangle" style="color:var(--r1)"></i>',bg:'#FFEBEE',title:t.over,msg:'You have exceeded your monthly budget.'});
  else if(pct>=.8) notifs.push({ico:'<i data-lucide="alert-triangle" style="color:var(--a1)"></i>',bg:'#FFF3E0',title:t.near,msg:'You have used '+Math.round(pct*100)+'% of your budget.'});
  lCfg.items.forEach(it=>{const s=iSpent(it.name),r=s/it.budget;if(r>=1) notifs.push({ico:'<i data-lucide="x-circle" style="color:var(--r1)"></i>',bg:'#FFEBEE',title:esc(it.name)+' over budget',msg:MK(s)+' spent of '+MK(it.budget)});else if(r>=.85) notifs.push({ico:'<i data-lucide="circle" style="color:var(--a1)"></i>',bg:'#FFF3E0',title:esc(it.name)+' near limit',msg:Math.round(r*100)+'% used'});});
  lCfg.goals&&lCfg.goals.forEach(gl=>{const ml=goalMonthsLeft(gl.deadline),mn=goalMonthlyNeed(gl);if(ml!==null&&ml<=2&&gl.saved<gl.target) notifs.push({ico:'<i data-lucide="calendar" style="margin-right:3px;vertical-align:middle;color:var(--a1)"></i>',bg:'#E3F2FD',title:'Goal deadline: '+esc(gl.name),msg:ml===0?'Due this month!':'Only '+ml+' month(s) left -- need '+MK(mn)+'/mo'});});
  return notifs;
}
function openNotifs(){
  const notifs=buildNotifs(), t=tx();
  let h='<div class="dh"></div><h3><i data-lucide="bell" style="margin-right:5px;vertical-align:middle;color:var(--a1)"></i> Notifications</h3>';
  if(!notifs.length){h+='<div class="empty" style="padding:14px 0"><div class="ei"><i data-lucide="check-circle" style="width:32px;height:32px;color:var(--g2)"></i></div><p>'+(lang==='cw'?'Palibe zachenjezo':'All clear -- nothing needs your attention!')+'</p></div>';}
  else{notifs.forEach(n=>{h+='<div class="notif-item"><div class="notif-ico" style="background:'+n.bg+'">'+n.ico+'</div><div class="notif-txt"><b>'+n.title+'</b>'+n.msg+'</div></div>';});}
  g('mb-u').innerHTML=h;
  if(window.lucide)lucide.createIcons({nodes:[g('mb-u')]}); initIcons(); openM('mv-u');
}
function setIncType(el,idx){const wrap=el.closest('.type-tog');if(!wrap)return;wrap.querySelectorAll('button').forEach((b,i)=>{b.classList.toggle('on',i===idx);});wrap.setAttribute('data-inc',idx===1?'recurring':'once');}
function setHF(el){histFilter=el.dataset.f||'all';rHist();}
function setHT(el){histTime=el.dataset.t||'month';rHist();}
function openSwitch(){
  const t=tx();
  g('mb-u').innerHTML='<div class="dh"></div><h3><i data-lucide="refresh-cw" style="width:12px;height:12px;margin-right:3px;vertical-align:middle"></i> '+t.switchUser+'</h3><div style="display:flex;flex-direction:column;gap:8px">'+lCfg.users.map(u=>'<div style="display:flex;align-items:center;gap:11px;padding:12px;border-radius:var(--cr-md);border:2.5px solid '+(actU().id===u.id?sC(u.color):'var(--border)')+';background:'+(actU().id===u.id?sC(u.color)+'18':'var(--white)')+';cursor:pointer" data-uid="'+esc(u.id)+'" onclick="swU(this.dataset.uid)">'+'<div style="width:42px;height:42px;border-radius:50%;background:'+sC(u.color)+';display:flex;align-items:center;justify-content:center;font-weight:800;font-size:1.05rem;color:#fff">'+esc(u.name[0])+'</div><div style="flex:1"><div style="font-weight:800;font-size:.9rem">'+esc(u.name)+'</div><div style="font-size:.68rem;color:var(--mid)">'+lPx.filter(p=>p.userId===u.id&&isTM(p.date)).length+' entries this month</div></div>'+(actU().id===u.id?'<span style="color:'+sC(u.color)+';font-size:1.05rem">&#10003;</span>':'')+'</div>').join('')+'</div>';
  openM('mv-u');
}
function swU(id){ localStorage.setItem('nb_uid',id); updatePill(); closeM('mv-u'); render(); }
// Track open modals in the order they were opened (mv-confirm can stack on
// top of another already-open modal, e.g. a delete-confirm over Trash) so
// the device back button can close exactly the topmost one -- see the
// popstate handler below.
let _openModalStack = [];
let _modalCloseCallbacks = {};
function openM(id, onClose){ g(id).classList.add('open'); _openModalStack=_openModalStack.filter(x=>x!==id); _openModalStack.push(id); if(onClose) _modalCloseCallbacks[id]=onClose; }
function closeM(id){
  g(id).classList.remove('open');
  _openModalStack=_openModalStack.filter(x=>x!==id);
  const cb = _modalCloseCallbacks[id];
  if(cb){ delete _modalCloseCallbacks[id]; cb(); } // e.g. release a camera stream, whether closed via button or device-back
}
document.querySelectorAll('.ov').forEach(o=>o.addEventListener('click',e=>{
  if(e.target===o){
    if(window._qrScanInterval){ stopQRScanner(); }
    else { o.classList.remove('open'); }
  }
}));

