import { Capacitor, registerPlugin } from '@capacitor/core';
import { guestKey, localSnapshot, assertGuestGeneration, withGuestLock } from './local-wallet';
import type { LocalSnapshot } from './local-wallet';
const files = registerPlugin<{ save(options: { content: string; name: string; mimeType: string }): Promise<void> }>('MemoneyLocalBackup');
export async function saveGuestBackup(content: string, name: string, mimeType = 'application/json') {
  if (Capacitor.getPlatform() === 'android') { await files.save({ content, name, mimeType }); return; }
  const url = URL.createObjectURL(new Blob([content], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportGuestArchive(id: string) {
  const data = localSnapshot(window.localStorage, id);
  await saveGuestBackup(JSON.stringify({ format: 'memoney-local', version: 1, data }), `memoney-local-backup-${Date.now()}.json`);
}
export function parseGuestArchive(text: string, id: string): LocalSnapshot {
  const backup = JSON.parse(text);
  if (backup.format !== 'memoney-local' || backup.version !== 1) throw new Error('INVALID_BACKUP');
  return localSnapshot({ getItem: () => JSON.stringify(backup.data) }, id);
}
export async function restoreGuestArchive(id: string, snapshot: LocalSnapshot) {
  return withGuestLock(id,()=>{
  assertGuestGeneration(id);
  const job = window.localStorage.getItem(guestKey(id, 'sync-job'));
  if (job && !JSON.parse(job).completed) throw new Error('SYNC_IN_PROGRESS');
  const current = localSnapshot(window.localStorage, id);
  window.localStorage.setItem(guestKey(id, `pre-restore:${Date.now()}`), JSON.stringify(current));
  window.localStorage.setItem(guestKey(id), JSON.stringify(snapshot));
  window.location.replace('/guest#settings');
  });
}
