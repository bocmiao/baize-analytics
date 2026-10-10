/** ClickHouse can report execution errors after sending HTTP 200 headers.
 * Command endpoints have no result data: success requires bounded whitespace
 * followed by normal EOF. Never expose server response content in errors. */
export async function consumeClickHouseCommand(response:Response,errorCode:string,maxBytes=65536):Promise<void>{
 const reader=response.body?.getReader();if(!reader)return;
 let size=0;
 try{
  while(true){const chunk=await reader.read();if(chunk.done)return;size+=chunk.value.byteLength;
   if(size>maxBytes||chunk.value.some(byte=>![9,10,13,32].includes(byte)))throw Error(errorCode);
  }
 }catch{throw Error(errorCode);}finally{await reader.cancel().catch(()=>undefined);reader.releaseLock();}
}
