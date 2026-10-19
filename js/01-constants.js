// ===============================================
// 1. CONSTANTS -- must be declared before any let
// ===============================================

const TX = {
  en:{
    appTitle:'Bajeti Yanga',appSub:'Know where your Kwacha goes',
    home:'Home',log:'Log',hist:'History',sum:'Summary',mgr:'Manage',stg:'Settings',
    cap:'Monthly Cap',spent:'Spent',left:'Left',income:'Income',expense:'Expense',
    entries:'Entries',monthlyBudget:'monthly budget',chipItems:'items',
    recent:'Recent Transactions',viewAll:'View All',noPurchases:'No entries yet.',tapLog:'Tap + to add one.',
    logTitle:'Log Entry',selItem:'Select Item',selUser:'Who?',
    date:'Date',time:'Time',qty:'Qty',unit:'Unit',amount:'Amount (MK)',notes:'Notes',
    save:'Save',saved:'Saved',allEntries:'All Entries',all:'All',editP:'Edit',del:'Delete',
    confirmDel:'Delete this entry?',deleted:'Deleted',updated:'Updated',
    sumTitle:'Monthly Summary',budget:'Budget',ok:'OK',near:'Near',over:'Over',none:'--',total:'TOTAL',
    overallCap:'Overall Monthly Cap (MK)',members:'Household Members',
    editUser:'Edit Member',addMember:'Add Member',memberName:'Name',
    itemsLbl:'Items & Budgets',addItem:'Add New Item',
    iname:'Item name',ibudget:'Budget (MK)',add:'Add',mbudget:'Monthly Budget (MK)',cancel:'Cancel',
    itemAdded:'Item added',budgetUpdated:'Budget updated',itemDeleted:'Item removed',nameUpdated:'Updated',
    confirmDelItem:'Delete item?',confirmDelMember:'Remove member?',
    switchUser:'Switch User',householdCode:'Household Code',
    copyCode:'Copy',shareWA:'WhatsApp',codeCopied:'Code copied!',
    logout:'Sign Out',confirmLogout:'Sign out of this device?',
    sortCat:'Categories',sortAZ:'A-Z',sortOver:'Over Budget',sortSpend:'Top Spend',
    searchPurchases:'Search...',quickPick:'Quick Pick',
    goals:'Savings Goals',addGoal:'Add Goal',goalName:'Goal name',
    goalTarget:'Target (MK)',goalSaved:'Saved so far (MK)',topup:'Top Up',noGoals:'No savings goals yet.',
    pinSetup:'Set a 4-digit PIN',pinChange:'Change PIN',pinRemove:'Remove PIN',
    pinOff:'PIN disabled',pinOn:'PIN enabled',exportCSV:'Export to CSV',
    recurring:'Recurring',recurrYes:'Mark as recurring',
    billTracker:'Bill Tracker',addBill:'Add Bill',editBillT:'Edit Bill',billName:'Bill Name',billNamePH:'e.g. ESCOM, Water, Rent',
    iconLbl:'Icon',amountMKLbl:'Amount (MK)',dueDateLbl:'Due Date',dueLbl:'Due',todayLbl:'Today!',overdueLbl:'Overdue!',daysLeftLbl:'d left',
    noBillsYet:'No bills tracked yet.',noBillsSub:'Add rent, ESCOM, water. Never miss a due date.',
    billAdded:'Bill added!',billUpdated:'Bill updated!',billRemoved:'Bill removed.',removeBillQ:'Remove',removeBillQ2:'from your bill tracker?',
    billsDueSoon:'Bills due soon',fillAllFields:'Fill all fields.',
    markPaid:'Mark Paid',confirmMarkPaid:'Mark as paid?',confirmMarkPaidSub:'This logs an expense and moves the due date forward one month.',billPaidToast:'Bill marked as paid!',
    units:['kg','g','litres','ml','pieces','packets','bundles','bags','bottles','bars'],
    months:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    cats:{Food:'Food',Household:'Household',Transport:'Transport',Personal:'Personal',Other:'Other'}
  },
  cw:{
    appTitle:'Bajeti Yanga',appSub:'Dziwani komwe ndalama zanu zimapita',
    home:'Pakhomo',log:'Zolowetsa',hist:'Mbiri',sum:'Chidule',mgr:'Kasamalidwe',stg:'Zokhazikitsa',
    cap:'Malire a Mwezi',spent:'Zotuluka',left:'Zotsala',income:'Ndalama Zolowa',expense:'Ndalama Zotuluka',
    entries:'Zolembedwa',monthlyBudget:'bajeti ya mwezi',chipItems:'zinthu',
    recent:'Zochitika za tsopano',viewAll:'Onani Zonse',noPurchases:'Palibe cholemba chilichonse.',tapLog:'Dinani + kuti mulowetse.',
    logTitle:'Lembani Zomwe Mwagula',selItem:'Sankhani Chinthu',selUser:'Ndani akugula?',
    date:'Tsiku',time:'Nthawi',qty:'Kuchuluka',unit:'Mulingo',amount:'Ndalama (MK)',notes:'Zolemba',
    save:'Sungani',saved:'Yasungidwa',allEntries:'Zolemba Zonse',all:'Zonse',editP:'Sinthani',del:'Chotsani',
    confirmDel:'Mukufuna kufufuta ichi?',deleted:'Chachotsedwa',updated:'Chasinthidwa',
    sumTitle:'Chidule cha Mwezi',budget:'Bajeti',ok:'Chabwino',near:'Pafupi Kumalizika',over:'Yapitilira Bajeti',none:'--',total:'CHIWERENGERO CHONSE',
    overallCap:'Malire Onse a Mwezi (MK)',members:'Anthu a Nyumbayi',
    editUser:'Sinthani Munthu',addMember:'Onjezani Munthu Watsopano',memberName:'Dzina',
    itemsLbl:'Zinthu ndi Bajeti',addItem:'Onjezerani Chinthu Chatsopano',
    iname:'Dzina la chinthu',ibudget:'Bajeti (MK)',add:'Onjezani',mbudget:'Bajeti ya Mwezi (MK)',cancel:'Siyani',
    itemAdded:'Chinthu chaonjezeledwa',budgetUpdated:'Bajeti yasinthidwa',itemDeleted:'Chinthu chachotsedwa',nameUpdated:'Dzina lasinthidwa',
    confirmDelItem:'Mukufuna kuchotsa chinthu?',confirmDelMember:'Mukufuna kuchotsa munthuyu?',
    switchUser:'Sinthani Wogwiritsa Ntchito',householdCode:'Kodi ya Nyumba',
    copyCode:'Kopelani',shareWA:'WhatsApp',codeCopied:'Kodi yakopedwa!',
    logout:'Tulukani',confirmLogout:'Mukufuna kutuluka?',
    sortCat:'Mtundu wa Zinthu',sortAZ:'Dongosolo A-Z',sortOver:'Zapitilira Bajeti',sortSpend:'Zotuluka Zambiri',
    searchPurchases:'Fufuzani pa zolemba...',quickPick:'Sankhani Msanga',
    goals:'Ndalama Zosungidwa',addGoal:'Onjezani Cholinga Chatsopano',goalName:'Dzina la cholinga',
    goalTarget:'Ndalama Yofuna Kusungira (MK)',goalSaved:'Ndalama Yosungidwa (MK)',topup:'Onjezani',noGoals:'Mulibe zolinga zosungira.',
    pinSetup:'Ikani PIN ya manambala 4',pinChange:'Sinthani PIN',pinRemove:'Chotsani PIN',
    pinOff:'PIN yachotsedwa',pinOn:'PIN yapangidwa',exportCSV:'Tsitsani CSV',
    recurring:'Kubwerezabwereza',recurrYes:'Chongani ngati chobwerezabwereza',
    billTracker:'Zolipira',addBill:'Onjezani Bili',editBillT:'Sinthani Bili',billName:'Dzina la Bili',billNamePH:'Mwachitsanzo: ESCOM, Madzi, Lenti',
    iconLbl:'Aikoni',amountMKLbl:'Ndalama (MK)',dueDateLbl:'Tsiku Lolipira',dueLbl:'Kulipira pa',todayLbl:'Lero!',overdueLbl:'Yapitilira!',daysLeftLbl:'masiku otsala',
    noBillsYet:'Palibe bili yolembedwa.',noBillsSub:'Onjezani lenti, ESCOM, madzi. Osaiwala tsiku lolipira.',
    billAdded:'Bili yaonjezedwa!',billUpdated:'Bili yasinthidwa!',billRemoved:'Bili yachotsedwa.',removeBillQ:'Mukufuna kuchotsa',removeBillQ2:'pa mabili anu?',
    billsDueSoon:'Mabili oyandikira',fillAllFields:'Lowetsani zonse zofunika.',
    markPaid:'Kulipira',confirmMarkPaid:'Mukufuna kulemba kuti bili yalipidwa?',confirmMarkPaidSub:'Izi zidzalembedwa ngati ndalama zotuluka ndipo tsiku lolipira lidzasunthira mwezi wotsatira.',billPaidToast:'Bili yalembedwa ngati yolipidwa!',
    units:['kg','g','malita','ml','mapisi','mapaketi','mabandulo','matumba','mabotolo','mabar'],
    months:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
    cats:{Food:'Chakudya',Household:'Zapakhomo',Transport:'Mayendedwe',Personal:'Zamwini',Other:'Zina'},itemNames:{'Tomatoes':'Tomato','Onions':'Anyezi','Maize Flour (Ufa)':'Ufa','Cooking Oil':'Mafuta a Kuphikira','Sugar':'Shuga','Salt':'Mchere','Soap (bar)':'Sopo','Washing Powder':'Poda Yosambira','Rice':'Mpunga','Beans (Nyemba)':'Nyemba','Potatoes':'Mbatata','Cabbage':'Kabichi','Chicken':'Nkhuku','Fish (Nsomba)':'Nsomba','Bread':'Buledi','Milk':'Mkaka','Tea Leaves':'Tiyi','Charcoal':'Makala','Toilet Paper':'Pepala la Chimbudzi','Matches/Candles':'Machesi/Makandulo','Bathing Soap':'Sopo Wosamba','Toothpaste':'Mafuta a Mano','Airtime / Data':'Airtime/Data','Transport':'Mayendedwe','Fuel':'Mafuta','Electricity':'Magetsi','Rent':'Lenti','Diapers':'Matewera','Money Sent':'Ndalama Zotumizidwa','School Fees':'Ndalama za Sukulu','Other':'Zina'}
  }
};

