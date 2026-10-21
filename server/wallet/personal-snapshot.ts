// Only validated, allowlisted columns reach SQL. Client ownership/ledger IDs and receipts are never trusted.
type Row = Record<string, any>;
type Group = {table:string;columns:string[];values:unknown[][]};
function requireValue(ok: unknown): asserts ok { if(!ok)throw Error('INVALID_LOCAL_SNAPSHOT'); }
const object=(v:unknown):v is Row=>!!v&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown,max=500)=>typeof v==='string'&&v.length>0&&v.length<=max&&!v.includes('\0');
const integer=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v);
const amount=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER;
const day=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const month=(v:unknown)=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const time=(v:unknown)=>v==null||typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
export function personalSnapshotRows(source: unknown): Group[] {
 requireValue(object(source));
 const arrays=['transactions','assets','plans','recurringRules','deletedRecurringTxs','cardSettlements','customExpenseCategories','customIncomeCategories','customAssetCategories'];
 for(const key of arrays)requireValue(Array.isArray(source[key])&&source[key].length<=20000);
 for(const key of ['transactions','assets','recurringRules','cardSettlements']){
  const rows=source[key];requireValue(rows.every((r:unknown)=>object(r)&&text(r.id,200))&&new Set(rows.map((r:Row)=>r.id)).size===rows.length);
 }
 const result:Group[]=[];
 const add=(table:string,columns:string[],values:unknown[][])=>{
  const composite=table==='custom_categories'||table==='plans';
  requireValue(new Set(values.map(row=>JSON.stringify(row.slice(0,composite?2:1)))).size===values.length);
  if(values.length)result.push({table,columns,values});
 };
 const assetIds=new Set(source.assets.map((r:Row)=>r.id));
 const ref=(v:unknown)=>v==null||text(v,200)&&assetIds.has(v);
 for(const a of source.assets){requireValue(text(a.category,200)&&amount(a.amount)&&typeof a.memo==='string'&&a.memo.length<=10000&&ref(a.cardPaymentAssetId));
  requireValue((a.name==null||typeof a.name==='string'&&a.name.length<=10000)&&(a.kind==null||text(a.kind,40))&&(a.sortOrder==null||integer(a.sortOrder)&&a.sortOrder>=0));
  for(const key of ['cardCycleStartDay','cardCycleEndDay','cardPaymentDay'])requireValue(a[key]==null||integer(a[key])&&a[key]>=1&&a[key]<=31);
 }
 add('assets',['id','category','amount','memo','name','kind','revision','sort_order','card_cycle_start_day','card_cycle_end_day','card_payment_day','card_payment_asset_id'],
  source.assets.map((a:Row)=>[a.id,a.category,a.amount,a.memo,a.name??null,a.kind??null,1,a.sortOrder??null,a.cardCycleStartDay??null,a.cardCycleEndDay??null,a.cardPaymentDay??null,a.cardPaymentAssetId??null]));
 for(const t of source.transactions){requireValue(['income','expense','transfer'].includes(t.type)&&day(t.date)&&amount(t.amount)&&t.amount>0&&text(t.title,10000)&&text(t.category,200)&&time(t.time)&&ref(t.assetId)&&ref(t.toAssetId));
  requireValue(t.createdAt==null||integer(t.createdAt));
  requireValue(t.recurringRuleId==null||text(t.recurringRuleId,200));
  requireValue(t.installmentGroupId==null||text(t.installmentGroupId,200));
  for(const key of ['installmentIndex','installmentMonths'])requireValue(t[key]==null||integer(t[key])&&t[key]>=1&&t[key]<=1200);
 }
 const txIds=new Set(source.transactions.map((t:Row)=>t.id)),settlementIds=new Set(source.cardSettlements.map((s:Row)=>s.id));
 requireValue(source.transactions.every((t:Row)=>t.cardSettlementId==null||settlementIds.has(t.cardSettlementId)));
 add('transactions',['id','type','date','amount','title','category','recurring_rule_id','asset_id','to_asset_id','created_at','transaction_time','installment_group_id','installment_index','installment_months','revision','last_operation_id','deleted_at','card_settlement_id'],
  source.transactions.map((t:Row)=>[t.id,t.type,t.date,t.amount,t.title,t.category,t.recurringRuleId??null,t.assetId??null,t.toAssetId??null,t.createdAt??null,t.time??null,t.installmentGroupId??null,t.installmentIndex??null,t.installmentMonths??null,1,null,null,t.cardSettlementId??null]));
 for(const r of source.recurringRules)requireValue(['income','expense','transfer'].includes(r.type)&&integer(r.day)&&r.day>=1&&r.day<=31&&amount(r.amount)&&r.amount>0&&text(r.title,10000)&&text(r.category,200)&&month(r.startMonth)&&(r.endMonth==null||month(r.endMonth))&&time(r.time)&&ref(r.assetId)&&ref(r.toAssetId));
 add('recurring_rules',['id','type','day','amount','title','category','startMonth','endMonth','asset_id','to_asset_id','transaction_time'],source.recurringRules.map((r:Row)=>[r.id,r.type,r.day,r.amount,r.title,r.category,r.startMonth,r.endMonth??null,r.assetId??null,r.toAssetId??null,r.time??null]));
 requireValue(source.deletedRecurringTxs.every((id:unknown)=>text(id,300)));
 add('deleted_recurring_txs',['id'],source.deletedRecurringTxs.map((id:string)=>[id]));
 for(const s of source.cardSettlements)requireValue(assetIds.has(s.cardAssetId)&&assetIds.has(s.paymentAssetId)&&day(s.periodStart)&&day(s.periodEnd)&&day(s.dueDate)&&amount(s.amount)&&s.amount>=0&&txIds.has(s.transactionId)&&integer(s.settledAt));
 add('card_settlements',['id','card_asset_id','payment_asset_id','period_start','period_end','due_date','amount','transaction_id','settled_at'],source.cardSettlements.map((s:Row)=>[s.id,s.cardAssetId,s.paymentAssetId,s.periodStart,s.periodEnd,s.dueDate,s.amount,s.transactionId,s.settledAt]));
 const categories:unknown[][]=[];
 for(const [field,type] of [['customExpenseCategories','expense'],['customIncomeCategories','income'],['customAssetCategories','asset']])for(const c of source[field]){
  requireValue(object(c)&&text(c.id,200)&&text(c.label,500)&&(c.color==null||typeof c.color==='string'&&/^#[a-f0-9]{6}$/i.test(c.color)));
  categories.push([c.id,type==='asset'&&c.kind==='liability'?'liability':type,c.label,c.color??null,c.kind??null]);
 }
 add('custom_categories',['id','type','label','color','kind'],categories);
 for(const p of source.plans)requireValue(object(p)&&text(p.category,200)&&['income','expense','asset','liability'].includes(p.type)&&amount(p.plannedAmount)&&p.plannedAmount>=0);
 add('plans',['category','type','plannedAmount'],source.plans.map((p:Row)=>[p.category,p.type,p.plannedAmount]));
 requireValue(amount(source.budget)&&source.budget>=0);
 const settings:unknown[][]=[['budget',String(source.budget)],['updatedAt',String(Date.now())]];
 for(const key of ['categoryColors','categoryLabels','categoryBudgetExcluded','categoryOrder','hiddenCategories','hiddenAssets']){
  requireValue(object(source[key]));settings.push([key,JSON.stringify(source[key])]);
 }
 for(const key of ['theme','styleTheme'])if(source[key]!=null){requireValue(text(source[key],30));settings.push([key,source[key]]);}
 add('settings',['key','value'],settings);
 const groups:unknown[][]=[];
 for(const [key,prefix] of [['assetOrderRevisions','asset-order:'],['categoryOrderRevisions','category-order:']]){
  requireValue(object(source[key]));for(const [id,revision] of Object.entries(source[key])){requireValue(text(id,200)&&integer(revision)&&Number(revision)>=0);groups.push([prefix+id,revision]);}
 }
 add('sync_groups',['id','revision'],groups);
 return result;
}
