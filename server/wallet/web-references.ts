// Validate references against the already selected ledger, never the global DB.
// The legacy handler still owns revisions, operation IDs and atomic writes.
export async function webReferencesValid(request: Request, finance: D1Database) {
  const body = await request.clone().json() as Record<string, any>;
  const items: Record<string, any>[] = [];
  if (['transaction.create','transaction.update'].includes(body.op)) items.push(body.transaction);
  if (body.op === 'transaction.createBatch') items.push(...(Array.isArray(body.transactions) ? body.transactions : []));
  if (['recurring_rule.create','recurring_rule.upsert','recurring_rule.update'].includes(body.op)) items.push(body.rule);
  if (body.op === 'recurring_rules.sync') items.push(...(Array.isArray(body.rules) ? body.rules : []));
  for (const item of items) {
    if (!item || typeof item !== 'object') return false;
    for (const key of ['assetId','toAssetId']) {
      if (item[key] && !await finance.prepare('SELECT id FROM assets WHERE id=?').bind(item[key]).first()) return false;
    }
  }
  if (['asset.create','asset.update'].includes(body.op) && body.asset?.cardPaymentAssetId &&
      !await finance.prepare('SELECT id FROM assets WHERE id=?').bind(body.asset.cardPaymentAssetId).first()) return false;
  return true;
}
