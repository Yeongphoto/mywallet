import { useEffect, useState } from 'react';
import { useLaunchReady } from './use-launch-ready';
import './wallet-connection.css';

const sleep = '/images/met-sleep.gif';
const meow = '/images/met-meow.gif';
export function WalletConnectionScreen({ complete = false, onComplete }: { complete?: boolean; onComplete?: () => void }) {
  const [loaded, setLoaded] = useState('');
  useLaunchReady(!!loaded);
  useEffect(() => { const image = new Image(); image.src = meow; }, []);
  useEffect(() => {
    if (!complete || loaded !== meow || !onComplete) return;
    let timer = 0;
    const resume = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'visible') timer = window.setTimeout(onComplete, 700);
    };
    resume();
    document.addEventListener('visibilitychange', resume);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', resume); };
  }, [complete, loaded, onComplete]);
  const src = complete ? meow : sleep;
  return <div className="wallet-connection-screen" data-state={complete ? 'complete' : 'sleep'} role="status" aria-live="polite" aria-busy={!complete} aria-label={complete ? '연결 완료' : '장부 연결 중'}>
    <div className="wallet-connection-met" aria-hidden="true">
      <img key={src} src={src} alt="" width="512" height="670" onLoad={() => setLoaded(src)} onError={() => setLoaded(src)} />
    </div>
  </div>;
}
