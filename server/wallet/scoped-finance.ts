import { financialSchema } from './shared-schema.ts';
export const financeTables = ['transactions','assets','plans','custom_categories','settings','recurring_rules','deleted_recurring_txs','card_settlements','sync_groups','operation_results','sync_changes'] as const;
export const copyTables = financeTables.filter(table => !['operation_results','sync_changes'].includes(table));
const tokens = new RegExp("'(?:''|[^'])*'|\\b(?:"+financeTables.join('|')+")\\b",'g');
export function scopedSql(sql: string, ledgerId: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(ledgerId)) throw Error('INVALID_LEDGER');
  const prefix='s_'+ledgerId.replaceAll('-','')+'_';
  return sql.replace(tokens, token => token.startsWith("'") ? token : prefix+token);
}
export function scopedFinance(db: D1Database, ledgerId: string): D1Database {
  return {prepare(sql){return db.prepare(scopedSql(sql,ledgerId));},batch(statements){return db.batch(statements);}};
}
export function schemaStatements(db: D1Database, ledgerId: string) {
  const prefix='s_'+ledgerId.replaceAll('-','')+'_';
  const sql=financialSchema.replace(/^--.*$/gm,'').replace(/CREATE TABLE /g,'CREATE TABLE IF NOT EXISTS ')
    .replace(/CREATE INDEX (\w+)/g,(_,name)=>'CREATE INDEX IF NOT EXISTS '+prefix+name);
  return sql.split(';').map(part=>part.trim()).filter(Boolean).map(part=>db.prepare(scopedSql(part,ledgerId)));
}
