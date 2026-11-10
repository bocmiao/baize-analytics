// Run before first paint; keep the preference order in src/web/theme.ts.
(()=>{
 let theme=new URLSearchParams(location.search).get('theme');
 if(theme!=='dark'&&theme!=='light'){
  try{theme=localStorage.getItem('baize-theme');}catch{theme=null;}
 }
 if(theme!=='dark'&&theme!=='light')theme='light';
 document.documentElement.dataset.theme=theme;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#0f1725':'#f5f7fb');
})();
