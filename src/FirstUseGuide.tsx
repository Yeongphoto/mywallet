import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './first-use-guide.css';

const completedKey = 'memoney:usage-guide:v1:completed';
type Step = 'asset-tab' | 'asset-add' | 'ledger-tab' | 'ledger-add' | 'plan-tab' | 'plan-review' | 'done';
type Props = { activeTab: string; assetCount: number; entryOpen: boolean; entryMode: string; paused: boolean; ready: boolean; onFinish: () => void };
let enabledInMemory: boolean | null = null;

// This preference belongs to the device, never to a financial ledger snapshot.
export function useFirstUseGuide() {
  const [runId, setRunId] = useState(0);
  const [enabled, setEnabledState] = useState(() => {
    if (enabledInMemory !== null) return enabledInMemory;
    try { return !localStorage.getItem(completedKey); }
    catch { return true; }
  });
  const setEnabled = useCallback((value: boolean) => {
    if (value) setRunId(previous => previous + 1);
    enabledInMemory = value;
    try {
      if (value) localStorage.removeItem(completedKey);
      else localStorage.setItem(completedKey, '1');
    } catch { /* Still allow replay and dismissal for this page without device storage. */ }
    setEnabledState(value);
  }, []);
  const finish = useCallback(() => setEnabled(false), [setEnabled]);
  return { enabled, setEnabled, finish, runId };
}

