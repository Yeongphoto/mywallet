import { dateInTimeZone, dueRecurringTransactions } from './recurring-schedule.ts';
import type { RecurringRule, Transaction } from '../../src/types.ts';

export async function generateRecurring(db:D1Database, timeZone:unknown) {
  if(typeof timeZone!=='string'||timeZone.length>100) return Response.json({error:'INVALID_TIME_ZONE'},{status:400});
  let today:string;try{today=dateInTimeZone(timeZone);}catch{return Response.json({error:'INVALID_TIME_ZONE'},{status:400});}
  const rules=(await db.prepare('SELECT id,type,day,amount,title,category,asset_id AS assetId,to_asset_id AS toAssetId,startMonth,endMonth,transaction_time AS time FROM recurring_rules ORDER BY startMonth,id').all<RecurringRule>()).results;
  const existing=(await db.prepare("SELECT id,date,recurring_rule_id AS recurringRuleId FROM transactions WHERE recurring_rule_id IS NOT NULL OR id LIKE 'rec_%'").all<Pick<Transaction,'id'|'date'|'recurringRuleId'>>()).results;
  const deleted=(await db.prepare('SELECT id FROM deleted_recurring_txs').all<{id:string}>()).results.map(r=>r.id);
  const due=dueRecurringTransactions(rules,existing,deleted,today);
  if(!due.length)return Response.json({success:true,generated:0,transactions:[],more:false});
  const marker=`recurring-generate:${crypto.randomUUID()}`,now=Date.now();
  const payload="json_object('id',id,'type',type,'date',date,'amount',amount,'title',title,'category',category,'recurringRuleId',recurring_rule_id,'assetId',asset_id,'toAssetId',to_asset_id,'time',transaction_time,'createdAt',created_at,'revision',revision,'cardSettlementId',card_settlement_id)";
  const result=await db.batch([
    ...due.map(tx=>db.prepare(`INSERT INTO transactions(id,type,date,amount,title,category,recurring_rule_id,asset_id,to_asset_id,created_at,transaction_time,revision,last_operation_id)
      SELECT ?,r.type,?,r.amount,r.title,r.category,r.id,r.asset_id,r.to_asset_id,?,r.transaction_time,1,? FROM recurring_rules r
      WHERE r.id=? AND r.day=? AND r.amount>0 AND r.type IN ('income','expense','transfer') AND r.startMonth<=? AND (r.endMonth IS NULL OR r.endMonth>=?)
      AND NOT EXISTS(SELECT 1 FROM transactions WHERE id=? OR recurring_rule_id=r.id AND substr(date,1,7)=?)
      AND NOT EXISTS(SELECT 1 FROM deleted_recurring_txs WHERE id=?)`)
      .bind(tx.id,tx.date,now,marker,tx.recurringRuleId,rules.find(r=>r.id===tx.recurringRuleId)!.day,tx.date.slice(0,7),tx.date.slice(0,7),tx.id,tx.date.slice(0,7),tx.id)),
    db.prepare(`INSERT INTO sync_changes(entity_type,entity_id,change_type,revision,payload_json,created_at)
      SELECT 'transaction',id,'upsert',revision,${payload},? FROM transactions WHERE last_operation_id=?`).bind(now,marker),
    db.prepare("INSERT INTO settings(key,value) SELECT 'updatedAt',? WHERE EXISTS(SELECT 1 FROM transactions WHERE last_operation_id=?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(now),marker),
  ]);
  const rows=(await db.prepare(`SELECT ${payload} AS payload FROM transactions WHERE id IN (${due.map(()=>'?').join(',')}) AND deleted_at IS NULL`).bind(...due.map(t=>t.id)).all<{payload:string}>()).results;
  return Response.json({success:true,generated:result.slice(0,due.length).reduce((n,r)=>n+r.meta.changes,0),transactions:rows.map(r=>JSON.parse(r.payload)),more:due.length===40});
}
