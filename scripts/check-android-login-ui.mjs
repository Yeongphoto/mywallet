import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

// Read the development app only. Never attach to Google's credential-entry page.
const targets = await fetch('http://127.0.0.1:9223/json/list', { signal: AbortSignal.timeout(5000) }).then(response => response.json());
const target = targets.find(target => {const url=new URL(target.url);return ['http://localhost:5187','https://memoney-android-test.pages.dev'].includes(url.origin)&&url.pathname==='/signin';});
assert.ok(target?.webSocketDebuggerUrl, 'Forward the development WebView socket to port 9223 first');
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
socket.addEventListener('message', event => {
  const result = JSON.parse(event.data);
  const item = pending.get(result.id);
  if (!item) return;
  pending.delete(result.id);
  clearTimeout(item.timeout);
  result.error ? item.reject(new Error('CDP request failed')) : item.resolve(result.result);
});
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    const timeout = setTimeout(() => { pending.delete(id); reject(new Error('CDP request timeout')); }, 10000);
    pending.set(id, { resolve, reject, timeout });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
try {
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('CDP connection timeout')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timeout); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('CDP connection failed')); }, { once: true });
  });
  const { result, exceptionDetails } = await request('Runtime.evaluate', {
    expression: `JSON.stringify({
      url: location.href, platform: window.Capacitor?.getPlatform(),
      native: window.Capacitor?.isPluginAvailable('MemoneyGoogleAuth'),
      feedback: document.querySelector('.signin-feedback')?.textContent,
      title: document.querySelector('.signin-content h1')?.textContent,
      buttonEnabled: !document.querySelector('.signin-google')?.disabled,
      logoSource: document.querySelector('.signin-brand img')?.getAttribute('src'),
      localAction: document.querySelector('.signin-local')?.textContent,
      overflow: document.documentElement.scrollWidth > innerWidth,
      financialRequests: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/api/data')).length,
      brokenImages: [...document.images].filter(image => !image.complete || image.naturalWidth === 0).length,
    })`, returnByValue: true,
  });
  assert.equal(exceptionDetails, undefined);
  const state = JSON.parse(result.value);
  assert.equal(state.platform, 'android');
  assert.equal(state.native, true);
  assert.equal(state.overflow, false);
  assert.equal(state.financialRequests, 0);
  assert.equal(state.brokenImages, 0);
  console.log(JSON.stringify(state));
  const shot = await request('Page.captureScreenshot', { format: 'png' });
  writeFileSync('android/build/memoney-signin-webview.png', Buffer.from(shot.data, 'base64'));
} finally { socket.close(); }