const DEF_ITEMS = [
  {name:'Tomatoes',budget:15000},{name:'Onions',budget:8000},
  {name:'Maize Flour (Ufa)',budget:35000},{name:'Cooking Oil',budget:20000},
  {name:'Sugar',budget:12000},{name:'Salt',budget:2000},
  {name:'Soap (bar)',budget:6000},{name:'Washing Powder',budget:8000},
  {name:'Rice',budget:18000},{name:'Beans (Nyemba)',budget:10000},
  {name:'Potatoes',budget:9000},{name:'Cabbage',budget:5000},
  {name:'Chicken',budget:25000},{name:'Fish (Nsomba)',budget:12000},
  {name:'Bread',budget:8000},{name:'Milk',budget:10000},
  {name:'Tea Leaves',budget:4000},{name:'Charcoal',budget:20000},
  {name:'Toilet Paper',budget:5000},{name:'Matches/Candles',budget:2000},
  {name:'Bathing Soap',budget:4000},{name:'Toothpaste',budget:3500},
  {name:'Airtime / Data',budget:15000},{name:'Transport',budget:20000},
  {name:'Fuel',budget:25000},{name:'Electricity',budget:18000},{name:'Rent',budget:80000},{name:'Diapers',budget:12000},{name:'Money Sent',budget:20000},{name:'School Fees',budget:35000},{name:'Other',budget:15000}
];
const DEF_USERS = [
  {id:'u1',name:'Person 1',color:'#7B1FA2'},
  {id:'u2',name:'Person 2',color:'#E91E63'}
];
const DEF_CFG = {items:DEF_ITEMS,users:DEF_USERS,overallBudget:400000,goals:[],salaryDay:0};

