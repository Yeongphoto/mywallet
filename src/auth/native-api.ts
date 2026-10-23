import { Capacitor, registerPlugin } from '@capacitor/core';

export type NativeApi = {
  configuration(): Promise<{ enabled: boolean }>;
  request(options: { path: string; method: string; headers: Record<string, string>; body: string }): Promise<{ status: number; headers: Record<string, string>; body: string }>;
};
const native = registerPlugin<NativeApi>('MemoneyApi');

export function nativeApiFetch(bridge: NativeApi, fallback: typeof fetch, origin: string): typeof fetch {
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), origin);
    if (!url.pathname.startsWith('/api/')) return fallback(input, init);
    if (url.origin !== origin || url.username || url.password || url.hash) throw new TypeError('API origin rejected');
    const request = new Request(input instanceof Request ? input : url.href, init);
    if (request.credentials === 'omit') throw new TypeError('Unauthenticated API transport must not silently attach cookies');
    if (request.signal.aborted) throw request.signal.reason;
    const options = { path: url.pathname + url.search, method: request.method,
      headers: Object.fromEntries(request.headers.entries()), body: request.method === 'GET' ? '' : await request.text() };
    if (request.signal.aborted) throw request.signal.reason;
    let abort: () => void = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      abort = () => reject(request.signal.reason);
      request.signal.addEventListener('abort', abort, { once: true });
    });
    try {
      const result = await Promise.race([bridge.request(options), cancelled]);
      if (result.status < 200 || result.status >= 600 || result.status >= 300 && result.status < 400) throw new TypeError('API response rejected');
      const headers = new Headers(result.headers);
      headers.delete('Set-Cookie'); headers.delete('Set-Cookie2');
      return new Response([204, 205, 304].includes(result.status) ? null : result.body, { status: result.status, headers });
    } finally { request.signal.removeEventListener('abort', abort); }
  };
}

export async function installNativeApi(): Promise<boolean> {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('MemoneyApi')) return false;
  const config = await native.configuration();
  if (!config.enabled) return false;
  window.fetch = nativeApiFetch(native, window.fetch.bind(window), window.location.origin);
  return true;
}
