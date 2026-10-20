import { useEffect, useRef, useState } from 'react';
import { useLaunchReady } from './use-launch-ready';
import './wallet-connection.css';

const sleep = '/images/met-sleep.gif';
const meow = '/images/met-meow.gif';
export function WalletConnectionScreen({ complete = false, onComplete }: { complete?: boolean; onComplete?: () => void }) {
  const [sleepLoaded, setSleepLoaded] = useState(false);
  const [meowReady, setMeowReady] = useState(false);
  const [meowFailed, setMeowFailed] = useState(false);
  const meowImage = useRef<HTMLImageElement>(null);
  const showMeow = complete && meowReady;
  useLaunchReady(sleepLoaded || showMeow);
  useEffect(() => { const image = new Image(); image.src = meow; }, []);
  useEffect(() => {
    setMeowReady(false);
    setMeowFailed(false);
    if (!complete || !meowImage.current) return;
    let cancelled = false;
    const image = meowImage.current;
    void image.decode().then(() => {
      if (!cancelled) setMeowReady(image.naturalWidth > 0);
    }).catch(() => {
      if (!cancelled) setMeowFailed(true);
    });
    return () => { cancelled = true; };
  }, [complete]);
  useEffect(() => {
    if (!complete || (!meowReady && !meowFailed) || !onComplete) return;
    let timer = 0;
    const resume = () => {
      window.clearTimeout(timer);
      if (document.visibilityState === 'visible') timer = window.setTimeout(onComplete, 700);
    };
    resume();
    document.addEventListener('visibilitychange', resume);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', resume); };
  }, [complete, meowReady, meowFailed, onComplete]);
  return <div className="wallet-connection-screen" data-state={showMeow ? 'complete' : 'sleep'} role="status" aria-live="polite" aria-busy={!showMeow} aria-label={showMeow ? '연결 완료' : '장부 연결 중'}>
    <div className="wallet-connection-met" aria-hidden="true">
      <img src={sleep} data-met="sleep" alt="" width="512" height="670" style={{ visibility: showMeow ? 'hidden' : 'visible' }} onLoad={() => setSleepLoaded(true)} onError={() => setSleepLoaded(true)} />
      <img ref={meowImage} src={complete ? meow : undefined} data-met="meow" alt="" width="512" height="670" style={{ visibility: showMeow ? 'visible' : 'hidden' }} />
    </div>
  </div>;
}