const ITEM_ICONS = {
  'Tomatoes':'&#127813;','Onions':'&#129477;','Maize Flour (Ufa)':'&#127805;',
  'Cooking Oil':'<i data-lucide="droplet" style="width:18px;height:18px;color:#F9A825;vertical-align:middle"></i>',
  'Sugar':'<i data-lucide="package" style="width:18px;height:18px;color:#42A5F5;vertical-align:middle"></i>',
  'Salt':'&#129474;','Soap (bar)':'&#129532;','Washing Powder':'&#129767;',
  'Rice':'&#127834;','Beans (Nyemba)':'&#129752;','Potatoes':'&#129364;','Cabbage':'&#129388;',
  'Chicken':'&#127831;','Fish (Nsomba)':'&#128031;','Bread':'&#127838;','Milk':'&#129371;',
  'Tea Leaves':'&#127861;',
  'Charcoal':'<i data-lucide="flame" style="width:18px;height:18px;color:#E65100;vertical-align:middle"></i>',
  'Toilet Paper':'&#129531;','Matches/Candles':'&#128367;',
  'Bathing Soap':'&#129524;','Toothpaste':'&#129463;',
  'Airtime / Data':'<i data-lucide="smartphone" style="width:18px;height:18px;color:#1565C0;vertical-align:middle"></i>',
  'Transport':'<i data-lucide="bus" style="width:18px;height:18px;color:#E65100;vertical-align:middle"></i>',
  'Fuel':'<i data-lucide="fuel" style="width:18px;height:18px;color:#E65100;vertical-align:middle"></i>',
  'Electricity':'<i data-lucide="zap" style="width:18px;height:18px;color:#F9A825;vertical-align:middle"></i>',
  'Rent':'<i data-lucide="home" style="width:18px;height:18px;color:#4527A0;vertical-align:middle"></i>',
  'Diapers':'<i data-lucide="baby" style="width:18px;height:18px;color:#EC407A;vertical-align:middle"></i>',
  'Money Sent':'<i data-lucide="send" style="width:18px;height:18px;color:#1B5E20;vertical-align:middle"></i>',
  'School Fees':'<i data-lucide="graduation-cap" style="width:18px;height:18px;color:#1565C0;vertical-align:middle"></i>',
  'Other':'<i data-lucide="package" style="width:18px;height:18px;color:#6D4C41;vertical-align:middle"></i>',
  'Salary/Income':'<i data-lucide="wallet" style="width:18px;height:18px;color:#1B5E20;vertical-align:middle"></i>',
  'Business Income':'<i data-lucide="briefcase" style="width:18px;height:18px;color:#1565C0;vertical-align:middle"></i>',
  'Farm Income':'<i data-lucide="sprout" style="width:18px;height:18px;color:#2E7D32;vertical-align:middle"></i>',
  'Other Income':'<i data-lucide="coins" style="width:18px;height:18px;color:#F9A825;vertical-align:middle"></i>'
};

