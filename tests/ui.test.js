'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('frontend renders push controls, numeric view dashboard and protected result-opening buttons',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../static/app.js'),'utf8').split("document.addEventListener('click'")[0];
 const context={console,URLSearchParams,Date,Number,String,Math,Notification:{permission:'granted'},setTimeout(){},setInterval(){},clearTimeout(){},window:{isSecureContext:true,Notification:{permission:'granted'},matchMedia:()=>({matches:true}),addEventListener(){},PushManager:function(){}},navigator:{userAgent:'Android',platform:'Linux',serviceWorker:{addEventListener(){}}},document:{querySelector:()=>null,querySelectorAll:()=>[]},location:{hash:''}};
 vm.createContext(context);vm.runInContext(source,context);
 vm.runInContext(`state.me={id:2,name:'Étudiante',level:'Licence 2',permissions:[],roles:[{name:'etudiant'}]};state.data.pushStatus={configured:true,enabled:true,devices:1,categories:{publications:true,results:true,other:true}};state.deviceSubscribed=true;state.unread=3;state.data.notifications={items:[{id:41,title:'Information',body:'À consulter',created_at:'2026-10-14T10:00:00Z',read_at:null,link:'communications',entity_type:'announcement'}]};state.data.results={items:[{id:12,course_title:'Cours de linguistique',code:'L2',year_label:'2026',semester:1,status:'published'}]};state.data.tracking={total:1,items:[{type:'announcement',id:9,title:'Convocation',status:'published',total:4,viewed:3,percent:75,total_opens:5,published_at:'2026-10-14T10:00:00Z',last_viewed_at:'2026-10-14T11:00:00Z'}]}`,context);
 const notifications=vm.runInContext('notificationsPage()',context);assert.match(notifications,/Activer|Désactiver les alertes/);assert.match(notifications,/3 notification\(s\) non lue\(s\)/);assert.match(notifications,/data-action="open-notification"/);
 const results=vm.runInContext('resultsPage()',context);assert.match(results,/Voir ma note/);assert.doesNotMatch(results,/NaN/);
 const tracking=vm.runInContext('trackingPage()',context);assert.match(tracking,/3\/4 personnes · 75%/);assert.match(tracking,/3 vues · voir les noms/);
});
test('public sign-in does not display chief login, registration is absent from chief-only page',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../static/app.js'),'utf8').split("document.addEventListener('click'")[0];
 function render(pathname){const app={innerHTML:''},context={console,URLSearchParams,Date,Number,String,Math,Notification:{permission:'default'},setTimeout(){},setInterval(){},clearTimeout(){},window:{isSecureContext:true,Notification:{permission:'default'},matchMedia:()=>({matches:false}),addEventListener(){}},navigator:{userAgent:'Mozilla',platform:'Linux'},document:{querySelector:x=>x==='#app'?app:null,querySelectorAll:()=>[]},location:{pathname,hash:''}};vm.createContext(context);vm.runInContext(source,context);vm.runInContext("state.meta={demo:true,name:'American Corner'};renderAuth()",context);return app.innerHTML}
 const publicPage=render('/');assert.match(publicPage,/Inscription/);assert.doesNotMatch(publicPage,/Connexion du chef|Chef :|admin@american-corner\.test|\/chef/);
 const reservedPage=render('/chef');assert.match(reservedPage,/Connexion du chef/);assert.doesNotMatch(reservedPage,/Inscription|auth-register/);
});
test('public and private entrances have canonical URLs on the same custom domain',()=>{
 const root=path.join(__dirname,'..');
 const publicHtml=fs.readFileSync(path.join(root,'static/index.html'),'utf8');
 const chiefHtml=fs.readFileSync(path.join(root,'static/chef.html'),'utf8');
 const render=fs.readFileSync(path.join(root,'render.yaml'),'utf8');
 assert.match(publicHtml,/rel="canonical" href="https:\/\/amer-corner\.oymiketech\.com\/"/);
 assert.match(chiefHtml,/rel="canonical" href="https:\/\/amer-corner\.oymiketech\.com\/chef"/);
 assert.match(render,/AC_BASE_URL\s*\n\s*value:\s*https:\/\/amer-corner\.oymiketech\.com/);
 assert.doesNotMatch(publicHtml,/href="[^"]*\/chef"/);
});
test('control, maintenance, private messages, video and font-size screens render for intended accounts',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../static/app.js'),'utf8').split("document.addEventListener('click'")[0];let fontValue=0;
 const context={console,URLSearchParams,Date,Number,String,Math,Notification:{permission:'default'},setTimeout(){},setInterval(){},clearTimeout(){},window:{isSecureContext:true,Notification:{permission:'default'},matchMedia:()=>({matches:false}),addEventListener(){}},navigator:{userAgent:'Mozilla',platform:'Linux'},document:{documentElement:{style:{setProperty:(k,v)=>fontValue=Number(v)}},querySelector:()=>null,querySelectorAll:()=>[]},location:{pathname:'/chef',hash:''}};
 vm.createContext(context);vm.runInContext(source,context);
 vm.runInContext(`state.me={id:1,name:'Chef',permissions:['settings.manage','roles.manage'],roles:[{name:'chef'}]};state.meta={levels:[{name:'Licence 2'}],years:[]};state.data.display={font_px:20,policy:{min:14,max:24,recommended:18},chosen_font_px:20};state.data.controls={policy:{font_default:16,font_min:14,font_max:24,font_recommended:16,message_limits:{chef:5,enseignant:5,etudiant:5,other:5},message_disabled:[],video_limits:{chef:2,enseignant:2},video_disabled:[],video_max_bytes:10485760,document_max_bytes:10485760,temp_retention_days:7,auto_temp_hours:0},message_usage:[],video_usage:[]};state.data.users={items:[]};state.data.maintenance={sqlite_integrity:'ok',issues:[],metrics:{storage_free_bytes:99999}};state.data['technical-alerts']={items:[{id:1,severity:'critical',title:'Test',status:'new',created_at:'2026-10-14T00:00:00Z',impact:'Impact',recommendation:'Conseil'}]};state.data.messages={items:[],used:0,limit:5,remaining:5,recipients:[]};state.data.videos={items:[],used:0,limit:2,max_bytes:10485760};state.data.courses={items:[]};applyTextSize(20)`,context);
 assert.equal(fontValue,1.25);
 assert.match(vm.runInContext('displaySection()',context),/Taille du texte/);
 assert.match(vm.runInContext('messagesPage()',context),/5 restant/);
 assert.match(vm.runInContext('videosPage()',context),/sur 2 utilisée/);
 assert.match(vm.runInContext('maintenancePage()',context),/Analyse et maintenance/);
 assert.match(vm.runInContext('controlsPage()',context),/Paramètres généraux et contrôle/);
 assert.equal(vm.runInContext("visibleNav(nav.find(x=>x[0]==='controls'))",context),true);
 vm.runInContext("state.me={id:2,permissions:[],roles:[{name:'etudiant'}]}",context);
 assert.equal(vm.runInContext("visibleNav(nav.find(x=>x[0]==='controls'))",context),false);
});
