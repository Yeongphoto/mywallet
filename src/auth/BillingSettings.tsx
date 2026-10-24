import { useEffect, useMemo, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { createAnnualBillingClient } from './billing-client';
import type { AnnualBillingClient, BillingView, NativeBilling } from './billing-client';
import './billing-settings.css';

const native = registerPlugin<NativeBilling>('MemoneyBilling');
function message(error: unknown) {
  const code = (error as { code?: string; message?: string }).code || (error as Error).message;
  const messages: Record<string, string> = {
    CANCELLED: '결제를 취소했어요.',
    PURCHASE_ALREADY_OWNED: '이미 구매한 구독이 있어요. 구매 복원으로 확인해 주세요.',
    PURCHASE_ACCOUNT_MISMATCH: '구매에 연결된 메머니 계정으로 로그인해 주세요.',
    BILLING_ACCOUNT_CHANGED: '로그인 계정이 바뀌었어요. 화면을 다시 열어 주세요.',
    PRODUCT_UNAVAILABLE: '연 구독 상품을 준비하고 있어요. 잠시 후 다시 확인해 주세요.',
    PURCHASE_PROCESSING_PENDING: '결제를 확인하고 있어요. 구매 복원으로 다시 확인할 수 있어요.',
    UNAUTHENTICATED: 'Google 로그인 후 구독을 이용할 수 있어요.',
  };
  return messages[code || ''] || '구독 상태를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.';
}

export function BillingSettings({ client: supplied }: { client?: AnnualBillingClient } = {}) {
  const supported = !!supplied || Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('MemoneyBilling');
  const client = useMemo(() => supplied || createAnnualBillingClient(native, window.fetch.bind(window)), [supplied]);
  const [view, setView] = useState<BillingView | null>(null), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!supported) return;
    let disposed = false;
    setBusy(true); setNotice('');
    void client.load().then(result => { if (!disposed) { setView(result); if (result.priceError) setNotice(message(new Error(result.priceError))); } })
      .catch(error => { if (!disposed) { setView({ available: true }); setNotice(message(error)); } })
      .finally(() => { if (!disposed) setBusy(false); });
    return () => { disposed = true; };
  }, [client, supported, revision]);
  if (!supported || !view || !view.available) return null;
  const premium = view.status?.plan === 'premium_yearly';
  async function action(kind: 'purchase' | 'restore' | 'manage') {
    if (busy) return; setBusy(true); setNotice('');
    try {
      if (kind === 'manage') { await client.manage(); return; }
      const status = await client[kind](); setView(previous => ({ ...previous!, status }));
      setNotice(status.purchasePending ? '결제를 확인하고 있어요. 잠시 후 구매 복원으로 다시 확인해 주세요.'
        : status.plan === 'premium_yearly' ? '연 구독 혜택이 적용됐어요.' : '이 계정에서 활성 구독을 찾지 못했어요.');
    } catch (error) { setNotice(message(error)); }
    finally { setBusy(false); }
  }
  return <section className="settings-row billing-settings" aria-label="메머니 연 구독">
    <div className="billing-settings-heading"><strong>메머니 프리미엄</strong><span>{premium ? '연 구독 이용 중' : '연 구독'}</span></div>
    <p>내 광고 제거·입력 한도 해제 · 내가 호스트인 장부의 자산 한도 해제</p>
    {premium && view.status?.expiresAt && <p>혜택 이용 기한: {new Date(view.status.expiresAt).toLocaleDateString('ko-KR')}</p>}
    {!premium && view.price && <p><strong>{view.price.formattedPrice} / 년</strong><br />매년 자동 갱신되며 Google Play에서 취소할 수 있어요.</p>}
    <div className="billing-settings-actions">
      {!premium && view.price && <button type="button" className="primary-button" disabled={busy} onClick={() => void action('purchase')}>연 구독 시작</button>}
      {view.status && <button type="button" className="secondary-button" disabled={busy} onClick={() => void action('restore')}>구매 복원</button>}
      {premium && <button type="button" className="secondary-button" disabled={busy} onClick={() => void action('manage')}>구독 관리</button>}
      {!view.status && <button type="button" className="secondary-button" disabled={busy} onClick={() => setRevision(value => value + 1)}>다시 확인</button>}
    </div>
    {busy && <p role="status">구독을 확인하고 있어요…</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