const ITEM_CATS = {
  Food:['Tomatoes','Onions','Maize Flour (Ufa)','Cooking Oil','Sugar','Salt','Rice',
        'Beans (Nyemba)','Potatoes','Cabbage','Chicken','Fish (Nsomba)','Bread','Milk','Tea Leaves'],
  Household:['Soap (bar)','Washing Powder','Charcoal','Toilet Paper','Matches/Candles','Electricity','Rent'],
  Personal:['Bathing Soap','Toothpaste','Diapers'],
  Transport:['Transport','Fuel','Money Sent'],
  Other:['Airtime / Data','School Fees','Electricity','Other']
};

const CAT_COLORS = {Food:'#2E7D32',Household:'#1565C0',Personal:'#E91E63',Transport:'#E65100',Other:'#6D4C41'};
const PIE_COLORS = ['#7B1FA2','#E91E63','#1565C0','#2E7D32','#E65100','#00838F','#F57F17','#4527A0','#558B2F','#795548'];
const QUICK_PICKS = ['Tomatoes','Maize Flour (Ufa)','Cooking Oil','Sugar','Soap (bar)','Rice','Charcoal','Bread','Transport','Airtime / Data'];
const NO_QTY_ITEMS=['Money Sent','Airtime / Data','Rent','School Fees','Transport','Electricity','Other'];
const MEMBER_COLORS = ['#7B1FA2','#E91E63','#1565C0','#2E7D32','#E65100','#00838F','#AD1457','#4527A0','#558B2F','#795548'];
const APP_VERSION = '9.6.1';
// Household limits — change these values to adjust limits app-wide
const HOUSEHOLD_LIMITS = { free: 3, premium: Infinity };
// Deep link base URL — used in QR codes and join links
const APP_BASE_URL = 'https://rodart265.github.io/bajeti-yanga/';
// Reusable app logo SVG — bar chart with cyan accent
const APP_LOGO_SVG = (size, bg) => `<svg width="${size}" height="${size}" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="52" height="52" rx="13" fill="${bg||'rgba(255,255,255,0.18)'}"/><rect x="8" y="34" width="9" height="10" rx="2.5" fill="rgba(255,255,255,0.4)"/><rect x="21" y="24" width="9" height="20" rx="2.5" fill="rgba(255,255,255,0.65)"/><rect x="34" y="14" width="9" height="30" rx="2.5" fill="#fff"/><polygon points="34,18 38.5,9 43,18" fill="#00E5FF"/></svg>`;