export function FirstUseGuide({ activeTab, assetCount, entryOpen, entryMode, paused, ready, onFinish }: Props) {
  const [step, setStep] = useState<Step>('asset-tab');
  const openedAssetEntry = useRef(false);
  const [position, setPosition] = useState<{ x: number; y: number; w: number; h: number; tipX: number; tipY: number; tipW: number } | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const finish = () => {
    setStep('done');
    onFinish();
  };
  useEffect(() => {
    if (!ready || step === 'done') return;
    if (step === 'asset-tab' && activeTab === 'asset') setStep('asset-add');
    if (step === 'asset-add' && entryOpen && entryMode === 'asset') openedAssetEntry.current = true;
    if (step === 'asset-add' && !entryOpen && openedAssetEntry.current) {
      openedAssetEntry.current = false; setStep('ledger-tab');
    }
    if (step === 'ledger-tab' && activeTab === 'ledger') setStep('ledger-add');
    if (step === 'ledger-add' && activeTab === 'ledger' && entryOpen && entryMode !== 'asset') setStep('plan-tab');
    if (step === 'plan-tab' && activeTab === 'plan' && !entryOpen) setStep('plan-review');
  }, [ready, step, activeTab, entryOpen, entryMode, assetCount]);

  // Keep add instructions attached to the correct tab if the user navigates away.
  const target = step === 'asset-add' && activeTab !== 'asset' ? 'asset-tab'
    : step === 'ledger-add' && activeTab !== 'ledger' ? 'ledger-tab' : step === 'plan-review' ? 'plan-tab' : step;
  const visible = ready && !paused && !entryOpen && step !== 'done';
  useLayoutEffect(() => {
    if (!visible) { setPosition(null); return; }
    let frame = 0;
    const measure = () => {
      const anchor = [...document.querySelectorAll<HTMLElement>(`[data-guide="${target}"]`)]
        .find(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
      if (!anchor) { setPosition(null); return; }
      const rect = anchor.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
      const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
      if (rect.bottom < top || rect.top > top + height) { setPosition(null); return; }
      const tipW = Math.min(380, width - 32), tipH = tip.current?.offsetHeight || 200;
      const tipX = left + (width - tipW) / 2;
      let tipY = Math.max(top + 16, Math.min(top + height * .46 - tipH / 2, top + height - tipH - 16));
      // Short landscape windows must still leave the highlighted control reachable.
      if (tipX < rect.right + 12 && tipX + tipW > rect.left - 12 && tipY < rect.bottom + 12 && tipY + tipH > rect.top - 12) {
        tipY = rect.top - tipH - 20 >= top + 16 ? rect.top - tipH - 20 : Math.min(rect.bottom + 20, top + height - tipH - 16);
      }
      setPosition({ x: rect.x, y: rect.y, w: rect.width, h: rect.height, tipX, tipY, tipW });
    };
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const resize = new ResizeObserver(update); resize.observe(document.body); if (tip.current) resize.observe(tip.current);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') finish(); };
    window.addEventListener('keydown', escape);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect();
      window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update); window.visualViewport?.removeEventListener('scroll', update);
      window.removeEventListener('keydown', escape);
    };
  }, [visible, target, assetCount]);

  if (!visible) return null;
  const spotlight = position && {
    x: position.x - ((position.w + 8) * 1.1 - position.w) / 2,
    y: position.y - ((position.h + 8) * 1.1 - position.h) / 2,
    w: (position.w + 8) * 1.1, h: (position.h + 8) * 1.1,
  };
  const radius = spotlight ? Math.min(20, spotlight.w / 2, spotlight.h / 2) : 0;
  // The clear cutout and visible frame share the same bounds and circular corners.
  const cutoutPath = spotlight && `M0 0H${innerWidth}V${innerHeight}H0Z M${spotlight.x + radius} ${spotlight.y}`
    + `H${spotlight.x + spotlight.w - radius}A${radius} ${radius} 0 0 1 ${spotlight.x + spotlight.w} ${spotlight.y + radius}`
    + `V${spotlight.y + spotlight.h - radius}A${radius} ${radius} 0 0 1 ${spotlight.x + spotlight.w - radius} ${spotlight.y + spotlight.h}`
    + `H${spotlight.x + radius}A${radius} ${radius} 0 0 1 ${spotlight.x} ${spotlight.y + spotlight.h - radius}`
    + `V${spotlight.y + radius}A${radius} ${radius} 0 0 1 ${spotlight.x + radius} ${spotlight.y}Z`;
  const text = target === 'asset-tab' ? '사용하시기 전에 자산을 먼저 추가해보세요!'
    : target === 'asset-add' ? '+ 버튼을 눌러 자산을 추가해보세요.'
      : target === 'ledger-tab' ? '이제 장부에서 지출·수입을 입력해보세요.'
        : target === 'ledger-add' ? '+ 버튼을 눌러 지출·수입을 입력해보세요.' : '계획을 입력하고 실제 지출과 비교해보세요.';
  const detail = target.startsWith('asset') ? '자산 카테고리는 설정 → 자산관리에서 추가·수정할 수 있어요.'
    : target.startsWith('ledger') ? '지출·수입 카테고리는 설정 → 카테고리에서 추가·수정할 수 있어요.'
      : '계획 탭에서 예산을 정하면 결산에서 실제 지출과 차이를 확인할 수 있어요.';
  return createPortal(<div className="first-use-guide" data-guide-step={step === 'plan-review' ? step : target}>
    {spotlight && <>
      <div className="first-use-guide-backdrop" aria-hidden="true" style={{ clipPath: `path(evenodd, "${cutoutPath}")` }} />
      <div className="first-use-guide-ring" aria-hidden="true" style={{ left: spotlight.x, top: spotlight.y, width: spotlight.w, height: spotlight.h, borderRadius: radius }} />
    </>}
    <div ref={tip} className="first-use-guide-tip" role="region" aria-label="첫 사용 가이드"
      style={{ visibility: position ? 'visible' : 'hidden', left: position?.tipX || 12, top: position?.tipY || 12, width: position?.tipW || 300 }}>
      <div className="first-use-guide-heading"><span>시작 가이드 · {step.startsWith('asset') ? '1' : step.startsWith('ledger') ? '2' : '3'}/3</span>
        <button type="button" aria-label="가이드 닫기" onClick={finish}>×</button></div>
      <p aria-live="polite">{text}</p>
      <p className="first-use-guide-detail">{detail}</p>
      {target === 'asset-add' && assetCount > 0 && <button className="first-use-guide-skip" type="button" onClick={() => setStep('ledger-tab')}>이미 자산이 있어요 →</button>}
      <button className="first-use-guide-off" type="button" onClick={finish}>{step === 'plan-review' ? '가이드 마치기' : '가이드 끄기'}</button>
    </div>
  </div>, document.body);
}
