#!/usr/bin/env node
/** WCAG AA contrast audit for the v3 token pairs (light + dark).
 *  Run after any token change: node scripts/contrast-audit.mjs
 *  Exits non-zero when any checked pair falls below 4.5:1. */
const themes = {
  light: { bg:'#FAFAFA', surface:'#FFFFFF', surface2:'#F5F5F5', fg:'#171717', fg2:'#5C5C5C', fg3:'#6B6B6B',
    accent:'#1F7A68', accentSoft:'rgba(31,122,104,.09)', pos:'#1A7F4B', posSoft:'rgba(26,127,75,.10)', warn:'#A86A12',
    warnSoft:'rgba(168,106,18,.12)', primaryBg:'#171717', primaryFg:'#FFFFFF' },
  dark: { bg:'#0A0A0A', surface:'#111111', surface2:'#171717', fg:'#EDEDED', fg2:'#A1A1A1', fg3:'#8A8A8A',
    accent:'#3DBA9C', accentSoft:'rgba(61,186,156,.12)', pos:'#3DC07A', posSoft:'rgba(61,192,122,.13)', warn:'#E0A63A',
    warnSoft:'rgba(224,166,58,.14)', primaryBg:'#EDEDED', primaryFg:'#0A0A0A' },
};
function lum(hex){let c=hex.replace('#','');const rgb=[0,2,4].map(i=>parseInt(c.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];}
function ratio(fg,bg){const a=lum(fg),b=lum(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
function blend(fgRGBA,bg){const m=fgRGBA.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);if(!m)return fgRGBA;
  const bgc=bg.replace('#','');const base=[0,2,4].map(i=>parseInt(bgc.slice(i,i+2),16));const a=parseFloat(m[4]??1);
  return '#'+[0,1,2].map(i=>Math.round(parseFloat(m[i+1])*a+base[i]*(1-a)).toString(16).padStart(2,'0')).join('');}
let fails=0;
for(const [name,t] of Object.entries(themes)){
  const checks=[
    ['fg on bg',t.fg,t.bg],
    ['fg2 on surface (labels, summaries)',t.fg2,t.surface],
    ['fg2 on surface2 (dense panels)',t.fg2,t.surface2],
    ['fg3 on bg (rank indexes)',t.fg3,t.bg],
    ['fg3 on surface2 (pagination)',t.fg3,t.surface2],
    ['accent on surface (links, tabs)',t.accent,t.surface],
    ['accent on accent-soft (chips, pressed tabs)',t.accent,blend(t.accentSoft,t.surface)],
    ['accent on bg (skip link)',t.accent,t.bg],
    ['pos on surface2 (status-good)',t.pos,t.surface2],
    ['fg2 on pos-soft over surface (live cards)',t.fg2,blend(t.posSoft,t.surface)],
    ['fg on warn-soft over surface (returning tag)',t.fg,blend(t.warnSoft,t.surface)],
    ['primary button text',t.primaryFg,t.primaryBg],
    ['baize-tip text',t.bg,t.fg],
  ];
  console.log('==',name);
  for(const [label,fg,bg] of checks){const r=ratio(fg,bg);const ok=r>=4.5;if(!ok)fails++;console.log((ok?'PASS':'FAIL')+' '+r.toFixed(2)+'  '+label);}
}
process.exitCode=fails?1:0;
