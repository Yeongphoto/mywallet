import { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentity, webAuth } from './google-web';
import { readWalletContext } from './wallet-scope';
import { pendingInvitation } from './invitation-client';
import { useAppAppearance } from './use-app-appearance';
import './signin.css';

export default function SignInScreen() {
  const appearance = useAppAppearance();
  const button = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState('로그인을 준비하고 있어요…');
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false, inFlight = false;
    let renew: number | undefined;
    const host = button.current!;
    host.replaceChildren();
    async function open() {
      try {
        const configuration = await webAuth.configuration();
        if (!configuration.enabled) throw Error('AUTH_NOT_CONFIGURED');
        if (disposed) return;
        const force = new URLSearchParams(location.search).get('reauth') === '1';
        if (!force && await webAuth.session()) {
          if (disposed) return;
          await readWalletContext();
          if (!disposed) location.replace('/wallet');
          return;
        }
        const google = await loadGoogleIdentity();
        if (disposed) return;
        const challenge = await webAuth.prepareSignIn();
        if (disposed) return;
        google.initialize({ client_id: challenge.clientId, nonce: challenge.nonce, auto_select: false, ux_mode: 'popup',
          callback(response) {
            if (disposed || inFlight) return;
            inFlight = true; setBusy(true); setNotice('Google 계정을 확인하고 있어요…'); host.inert = true;
            void webAuth.finishSignIn({ idToken: response.credential }).then(async () => {
              if (disposed) return;
              await readWalletContext();
              if (!disposed) location.replace('/wallet');
            }).catch(() => {
              if (!disposed) { setNotice('로그인 또는 장부 연결에 실패했어요. 다시 시도해 주세요.'); host.replaceChildren(); }
            }).finally(() => { if (!disposed) { inFlight = false; setBusy(false); } });
          } });
        google.renderButton(host, { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', locale: 'ko', width: 280 });
        setNotice('개인 장부와 초대받은 공유 장부를 이용할 수 있어요.');
        renew = window.setTimeout(() => { if (!disposed && !inFlight) setRetry(n => n + 1); }, 240000);
      } catch (error) {
        if (!disposed) setNotice((error as Error).message === 'AUTH_NOT_CONFIGURED'
          ? '이 웹 환경의 Google 로그인이 아직 설정되지 않았어요.' : '로그인을 준비하지 못했어요. 연결 상태와 로그인 설정을 확인해 주세요.');
      }
    }
    pendingInvitation();
    void open();
    return () => { disposed = true; window.clearTimeout(renew); host.replaceChildren(); };
  }, [retry]);
  return <main className="memoney-signin" data-tone={appearance.resolved}>
    <header className="signin-brand"><img src={appearance.logo} alt="" /><strong>Memoney</strong></header>
    <section className="signin-content" aria-busy={busy}>
      <h1>시작하기</h1><div className="signin-card"><div ref={button} />
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setRetry(n => n + 1)}>다시 확인</button>
      </div><p className="signin-feedback" role="status" aria-live="polite">{notice}</p>
    </section>
  </main>;
}
