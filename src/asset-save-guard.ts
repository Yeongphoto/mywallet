const ASSET_SAVE_STORAGE_KEY = 'mywallet:v2';

let lastAssetsSnapshot = '';
let lastPayloadSnapshot = '';
let saveInFlight = false;
let pendingPayload: string | null = null;

function readWalletPayload(): string | null {
  try {
    return window.localStorage.getItem(ASSET_SAVE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getAssetsSnapshot(payload: string | null) {
  if (!payload) return '';
  try {
    const parsed = JSON.parse(payload);
    return JSON.stringify(Array.isArray(parsed.assets) ? parsed.assets : []);
  } catch {
    return '';
  }
}

function sendPayload(payload: string, keepalive = false) {
  if (!payload || payload === lastPayloadSnapshot) return;

  lastPayloadSnapshot = payload;

  if (keepalive && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([payload], { type: 'application/json' });
    const sent = navigator.sendBeacon('/api/data', blob);
    if (sent) return;
  }

  if (saveInFlight) {
    pendingPayload = payload;
    return;
  }

  saveInFlight = true;
  window.fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive,
  }).catch(() => undefined).finally(() => {
    saveInFlight = false;
    if (pendingPayload && pendingPayload !== payload) {
      const nextPayload = pendingPayload;
      pendingPayload = null;
      sendPayload(nextPayload, keepalive);
    } else {
      pendingPayload = null;
    }
  });
}

function flushCurrentWalletData(keepalive = false) {
  const payload = readWalletPayload();
  if (!payload) return;
  sendPayload(payload, keepalive);
}

function handleWalletPayloadSaved(payload: string) {
  const nextAssetsSnapshot = getAssetsSnapshot(payload);
  if (nextAssetsSnapshot && nextAssetsSnapshot !== lastAssetsSnapshot) {
    lastAssetsSnapshot = nextAssetsSnapshot;
    sendPayload(payload, false);
  }
}

if (typeof window !== 'undefined') {
  const initialPayload = readWalletPayload();
  lastAssetsSnapshot = getAssetsSnapshot(initialPayload);
  lastPayloadSnapshot = initialPayload ?? '';

  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function patchedSetItem(key: string, value: string) {
    originalSetItem.call(this, key, value);
    if (this === window.localStorage && key === ASSET_SAVE_STORAGE_KEY) {
      handleWalletPayloadSaved(value);
    }
  };

  window.addEventListener('hashchange', () => flushCurrentWalletData(true));
  window.addEventListener('pagehide', () => flushCurrentWalletData(true));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushCurrentWalletData(true);
    }
  });
}
