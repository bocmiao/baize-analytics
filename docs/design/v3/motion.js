// 数字滚动（450ms ease-out，150ms 延迟）；尊重 reduced motion
(function(){const rm=matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('.kpi .v, [data-tick]').forEach(el=>{const n0=el.firstChild;if(!n0||n0.nodeType!==3)return;const t=n0.textContent;const m=t.match(/^[\d,.]+/);if(!m||rm)return;const target=parseFloat(m[0].replace(/,/g,''));const dec=(m[0].split('.')[1]||'').length;const t0=performance.now()+150;
function f(n){const p=Math.min(1,Math.max(0,(n-t0)/450));const e=1-Math.pow(1-p,3);n0.textContent=t.replace(m[0],(target*e).toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec}));if(p<1)requestAnimationFrame(f)}requestAnimationFrame(f)});})();
