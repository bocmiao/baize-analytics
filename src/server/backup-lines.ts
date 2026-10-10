import {createReadStream} from 'node:fs';
import {StringDecoder} from 'node:string_decoder';
/** Reject oversized/truncated lines before a parser can allocate an unbounded JSON value. */
export async function* boundedBackupLines(path:string,maxBytes=65536):AsyncGenerator<string>{
 const decoder=new StringDecoder('utf8');let pending='';for await(const chunk of createReadStream(path,{highWaterMark:65536})){pending+=decoder.write(chunk as Buffer);let end:number;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);if(Buffer.byteLength(line)>maxBytes)throw Error('BACKUP_ROW_LIMIT');yield line;pending=pending.slice(end+1);}if(Buffer.byteLength(pending)>maxBytes)throw Error('BACKUP_ROW_LIMIT');}pending+=decoder.end();if(pending)throw Error('BACKUP_DATA_TRUNCATED');
}
