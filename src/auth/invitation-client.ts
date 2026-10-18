const pendingKey = 'memoney:pending-invite:v1';
export function invitationToken(value: string) {
  const trimmed = value.trim();
  if (/^[a-f0-9]{64}$/.test(trimmed)) return trimmed;
  try { const parsed = new URL(trimmed); const token = new URLSearchParams(parsed.hash.slice(1)).get('invite');
    return token && /^[a-f0-9]{64}$/.test(token) ? token : ''; } catch { return ''; }
}
export function rememberInvitation(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) return;
  sessionStorage.setItem(pendingKey, JSON.stringify({ token, expiresAt: Date.now() + 1800000 }));
}
export function pendingInvitation() {
  const fromUrl = new URLSearchParams(location.hash.slice(1)).get('invite');
  if (fromUrl && /^[a-f0-9]{64}$/.test(fromUrl)) { rememberInvitation(fromUrl); history.replaceState(null, '', location.pathname + location.search); }
  try { const saved = JSON.parse(sessionStorage.getItem(pendingKey) || 'null');
    if (saved?.expiresAt > Date.now() && /^[a-f0-9]{64}$/.test(saved.token)) return String(saved.token);
  } catch { /* Ignore malformed ephemeral invitation state. */ }
  sessionStorage.removeItem(pendingKey); return '';
}
export function clearInvitation() { sessionStorage.removeItem(pendingKey); }
