import type { RecurringRule, Transaction } from '../../src/types.ts';

export function dateInTimeZone(timeZone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Identity is explicit. Similar titles/amounts/categories never reassign another transaction.
export function dueRecurringTransactions(
  rules: RecurringRule[], transactions: Array<Pick<Transaction,'id'|'date'|'recurringRuleId'>>,
  deletedIds: string[], today: string, limit = 40,
): Transaction[] {
  const result: Transaction[] = [], deleted = new Set(deletedIds);
  for (const rule of rules) {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(rule.startMonth)||!Number.isInteger(rule.day)||rule.day<1||rule.day>31||!(rule.amount>0))continue;
    let [year,month]=rule.startMonth.split('-').map(Number);
    while(year>0) {
      const monthString=`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}`;
      if(monthString>today.slice(0,7)||rule.endMonth&&monthString>rule.endMonth)break;
      const date=`${monthString}-${String(Math.min(rule.day,new Date(year,month,0).getDate())).padStart(2,'0')}`;
      const id=`rec_${rule.id}_${monthString}`;
      const exists=transactions.some(t=>t.id===id||t.recurringRuleId===rule.id&&t.date.slice(0,7)===monthString);
      if(date<=today&&!exists&&!deleted.has(id)) {
        result.push({id,type:rule.type,date,time:rule.time||null,amount:rule.amount,title:rule.title,category:rule.category,
          assetId:rule.assetId||null,toAssetId:rule.toAssetId||null,recurringRuleId:rule.id});
        if(result.length>=limit)return result;
      }
      month++;if(month>12){month=1;year++;}
    }
  }
  return result;
}
