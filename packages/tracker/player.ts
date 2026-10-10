import {Replayer} from 'rrweb';
import {redactReplay} from './src/replay-privacy';
type ReplayEvent=ConstructorParameters<typeof Replayer>[0][number];
export interface ReplayChunk {session_id:string;seq:number;payload:unknown[]}
/** Keep sequences within one page instance, never interleave different visitors. */
export function replaySessions(chunks:ReplayChunk[]){const sessions=new Map<string,ReplayChunk[]>();for(const chunk of chunks){const list=sessions.get(chunk.session_id)??[];list.push(chunk);sessions.set(chunk.session_id,list);}return [...sessions].map(([id,rows])=>({id,events:rows.sort((a,b)=>a.seq-b.seq).flatMap(row=>row.payload)}));}
export function createReplayPlayer(container:HTMLElement,events:unknown[]){
 const clean=events.map(e=>redactReplay(e)).filter((e):e is Record<string,unknown>=>Boolean(e)&&typeof e==='object'&&typeof (e as Record<string,unknown>).timestamp==='number'&&typeof (e as Record<string,unknown>).type==='number').sort((a,b)=>Number(a.timestamp)-Number(b.timestamp));
 const wrapper=document.createElement('section'),controls=document.createElement('div'),view=document.createElement('div'),note=document.createElement('p');note.textContent='隐私结构回放：文本和输入已遮罩，图片及外链样式不会还原。';wrapper.append(note,controls,view);container.append(wrapper);
 if(clean.length<2||!clean.some(e=>e.type===2)){const empty=document.createElement('p');empty.textContent='回放缺少完整快照，无法播放。';view.append(empty);return {play(){},pause(){},seek(_offset:number){},destroy(){wrapper.remove();}};}
 const player=new Replayer(clean as ReplayEvent[],{root:view,showWarning:false,showDebug:false,UNSAFE_replayCanvas:false,mouseTail:false,insertStyleRules:['* { pointer-events: none !important; }']});
 // rrweb uses a same-origin sandbox for DOM reconstruction, but never enables scripts.
 for(const frame of view.querySelectorAll('iframe')){frame.setAttribute('sandbox','allow-same-origin');frame.setAttribute('aria-label','已脱敏会话回放');}
 const play=document.createElement('button'),pause=document.createElement('button'),range=document.createElement('input'),speed=document.createElement('select'),time=document.createElement('output');play.textContent='播放';pause.textContent='暂停';range.type='range';range.min='0';range.max=String(player.getMetaData().totalTime);range.value='0';range.setAttribute('aria-label','播放位置');speed.setAttribute('aria-label','播放速度');for(const rate of [0.5,1,2,4]){const option=document.createElement('option');option.value=String(rate);option.textContent=rate+' 倍';option.selected=rate===1;speed.append(option);}controls.append(play,pause,range,speed,time);
 let playing=false;play.onclick=()=>{playing=true;player.play(Number(range.value));};pause.onclick=()=>{playing=false;player.pause();};range.oninput=()=>{player.pause(Number(range.value));if(playing)player.play(Number(range.value));};speed.onchange=()=>player.setConfig({speed:Number(speed.value)});
 const interval=setInterval(()=>{const current=Math.min(player.getCurrentTime(),Number(range.max));range.value=String(current);time.textContent=`${(current/1000).toFixed(1)} / ${(Number(range.max)/1000).toFixed(1)} 秒`;},200);
 return {play(){play.click();},pause(){pause.click();},seek(offset:number){range.value=String(Math.max(0,Math.min(Number(range.max),offset)));range.dispatchEvent(new Event('input'));},destroy(){clearInterval(interval);player.destroy();wrapper.remove();}};
}
