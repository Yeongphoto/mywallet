import { useEffect } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';

const launch = registerPlugin<{ ready(): Promise<void> }>('MemoneyLaunchScreen');
export function useLaunchReady(ready: boolean) {
  useEffect(() => {
    if (!ready || Capacitor.getPlatform() !== 'android') return;
    // The native visual-state callback waits for committed WebView content.
    // Animation frames may be suspended while the system holds the first draw.
    void launch.ready().catch(() => {});
  }, [ready]);
}
