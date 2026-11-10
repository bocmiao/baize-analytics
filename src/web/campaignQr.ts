import QRCode from 'qrcode';

/** Entirely local QR generation; neither target URL nor campaign parameters leave this browser. */
export function campaignQr(text:string){
 const code=QRCode.create(text,{errorCorrectionLevel:'M'}),size=code.modules.size,margin=4;
 let path='';
 for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(code.modules.get(y,x))path+=`M${x+margin} ${y+margin}h1v1h-1z`;
 const width=size+margin*2,svg=`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 ${width} ${width}" shape-rendering="crispEdges"><rect width="${width}" height="${width}" fill="#fff"/><path d="${path}" fill="#111"/></svg>`;
 return {svg,size:width,modules:code.modules};
}
