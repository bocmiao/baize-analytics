import type {FastifyInstance} from 'fastify';
import {resolve} from 'node:path';
// Serve fixed distribution artifacts only; never expose repository license paths.
export function registerTrackerAssets(app:FastifyInstance){
 app.get('/tracker.LICENSE.txt',async(_req,reply)=>reply.type('text/plain; charset=utf-8').sendFile('tracker.LICENSE.txt',resolve('public')));
 for(const name of ['tracker','tracker-min','tracker-vitals','tracker-replay','tracker-heatmap','tracker-consent']){
  app.get(`/${name}.js`,async(req,reply)=>{
   const gzip=(req.headers['accept-encoding']??'').split(',').some(part=>{
    const [encoding,...parameters]=part.trim().split(';');
    if(encoding.toLowerCase()!=='gzip')return false;
    const quality=parameters.map(p=>p.trim()).find(p=>/^q=/i.test(p));
    return quality===undefined||Number(quality.slice(2))>0;
   });
   reply.header('Access-Control-Allow-Origin','*').header('Vary','Accept-Encoding').type('application/javascript');
   if(gzip)reply.header('Content-Encoding','gzip');
   return reply.sendFile(`${name}.js${gzip?'.gz':''}`,resolve('public'));
  });
 }
}
