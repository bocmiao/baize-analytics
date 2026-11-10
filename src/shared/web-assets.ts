import type {FastifyInstance,FastifyReply} from 'fastify';
import {resolve} from 'node:path';

// Only build fingerprints are immutable. Stable names (licenses, public assets)
// must revalidate so a deployment never pins old content at the same URL.
export function fingerprintedWebAsset(file:string):boolean {
 return /^[A-Za-z0-9][A-Za-z0-9._-]*-[A-Za-z0-9_-]{8,}\.(?:js|css|woff2?|ttf|otf|svg|png|webp|avif|jpg|jpeg|gif|json)(?:\.(?:br|gz))?$/.test(file);
}

export function isWebAssetRequest(url:string):boolean {
 return url.startsWith('/assets/')||url.split('?',1)[0]==='/theme-init.js';
}

export function registerWebAssets(app:FastifyInstance,root=resolve('dist/web/assets'),publicRoot=resolve('public')){
 app.get('/theme-init.js',async(_req,reply)=>reply.header('Cache-Control','public, max-age=0, must-revalidate').header('Vary','Accept-Encoding').type('application/javascript').sendFile('theme-init.js',publicRoot));
 app.get('/assets/*',async(req,reply)=>{
  const file=(req.params as {'*':string})['*'];
  reply.header('Vary','Accept-Encoding');
  if(!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(file))return webAssetNotFound(reply);
  reply.header('Cache-Control',fingerprintedWebAsset(file)?'public, max-age=31536000, immutable':'public, max-age=0, must-revalidate');
  return reply.sendFile(file,root);
 });
}

export function webAssetNotFound(reply:FastifyReply){
 return reply.header('Cache-Control','no-store').type('application/json').code(404).send({error:'not_found'});
}

export function sendWebIndex(reply:FastifyReply,root=resolve('dist/web')){
 return reply.header('Cache-Control','no-store').header('Vary','Accept-Encoding').type('text/html').sendFile('index.html',root);
}
