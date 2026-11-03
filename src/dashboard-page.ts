// صفحة لوحة الإنتاج (ثنائية اللغة عربي/إنجليزي). الزائر يعرض ويعاين فقط، والمسؤول (تسجيل دخول) يطلب الإنتاج ويتحكم فيه.
// لا تحتوي backtick ولا ${ لأنها داخل String.raw
export const PAGE = String.raw`<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JAWAB Studio</title>
<style>
:root{--navy:#1e3a8a;--blue:#60a5fa;--green:#10b981;--bg:#f4f7fc;--line:#dbe3f0;--txt:#0f172a;--mut:#64748b;--red:#dc2626;--amber:#d97706}
*{box-sizing:border-box}body{margin:0;font-family:"Segoe UI",Tahoma,sans-serif;background:var(--bg);color:var(--txt)}
header{background:linear-gradient(90deg,var(--navy),#27479e);color:#fff;padding:12px 20px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
header h1{font-size:19px;margin:0;flex:1;min-width:180px}
.pill{padding:3px 12px;border-radius:999px;font-size:13px;font-weight:600;background:#ffffff26}.pill.ok{background:var(--green)}.pill.warn{background:var(--amber)}
button,.lnk{font:inherit;font-size:13px;border:1px solid var(--line);background:#fff;color:var(--navy);padding:4px 12px;border-radius:8px;cursor:pointer;text-decoration:none}
button:hover{background:#eef3fb}button.pri{background:var(--green);border-color:var(--green);color:#fff}button.dng{color:var(--red)}button.ghost{border-style:dashed}
header button,header .lnk{background:#ffffff1f;border-color:#ffffff40;color:#fff}header button:hover{background:#ffffff33}
main{padding:18px 20px;max-width:980px;margin:auto}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:18px}
.card h2{margin:0 0 4px;font-size:18px;color:var(--navy)}.sub{color:var(--mut);font-size:13px}
.bar{height:10px;background:#e5ebf5;border-radius:6px;overflow:hidden;margin:10px 0 6px}.bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--navy),var(--blue),var(--green));transition:width .4s}
.bar.mini{height:6px;margin:6px 0 2px;max-width:260px}
.sum{display:flex;gap:14px;flex-wrap:wrap;font-size:14px;align-items:center}.sum b{font-size:17px}
table{width:100%;border-collapse:collapse;font-size:14px}td{padding:9px 6px;border-top:1px solid var(--line);vertical-align:middle}td.n{min-width:42px;white-space:nowrap;color:var(--mut)}td.acts{text-align:end;white-space:nowrap}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:700;color:#fff;background:var(--mut);white-space:nowrap}
.b-Completed{background:var(--green)}.b-Failed{background:var(--red)}.b-Queued{background:#94a3b8}.b-Paused{background:var(--amber)}.b-Skipped{background:#475569}
.b-Preparing,.b-Recording,.b-Processing,.b-Validating{background:var(--blue);animation:pulse 1.4s infinite}.b-none{background:#cbd5e1;color:#334155}.b-req{background:var(--amber)}
@keyframes pulse{50%{opacity:.55}}.err{color:var(--red);font-size:12px;word-break:break-word}
.modal{position:fixed;inset:0;background:#000b;display:none;align-items:center;justify-content:center;z-index:9}.modal.on{display:flex}
#vmodal video{max-width:94vw;max-height:88vh;border-radius:10px;background:#000}#vmodal video.vert{max-width:48vh;max-height:92vh}
#lmodal form{background:#fff;border-radius:14px;padding:22px;width:min(340px,92vw);display:flex;flex-direction:column;gap:10px}
#lmodal h3{margin:0;color:var(--navy)}#lmodal input{font:inherit;padding:9px 12px;border:1px solid var(--line);border-radius:10px}
.tabs{display:flex;gap:8px;margin-bottom:12px}.tabs button{padding:7px 18px;font-size:14px}.tabs button.on{background:var(--navy);color:#fff;border-color:var(--navy)}.tools select{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:#fff}
.tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:4px 0 14px}.tools input{font:inherit;flex:1;min-width:200px;padding:8px 12px;border:1px solid var(--line);border-radius:10px}
.chips span{margin-inline-end:12px;font-size:13px}
.gh{margin:22px 0 4px;font-size:20px;color:var(--navy)}.bt{margin:16px 0 6px;font-weight:700}.legend{font-size:13px;color:var(--mut);margin-bottom:6px;line-height:2}
.gsec{background:#fff;border:1px solid var(--line);border-radius:12px;padding:10px 16px;margin-bottom:8px}.gsec summary{cursor:pointer;font-size:15px}.gsec summary .mut{color:var(--mut);font-size:12px;margin-inline-start:8px}.gsec table{margin-top:6px}
.tag{display:inline-block;min-width:20px;text-align:center;border-radius:6px;font-size:12px;font-weight:700;color:#fff;padding:1px 6px}.tA{background:var(--green)}.tB{background:var(--amber)}.tC{background:var(--blue)}.tD{background:#475569}
#toast{position:fixed;bottom:16px;inset-inline-start:16px;background:var(--navy);color:#fff;padding:9px 14px;border-radius:10px;display:none;z-index:10}
@media (max-width:640px){
  header{padding:10px 12px;gap:6px}header h1{flex:1 1 100%;font-size:16px;min-width:0}
  header .pill{font-size:12px;padding:2px 9px}header button,header .lnk{font-size:12px;padding:6px 10px}
  main{padding:10px 12px}.card{padding:12px;border-radius:12px;margin-bottom:12px}.card h2{font-size:16px}
  button,.lnk{min-height:36px;padding:6px 12px}
  .sum{gap:8px 12px;font-size:13px}
  .tools{position:sticky;top:0;z-index:5;background:var(--bg);padding:6px 0;margin:0 0 6px}.tools input{min-width:0;font-size:16px}
  .gh{font-size:18px}.legend{font-size:12px;line-height:2.2}
  .gsec{padding:8px 10px}.gsec summary{font-size:14px;padding:6px 0;line-height:1.5}
  table,tbody{display:block}
  tr{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;padding:10px 0;border-top:1px solid var(--line)}
  td{display:block;border:0;padding:0}td.n{width:auto;flex:0 0 auto;font-size:12px}
  tr>td:nth-child(2){flex:1 1 55%;min-width:0;word-break:break-word}
  td.acts{flex:1 1 100%;text-align:start;white-space:normal;display:flex;flex-wrap:wrap;gap:6px}
  td.acts:empty{display:none}
  td.acts button{flex:1 1 auto}
  .modal{align-items:stretch}
  #vmodal video{max-width:100vw;max-height:100vh;width:100vw;border-radius:0;align-self:center}
  #vmodal video.vert{max-width:100vw;max-height:100vh;width:auto;height:100vh}
  #lmodal{align-items:flex-start;padding-top:12vh}#lmodal form{margin:0 auto}#lmodal input{font-size:16px}
  #toast{inset-inline:12px;text-align:center}
}
</style></head><body>
<header><h1 id="ttl"></h1><span id="qpill" class="pill"></span><span id="wpill" class="pill"></span>
<a class="lnk" id="dictlnk" href="/dictionary"></a>
<button id="pausebtn" data-act="pause" style="display:none"></button><button id="workbtn" data-c='{"action":"start-worker"}' style="display:none"></button>
<button id="admbtn" data-act="adm"></button><button id="langbtn" data-act="lang"></button></header>
<main id="app"></main>
<div id="vmodal" class="modal" data-act="close"><video id="vid" controls></video></div>
<div id="lmodal" class="modal" data-act="lclose"><form id="lform"><h3 id="ltitle"></h3><input id="luser" autocomplete="username"><input id="lpass" type="password" autocomplete="current-password"><div id="lerr" class="err"></div><button class="pri" type="submit" id="lgo"></button></form></div>
<div id="toast"></div>
<script>
var T={
ar:{title:'استوديو JAWAB: لوحة الإنتاج',qOn:'الطابور نشط',qOff:'الطابور متوقف',wOn:'الإنتاج يعمل',wOff:'لا إنتاج جارٍ الآن',dict:'قاموس الحلقات',pause:'إيقاف الطابور',resume:'استئناف الطابور',work:'تشغيل الإنتاج',lang:'English',
 admIn:'دخول المسؤول',admOut:'مسؤول: خروج',lUser:'اسم المستخدم',lPass:'كلمة المرور',lGo:'دخول',lBad:'بيانات الدخول غير صحيحة',lLock:'محاولات كثيرة، انتظر قليلًا',
 overall:'تقدم الإنتاج',of:'من',done:'مكتملة',running:'قيد العمل',queued:'في الطابور',failed:'فاشلة',reqd:'مطلوبة',search:'ابحث في الأقسام والحلقات…',
 run:'ابدأ إنتاج هذا القسم',runN:'أنتج الحلقات الخمس التالية',noSeries:'لا توجد ملفات حلقات لهذا القسم بعد، فلا يمكن إنتاجه.',reqBtn:'اطلب إنتاج هذا القسم',reqOn:'مطلوب إنتاجه',unreq:'سحب الطلب',reqHint:'الطلب يُحفظ ويُكتب القسم ثم يُنتج.',
 ready:'جاهز للمعاينة',tGuide:'الدليل',tPub:'النشر (يوتيوب)',pubTitle:'النشر على يوتيوب',pubSub:'حزمة لكل حلقة: عنوان ووصف وفصول وترجمة وغلاف. الرفع مسودات خاصة فقط، والنشر العلني يدوي من YouTube Studio بعد مراجعتك.',pubPk:'حزمة جاهزة',pubAuthOk:'القناة مفوَّضة',pubAuthNo:'القناة غير مفوَّضة بعد (شغّل auth)',pubNoCfg:'بيانات Google غير مضافة في .env',pubPrep:'حدّث الحزم',pubCh:'فصول',pubNoThumb:'بلا غلاف',pubDraft:'مسودة خاصة',pubNot:'لم تُرفع',pubCopyT:'نسخ العنوان',pubCopyD:'نسخ الوصف',pubCopied:'تم النسخ',tProg:'التقدم (للمسؤول)',fAll:'كل الحالات',fReady:'جاهزة',fSoon:'قريبًا',fProg:'قيد العمل',fQueued:'في الطابور',fFailed:'فاشلة',fPlanned:'لم تبدأ',gSec:'التجميع: حسب القسم',gSt:'التجميع: حسب الحالة',gReady:'جاهزة للمعاينة',gSoon:'قريبًا',gProg:'قيد العمل',gQueued:'في الطابور',gFailed:'فاشلة',gPlanned:'لم تبدأ',guide:'الدليل الكامل للأكاديمية',guideSub:'{n} حلقة في {s} قسمًا. كل قسم تحته حلقاته.',tagA:'إنشاء فقط',tagB:'ترحيل أو تأكيد',tagC:'عرض فقط',tagD:'مستبعدة',batch1:'الدفعة 1: الوحدات الأساسية',batch2:'الدفعة 2: الإدارة والتشغيل (الحلقات تُحدَّد لاحقًا)',batch3:'الدفعة 3: وحدات JAWAB الخاصة (الحلقات تُحدَّد لاحقًا)',eps:'حلقة',tbd:'تُحدَّد الحلقات لاحقًا',sPlanned:'مخطط',
 play169:'معاينة 16:9',playV:'معاينة عمودي',retry:'إعادة',cancel:'إلغاء',
 sCompleted:'مكتمل',sFailed:'فشل',sQueued:'في الطابور',sPaused:'متوقف',sSkipped:'متخطّى',sPreparing:'تحضير',sRecording:'تسجيل',sProcessing:'معالجة',sValidating:'تحقق',loading:'جارٍ التحميل…',ok:'تم',fail:'تعذر تنفيذ الأمر',noMatch:'لا نتائج'},
en:{title:'JAWAB Studio: Production Dashboard',qOn:'Queue running',qOff:'Queue paused',wOn:'Production running',wOff:'No production running',dict:'Episode dictionary',pause:'Pause queue',resume:'Resume queue',work:'Start production',lang:'العربية',
 admIn:'Admin sign in',admOut:'Admin: sign out',lUser:'Username',lPass:'Password',lGo:'Sign in',lBad:'Wrong username or password',lLock:'Too many attempts, wait a bit',
 overall:'Production progress',of:'of',done:'done',running:'in progress',queued:'queued',failed:'failed',reqd:'requested',search:'Search sections and episodes…',
 run:'Run production for this section',runN:'Produce the next 5 episodes',noSeries:'No episode files for this section yet, so it cannot be produced.',reqBtn:'Request production',reqOn:'Production requested',unreq:'Withdraw request',reqHint:'The request is saved; the section is then written and produced.',
 ready:'Ready to preview',tGuide:'Guide',tPub:'Publishing (YouTube)',pubTitle:'YouTube publishing',pubSub:'One package per episode: title, description, chapters, captions and cover. Uploads are private drafts only; going public is manual in YouTube Studio after your review.',pubPk:'packages ready',pubAuthOk:'Channel authorized',pubAuthNo:'Channel not authorized yet (run auth)',pubNoCfg:'Google credentials not in .env',pubPrep:'Refresh packages',pubCh:'chapters',pubNoThumb:'no cover',pubDraft:'Private draft',pubNot:'Not uploaded',pubCopyT:'Copy title',pubCopyD:'Copy description',pubCopied:'Copied',tProg:'Progress (admin)',fAll:'All statuses',fReady:'Ready',fSoon:'Coming soon',fProg:'In progress',fQueued:'Queued',fFailed:'Failed',fPlanned:'Not started',gSec:'Group: by section',gSt:'Group: by status',gReady:'Ready to preview',gSoon:'Coming soon',gProg:'In progress',gQueued:'Queued',gFailed:'Failed',gPlanned:'Not started',guide:'Full Academy Guide',guideSub:'{n} episodes in {s} sections. Each section lists its episodes (episode titles are in Arabic).',tagA:'create only',tagB:'post / confirm',tagC:'view only',tagD:'excluded',batch1:'Batch 1: core modules',batch2:'Batch 2: administration and operations (episodes to be defined)',batch3:'Batch 3: JAWAB-specific modules (episodes to be defined)',eps:'episodes',tbd:'episodes TBD',sPlanned:'Planned',
 play169:'Preview 16:9',playV:'Preview vertical',retry:'Retry',cancel:'Cancel',
 sCompleted:'Done',sFailed:'Failed',sQueued:'Queued',sPaused:'Paused',sSkipped:'Skipped',sPreparing:'Preparing',sRecording:'Recording',sProcessing:'Processing',sValidating:'Validating',loading:'Loading…',ok:'Done',fail:'Command failed',noMatch:'No results'}};
var ENN={S01:'Getting Started with Jawab',S02:'Accounting Basics',S03:'Sales',S04:'CRM',S05:'Purchase',S06:'Inventory and Warehouses',S07:'Point of Sale',S08:'Invoices and Payments',S09:'Reports and Financial Analysis',S10:'Products, Prices and Discounts',S11:'Employees and HR',S12:'Administration and Permissions',S13:'VAT and E-Invoicing',S14:'Dashboards',S15:'End-to-End Workflows',S16:'Hotel Management',S17:'Franchise',S18:'Payroll',S19:'Projects and Expenses',S20:'Manufacturing and Maintenance',S21:'Recruitment, Attendance and Fleet',S22:'Marketing, Events and Surveys',S23:'Website and E-Learning'};
var lang='ar';try{lang=localStorage.getItem('lang')||((navigator.language||'').slice(0,2)==='ar'?'ar':'en')}catch(e){}
var S=null,G=null,P=null,busy=false,openG={},query='',fstat='',view='guide',gby='sec';try{gby=localStorage.getItem('gby')||'sec'}catch(e){}
function t(k){return T[lang][k]}
function adm(){return !!(S&&S.admin)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fmt(v){return v?Math.floor(v/60)+':'+String(Math.round(v%60)).padStart(2,'0'):'-'}
function toast(m){var x=document.getElementById('toast');x.textContent=m;x.style.display='block';setTimeout(function(){x.style.display='none'},3000)}
function cmd(b){fetch('/api/cmd',{method:'POST',headers:{'content-type':'application/json','x-tutorial':'1'},body:JSON.stringify(b)}).then(function(r){return r.json()}).then(function(j){toast(j.message||j.error||t('ok'))}).catch(function(){toast(t('fail'))}).then(load)}
function btn(label,c,cls){return adm()?'<button class="'+(cls||'')+'" data-c="'+esc(JSON.stringify(c))+'">'+label+'</button> ':''}
function nm(s){return lang==='en'?(ENN[s.code]||s.title):s.title}
function match(s){
  if(!query)return true;var q=query.toLowerCase();
  return (s.code+' '+s.title+' '+(ENN[s.code]||'')+' '+s.episodes.map(function(e){return e.code+' '+e.title}).join(' ')).toLowerCase().indexOf(q)>=0;
}
// حالة الحلقة للتصفية والتجميع: ready/progress/queued/failed/planned (الزائر يرى ready وplanned فقط، والخادم يخفي الباقي عنه)
function stKey(e){var s=e.status;if(s==='Completed')return 'ready';if(s==='Failed')return 'failed';if(s==='Queued'||s==='Paused')return 'queued';if(s)return 'progress';return 'planned'}
function allEps(){var r=[];G.sections.forEach(function(s){s.episodes.forEach(function(e){r.push({s:s,e:e,k:stKey(e)})})});return r}
function epRow(x,showSec){
  var e=x.e,h='<tr><td class="n">'+(showSec?x.s.code+' ':'')+e.code.replace(/^S\d+/,'')+'</td><td>'+esc(e.title)+(showSec?'<div class="sub">'+esc(nm(x.s))+'</div>':'')+(e.error?'<div class="err">'+esc(String(e.error).slice(0,140))+'</div>':'')+'</td><td><span class="tag t'+e.tag+'">'+e.tag+'</span></td><td><span class="badge '+(e.status?'b-'+e.status:'b-none')+'">'+(e.status?t('s'+e.status):t('sPlanned'))+'</span></td><td class="acts">';
  if(e.id&&(e.status==='Failed'||e.status==='Skipped'))h+=btn(t('retry'),{action:'retry',job:e.id});
  if(e.id&&['Queued','Paused','Preparing','Recording','Processing','Validating'].indexOf(e.status)>=0)h+=btn(t('cancel'),{action:'cancel',job:e.id},'dng');
  if(e.video)h+='<button class="pri" data-play="'+esc(e.video)+'">'+t('play169')+'</button> <button class="pri" data-play="'+esc(e.reel)+'" data-v="1">'+t('playV')+'</button>';
  return h+'</td></tr>';
}
// تبويب التقدم: للمسؤول فقط
function progressHtml(){
  var xs=allEps().filter(function(x){return x.s.batch===1}),n=xs.length,c={ready:0,progress:0,queued:0,failed:0,planned:0};
  xs.forEach(function(x){c[x.k]++});
  var rq=G.sections.filter(function(s){return s.requested});
  var h='<div class="card"><h2>'+t('overall')+'</h2><div class="bar"><i style="width:'+(n?Math.round(c.ready*100/n):0)+'%"></i></div><div class="sum"><span><b>'+c.ready+'</b> '+t('of')+' '+n+' '+t('done')+'</span>';
  if(c.progress)h+='<span><b>'+c.progress+'</b> '+t('running')+'</span>';
  if(c.queued)h+='<span><b>'+c.queued+'</b> '+t('queued')+'</span>';
  if(c.failed)h+='<span style="color:var(--red)"><b>'+c.failed+'</b> '+t('failed')+'</span>';
  h+='</div></div>';
  [['progress','running'],['queued','queued'],['failed','failed']].forEach(function(g){
    var rows=xs.filter(function(x){return x.k===g[0]});if(!rows.length)return;
    h+='<div class="card"><h2>'+t(g[1])+' ('+rows.length+')</h2><table>'+rows.map(function(x){return epRow(x,true)}).join('')+'</table></div>';
  });
  if(rq.length)h+='<div class="card"><h2>'+t('reqd')+' ('+rq.length+')</h2><table>'+rq.map(function(s){return '<tr><td class="n">'+s.code+'</td><td>'+esc(nm(s))+'</td><td class="acts">'+btn(t('unreq'),{action:'unrequest',section:s.code},'dng')+'</td></tr>'}).join('')+'</table></div>';
  return h;
}
function readyHtml(){
  var latest={};S.jobs.forEach(function(j){var k=j.seriesId+'/'+j.number;if(!latest[k]||latest[k].version<j.version)latest[k]=j});
  var code={};if(G)G.sections.forEach(function(s){if(s.series)code[s.series]=s.code});
  var list=Object.keys(latest).map(function(k){return latest[k]}).filter(function(j){return j.status==='Completed'&&j.outputPath});
  list.sort(function(a,b){var ca=code[a.seriesId]||'S99',cb=code[b.seriesId]||'S99';return ca<cb?-1:ca>cb?1:a.number-b.number});
  var rows='';list.forEach(function(j){
    var pl=S.planned[j.seriesId],d=pl&&pl.def,e=pl&&pl.episodes.filter(function(x){return x.number===j.number})[0];
    rows+='<tr><td class="n">'+(code[j.seriesId]?code[j.seriesId]+'E'+String(j.number).padStart(2,'0'):j.number)+'</td><td>'+esc(e?(e.title[lang]||e.title.ar):j.title)+'<div class="sub">'+esc(d?(d.title[lang]||d.title.ar):j.seriesId)+'</div></td><td class="sub">'+fmt(j.videoSec)+'</td><td class="acts"><button class="pri" data-play="'+esc(j.outputPath)+'">'+t('play169')+'</button> '+(j.reelPath?'<button class="pri" data-play="'+esc(j.reelPath)+'" data-v="1">'+t('playV')+'</button>':'')+'</td></tr>';
  });
  return rows?'<div class="card"><h2>'+t('ready')+'</h2><table>'+rows+'</table></div>':'';
}
function publishHtml(){
  if(!P)return '<div class="card">'+t('loading')+'</div>';
  var h='<div class="card"><h2>'+t('pubTitle')+'</h2><div class="sub">'+t('pubSub')+'</div><div class="sum" style="margin-top:10px"><span><b>'+P.items.length+'</b> '+t('pubPk')+'</span><span>'+(P.authorized?t('pubAuthOk'):(P.configured?t('pubAuthNo'):t('pubNoCfg')))+'</span>'+btn(t('pubPrep'),{action:'prepare-youtube'},'pri')+'</div></div>';
  h+='<div class="card"><table>';
  P.items.forEach(function(x,i){
    h+='<tr><td class="n">'+esc(x.code)+'</td><td>'+esc(x.title)+'<div class="sub">'+esc(x.playlist)+' · '+Math.floor(x.seconds/60)+':'+String(x.seconds%60).padStart(2,'0')+' · '+x.chapters+' '+t('pubCh')+(x.shorts?' · Shorts':'')+(x.thumbnail?'':' · '+t('pubNoThumb'))+'</div></td><td><span class="badge '+(x.uploaded?'b-Completed':'b-none')+'">'+(x.uploaded?t('pubDraft'):t('pubNot'))+'</span></td><td class="acts">'+(x.uploaded?'<a class="lnk" target="_blank" rel="noopener" href="'+esc(x.uploaded.url)+'">YouTube Studio</a> ':'')+'<button data-act="copy" data-i="'+i+'" data-f="title">'+t('pubCopyT')+'</button> <button data-act="copy" data-i="'+i+'" data-f="description">'+t('pubCopyD')+'</button></td></tr>';
  });
  return h+'</table></div>';
}
function passFilter(k){return !fstat||fstat===k||(fstat==='notready'&&k!=='ready')}
function guideHtml(){
  var a=adm();
  var h='<h2 class="gh">'+t('guide')+'</h2><div class="sub">'+t('guideSub').replace('{n}',G.total).replace('{s}',G.sections.length)+'</div>';
  var opts=[['','fAll'],['ready','fReady']].concat(a?[['progress','fProg'],['queued','fQueued'],['failed','fFailed'],['planned','fPlanned']]:[['notready','fSoon']]);
  h+='<div class="tools"><input id="q" placeholder="'+esc(t('search'))+'" value="'+esc(query)+'"><select id="fstat">'+opts.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===fstat?' selected':'')+'>'+t(o[1])+'</option>'}).join('')+'</select><select id="gby"><option value="sec"'+(gby==='sec'?' selected':'')+'>'+t('gSec')+'</option><option value="st"'+(gby==='st'?' selected':'')+'>'+t('gSt')+'</option></select></div>';
  h+='<div class="legend">'+['A','B','C','D'].map(function(k){return '<span class="tag t'+k+'">'+k+'</span> '+t('tag'+k)}).join('  ')+'</div>';
  var q=query.toLowerCase();
  var epOk=function(s,e){return passFilter(stKey(e))&&(!q||(s.code+' '+s.title+' '+(ENN[s.code]||'')+' '+e.code+' '+e.title).toLowerCase().indexOf(q)>=0)};
  if(gby==='st'){
    var groups=a?[['ready','gReady'],['progress','gProg'],['queued','gQueued'],['failed','gFailed'],['planned','gPlanned']]:[['ready','gReady'],['planned','gSoon']],shown=0;
    groups.forEach(function(g){
      var rows=allEps().filter(function(x){return x.s.batch===1&&(g[0]==='planned'?x.k==='planned'||(!a&&x.k!=='ready'):x.k===g[0])&&epOk(x.s,x.e)});if(!rows.length)return;shown+=rows.length;
      h+='<div class="card"><h2>'+t(g[1])+' ('+rows.length+')</h2><table>'+rows.map(function(x){return epRow(x,true)}).join('')+'</table></div>';
    });
    return h+(shown?'':'<div class="card">'+t('noMatch')+'</div>');
  }
  var shown2=0;
  [1,2,3].forEach(function(b){
    var ss=G.sections.filter(function(s){return s.batch===b&&(s.episodes.length?s.episodes.some(function(e){return epOk(s,e)}):(!fstat&&(!q||(s.code+' '+s.title+' '+(ENN[s.code]||'')).toLowerCase().indexOf(q)>=0)))});if(!ss.length)return;shown2+=ss.length;
    h+='<div class="sub bt">'+t('batch'+b)+'</div>';
    ss.forEach(function(s){
      var n=s.episodes.length,dn=s.episodes.filter(function(e){return e.status==='Completed'}).length;
      var isOpen=openG[s.code]===undefined?!!(dn||(a&&s.series)||query||fstat):openG[s.code];
      h+='<details class="gsec" data-g="'+s.code+'"'+(isOpen?' open':'')+'><summary><b>'+s.code+'</b> '+esc(nm(s))+' <span class="mut">'+(n?(a||dn?dn+'/'+n+' ':n+' ')+t('eps'):t('tbd'))+'</span>'+(a&&s.requested?' <span class="badge b-req">'+t('reqOn')+'</span>':'')+'</summary>';
      if(a&&s.series){
        h+='<div class="bar mini"><i style="width:'+(n?Math.round(dn*100/n):0)+'%"></i></div>';
        if(dn<n)h+='<div style="margin-top:6px">'+btn(t('run'),{action:'run-series',series:s.series},'pri')+btn(t('runN'),{action:'run-series',series:s.series,limit:5})+'</div>';
      }else if(a&&!s.series){
        h+='<div style="margin-top:8px">'+(s.requested?btn(t('unreq'),{action:'unrequest',section:s.code},'dng'):btn(t('reqBtn'),{action:'request',section:s.code},'pri ghost'))+'<span class="sub"> '+(s.requested?'':t('reqHint'))+'</span></div>';
      }
      if(n){h+='<table>';s.episodes.filter(function(e){return epOk(s,e)}).forEach(function(e){h+=epRow({s:s,e:e,k:stKey(e)},false)});h+='</table>'}
      h+='</details>';
    });
  });
  return h+(shown2?'':'<div class="card">'+t('noMatch')+'</div>');
}
function render(){
  document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
  document.getElementById('ttl').textContent=t('title');document.getElementById('langbtn').textContent=t('lang');
  document.getElementById('dictlnk').textContent=t('dict');document.getElementById('workbtn').textContent=t('work');
  document.getElementById('ltitle').textContent=t('admIn');document.getElementById('luser').placeholder=t('lUser');document.getElementById('lpass').placeholder=t('lPass');document.getElementById('lgo').textContent=t('lGo');
  if(!S||!G){document.getElementById('app').textContent=t('loading');return}
  var a=adm(),local=['localhost','127.0.0.1','[::1]'].indexOf(location.hostname)>=0;
  if(!a&&view!=='guide')view='guide';
  var ab=document.getElementById('admbtn');ab.style.display=local?'none':'';ab.textContent=a?t('admOut'):t('admIn');
  ['pausebtn','workbtn','qpill','wpill'].forEach(function(id){document.getElementById(id).style.display=a?'':'none'});
  var q=document.getElementById('qpill');q.textContent=S.paused?t('qOff'):t('qOn');q.className='pill '+(S.paused?'warn':'ok');
  var w=document.getElementById('wpill');w.textContent=S.workerAlive?t('wOn'):t('wOff');w.className='pill '+(S.workerAlive?'ok':'');
  document.getElementById('pausebtn').textContent=S.paused?t('resume'):t('pause');
  var typing=document.activeElement&&document.activeElement.id==='q';
  var st=window.scrollY;
  var tabs=a?'<div class="tabs"><button class="'+(view==='guide'?'on':'')+'" data-act="view" data-view="guide">'+t('tGuide')+'</button><button class="'+(view==='progress'?'on':'')+'" data-act="view" data-view="progress">'+t('tProg')+'</button><button class="'+(view==='publish'?'on':'')+'" data-act="view" data-view="publish">'+t('tPub')+'</button></div>':'';
  document.getElementById('app').innerHTML=tabs+(view==='progress'?progressHtml():view==='publish'?publishHtml():readyHtml()+guideHtml());
  var qi=document.getElementById('q');if(typing&&qi){qi.focus();qi.setSelectionRange(qi.value.length,qi.value.length)}
  window.scrollTo(0,st);
}
document.addEventListener('input',function(e){if(e.target.id==='q'){query=e.target.value.trim();render()}});
document.addEventListener('change',function(e){if(e.target.id==='fstat'){fstat=e.target.value;render()}if(e.target.id==='gby'){gby=e.target.value;try{localStorage.setItem('gby',gby)}catch(x){}render()}});
document.addEventListener('toggle',function(e){var g=e.target&&e.target.getAttribute&&e.target.getAttribute('data-g');if(g)openG[g]=e.target.open},true);
document.addEventListener('click',function(e){
  var c=e.target.closest('[data-c]');if(c){cmd(JSON.parse(c.getAttribute('data-c')));return}
  var p=e.target.closest('[data-play]');if(p){var v=document.getElementById('vid');v.className=p.getAttribute('data-v')?'vert':'';v.src='/media/'+p.getAttribute('data-play');document.getElementById('vmodal').classList.add('on');v.play();return}
  var a=e.target.closest('[data-act]');if(!a)return;var act=a.getAttribute('data-act');
  if(act==='view'){view=a.getAttribute('data-view');if(view==='publish')loadPub();render()}
  if(act==='copy'){var it=P&&P.items[Number(a.getAttribute('data-i'))];if(it){var txt=it[a.getAttribute('data-f')];(navigator.clipboard?navigator.clipboard.writeText(txt):Promise.reject()).then(function(){toast(t('pubCopied'))}).catch(function(){toast(t('fail'))})}}
  if(act==='lang'){lang=lang==='ar'?'en':'ar';try{localStorage.setItem('lang',lang)}catch(x){}render()}
  if(act==='pause')cmd({action:S&&S.paused?'resume-all':'pause-all'});
  if(act==='adm'){if(adm()){fetch('/api/logout',{method:'POST',headers:{'x-tutorial':'1'}}).then(load)}else{document.getElementById('lerr').textContent='';document.getElementById('lmodal').classList.add('on');document.getElementById('luser').focus()}}
  if(act==='close'&&e.target.id==='vmodal'){var v2=document.getElementById('vid');v2.pause();v2.removeAttribute('src');document.getElementById('vmodal').classList.remove('on')}
  if(act==='lclose'&&e.target.id==='lmodal')document.getElementById('lmodal').classList.remove('on');
});
document.getElementById('lform').addEventListener('submit',function(e){
  e.preventDefault();
  fetch('/api/login',{method:'POST',headers:{'content-type':'application/json','x-tutorial':'1'},body:JSON.stringify({user:document.getElementById('luser').value,password:document.getElementById('lpass').value})})
    .then(function(r){return r.json().then(function(j){return {s:r.status,j:j}})})
    .then(function(o){if(o.j.ok){document.getElementById('lmodal').classList.remove('on');document.getElementById('lpass').value='';load()}else document.getElementById('lerr').textContent=o.s===429?t('lLock'):t('lBad')})
    .catch(function(){document.getElementById('lerr').textContent=t('fail')});
});
function loadPub(){if(!adm())return;fetch('/api/publish').then(function(r){return r.json()}).then(function(j){var k=JSON.stringify(j);P=j;if(k!==lastPub){lastPub=k;if(view==='publish')render()}}).catch(function(){})}
var lastPub='';
function load(){if(busy)return;busy=true;if(adm()&&view==='publish')loadPub();
  Promise.all([fetch('/api/state').then(function(r){return r.json()}),fetch('/api/guide').then(function(r){return r.json()})])
    .then(function(a){S=a[0];G=a[1];var k=JSON.stringify(a);if(k!==lastKey){lastKey=k;render()}}).catch(function(){}).then(function(){busy=false})}
var lastKey='';
render();load();setInterval(load,2500);
</script></body></html>`;