// ===============================================
// 2. STATE -- only after all consts
// ===============================================

let lang = localStorage.getItem('nb_lang') || 'en';
// TEMP -- Chichewa paused while translations are reworked. Dictionary (TX.cw) is untouched,
// this just blocks access. Remove this block + the guard in toggleLang() to re-enable.
if(lang==='cw'){ lang='en'; localStorage.setItem('nb_lang','en'); }
let curUser = null, hhId = null, unsub = null, authReg = false;
// ── Chipereganyu (rotating savings circle) state ──
let chipGroups = [], unsubChip = null, chipActiveId = null, chipTab = 'cycle';
let lCfg = JSON.parse(JSON.stringify(DEF_CFG));
let lPx = [];
let lHHDoc = {};
let tab = 'home', selItem = null, fUser = 'all', logSrch = '';
let sortMode = 'cat', srchQ = '', logType = 'expense', histFilter = 'all', histTime = 'month';
// Tracks which Settings drill-down (members/items/goals/bills) is currently open, if any.
// Row-level actions (edit/delete/add) call back into this so they refresh the
// same drill-down instead of bouncing to the Settings hub.
let _stgSection = null;
let _sdPanelOpen = false; // Salary Day panel in Settings: collapsed by default, expands on tap
function _stgRefresh(){ if(_stgSection){ stgOpenSection(_stgSection); } else { rStg(); } }
// Live listener for the owner's pending-join-requests panel, so a request that's
// cancelled or declined disappears immediately instead of needing a manual refresh.
let _joinReqUnsub = null;
function _stopJoinReqListener(){ if(_joinReqUnsub){ _joinReqUnsub(); _joinReqUnsub = null; } }
let viewMonth = null;
let pinEntry = '', pinMode = 'check', pinTmp = '';
// Set right before showing the PIN screen from a specific origin screen, and
// consumed (reset) the moment it's used, so the back button can return a
// returning user to "Welcome back" instead of forcing them through sign-in
// again. Left null for all other PIN entry points (setup, resume-lock,
// in-app PIN change) which keep their existing, already-correct fallback.
let _pinBackTarget = null;
let confResult = null, rcapV = null;
let unsubHH = null; // Household document listener - separate from purchases listener
let unsubJoinBadge = null; let _joinBadgeFor = null; // Pending-join-request badge listener (owner only)
let _lastMemberUids = null; // Snapshot of memberUids from the previous household-doc update, used to detect new joins

// ── Performance: memoized totals ──
// Invalidated whenever lPx or viewMonth changes
let _memoKey = '', _memoSp = 0, _memoIn = 0, _memoByItem = {};
function _invalidateMemo(){ _memoKey = ''; }
function _ensureMemo(){
  const key = (hhId||'')+'|'+(viewMonth?viewMonth.m+'-'+viewMonth.y:'')+'|'+((lCfg&&lCfg.salaryDay)||0)+'|'+lPx.length;
  if(key === _memoKey) return;
  _memoKey = key;
  _memoSp = 0; _memoIn = 0; _memoByItem = {};
  lPx.forEach(p=>{
    if(p.deleted) return;
    if(!isTM(p.date)) return;
    const a = Number(p.amount)||0;
    if(p.type==='income'){ _memoIn+=a; }
    else { _memoSp+=a; _memoByItem[p.item]=(_memoByItem[p.item]||0)+a; }
  });
}

