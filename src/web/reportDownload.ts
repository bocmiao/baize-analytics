import {apiErrorMessage} from './errorMessages';
export async function downloadReport(url:string,filename:string){
 const response=await fetch(url,{credentials:'same-origin'});
 if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(response.status===413?'结果超过下载上限，请缩小日期或筛选范围。':response.status===409?'所选期间明细不完整，请缩小日期范围。':apiErrorMessage(body,response.status));}
 if(!response.headers.get('content-type')?.includes('text/csv'))throw Error('下载响应格式不正确，请重新尝试。');
 const blob=await response.blob(),link=document.createElement('a'),objectUrl=URL.createObjectURL(blob);link.href=objectUrl;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}
