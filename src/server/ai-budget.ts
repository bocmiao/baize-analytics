import type {PoolClient} from 'pg';
import {ExternalError} from './external-errors.js';
/** All functions use the caller's site-gated transaction and never borrow a pool. */
export async function expireAiReservations(client:PoolClient,siteId:string,at=new Date()){
 const rows=(await client.query("UPDATE ai_reservations SET status='expired',settled_tokens=amount,settled_at=$2 WHERE site_id=$1 AND status='active' AND expires_at<=$2 RETURNING month,amount",[siteId,at])).rows;
 const months=new Map<string,bigint>();for(const row of rows){const month=new Date(row.month).toISOString().slice(0,10);months.set(month,(months.get(month)??0n)+BigInt(row.amount));}
 for(const [month,amount]of [...months].sort(([a],[b])=>a.localeCompare(b))){const updated=await client.query('UPDATE ai_budget SET reserved=reserved-$3,used=used+$3 WHERE site_id=$1 AND month=$2 AND reserved>=$3 RETURNING site_id',[siteId,month,amount.toString()]);if(!updated.rowCount)throw Error('AI_RESERVATION_LEDGER_INCONSISTENT');}
 await client.query("UPDATE ai_calls SET status='failed',answer='' WHERE site_id=$1 AND status='reserved' AND id IN(SELECT call_id FROM ai_reservations WHERE site_id=$1 AND status='expired')",[siteId]);
 return {expired:rows.length,policy:'conservative-reserved-upper-bound' as const};
}
export async function reserveAiBudget(client:PoolClient,input:{siteId:string;callId:string;month:string;amount:number;budget:number;at?:Date}){
 const at=input.at??new Date();if(!Number.isSafeInteger(input.amount)||input.amount<=0||!Number.isSafeInteger(input.budget)||input.budget<0)throw new ExternalError('external_config_invalid');
 await expireAiReservations(client,input.siteId,at);
 await client.query('INSERT INTO ai_budget(site_id,month) VALUES($1,$2) ON CONFLICT DO NOTHING',[input.siteId,input.month]);
 const budget=(await client.query('SELECT used,reserved FROM ai_budget WHERE site_id=$1 AND month=$2 FOR UPDATE',[input.siteId,input.month])).rows[0];
 if(BigInt(budget.used)+BigInt(budget.reserved)+BigInt(input.amount)>BigInt(input.budget))throw new ExternalError('ai_budget_exceeded');
 await client.query('UPDATE ai_budget SET reserved=reserved+$3 WHERE site_id=$1 AND month=$2',[input.siteId,input.month,input.amount]);
 await client.query("INSERT INTO ai_reservations(call_id,site_id,month,amount,expires_at) VALUES($1,$2,$3,$4,$5)",[input.callId,input.siteId,input.month,input.amount,new Date(at.getTime()+15*60000)]);
}
export async function settleAiReservation(client:PoolClient,siteId:string,callId:string,tokens:number,at=new Date()){
 if(!Number.isSafeInteger(tokens)||tokens<0)throw new ExternalError('external_response_invalid');
 await expireAiReservations(client,siteId,at);
 const settled=(await client.query("UPDATE ai_reservations SET status='settled',settled_tokens=$3,settled_at=$4 WHERE call_id=$1 AND site_id=$2 AND status='active' AND amount>=$3 RETURNING month,amount",[callId,siteId,tokens,at])).rows[0];
 if(!settled)return {settled:false};
 const updated=await client.query('UPDATE ai_budget SET reserved=reserved-$3,used=used+$4 WHERE site_id=$1 AND month=$2 AND reserved>=$3 RETURNING site_id',[siteId,settled.month,settled.amount,tokens]);if(!updated.rowCount)throw Error('AI_RESERVATION_LEDGER_INCONSISTENT');
 return {settled:true};
}
