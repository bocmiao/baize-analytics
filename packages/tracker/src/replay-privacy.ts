const tags=new Set('html head body title meta link style div span p a img input textarea button form label select option ul ol li h1 h2 h3 h4 h5 h6 table tbody tr th td section article nav main header footer script noscript iframe canvas video audio svg path circle rect g br hr strong em small pre code #document'.split(' '));
/** Layout structure only: strip URL/attribute metadata and arbitrary text strings. */
export function redactReplay(value:unknown,key=''):unknown {
 if(typeof value==='string'){
  if(['textContent','text','value'].includes(key))return '*'.repeat(Math.min(value.length,512));
  if(key==='name')return value.toLowerCase()==='html'?'html':'';
  if(key==='tagName')return tags.has(value.toLowerCase())?value.toLowerCase():'div';
  if(key==='compatMode')return value==='BackCompat'?'BackCompat':'CSS1Compat';
  return '';
 }
 if(Array.isArray(value))return value.map(v=>redactReplay(v,key));
 if(!value||typeof value!=='object')return value;
 const out:Record<string,unknown>={};
 for(const [field,item] of Object.entries(value)){
  if(['cookie','authorization','password','url','href','src','cssText','style'].map(k=>k.toLowerCase()).includes(field.toLowerCase()))continue;
  if(field==='attributes'){out.attributes={};continue;}
  out[field]=redactReplay(item,field);
 }
 return out;
}
