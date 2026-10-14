'use strict';
// PWA/web entry only: never replay on internal navigation or change account state.
(()=>{
 const splash=document.getElementById('ac-splash');if(!splash)return;
 const logo=splash.querySelector('img');
 const showFallback=()=>{if(logo)logo.hidden=true;splash.classList.add('logo-unavailable')};
 if(logo){logo.addEventListener('error',showFallback,{once:true});if(logo.complete&&!logo.naturalWidth)showFallback()}
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 // Reveal the app even when API calls are slow or fail; app.js handles its own loading/error state.
 window.setTimeout(()=>{
  splash.classList.add('is-closing');
  window.setTimeout(()=>splash.remove(),reduced?0:280);
 },reduced?0:2000);
})();
