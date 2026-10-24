import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './first-use-guide.css';

const completedKey = 'memoney:usage-guide:v1:completed';
type Step = 'asset-tab' | 'asset-add' | 'ledger-tab' | 'ledger-add' | 'done';
type Props = { activeTab: string; assetCount: number; entryOpen: boolean; entryMode: string; paused: boolean; ready: boolean };
let dismissedInMemory = false;

export function FirstUseGuide({ activeTab, assetCount, entryOpen, entryMode, paused, ready }: Props) {
  const [step, setStep] = useState<Step>(() => {
    try { return dismissedInMemory || localStorage.getItem(completedKey) ? 'done' : 'asset-tab'; }
    catch { return dismissedInMemory ? 'done' : 'asset-tab'; }
  });
  const openedAssetAt = useRef<number | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number; w: number; h: number; tipX: number; tipY: number; tipW: number } | null>(null);
  const tip = useRef<HTMLDivElement>(null);
  const finish = () => {
    dismissedInMemory = true;
    try { localStorage.setItem(completedKey, '1'); } catch { /* Keep dismissing for this page if device storage is unavailable. */ }
    setStep('done');
  };
  useEffect(() => {
    if (!ready || step === 'done') return;
    if (step === 'asset-tab' && activeTab === 'asset') setStep('asset-add');
    if (step === 'asset-add' && entryOpen && entryMode === 'asset' && openedAssetAt.current === null) openedAssetAt.current = assetCount;
    if (step === 'asset-add' && !entryOpen && openedAssetAt.current !== null && assetCount > openedAssetAt.current) {
      openedAssetAt.current = null; setStep('ledger-tab');
    }
    if (step === 'ledger-tab' && activeTab === 'ledger') setStep('ledger-add');
    if (step === 'ledger-add' && activeTab === 'ledger' && entryOpen && entryMode !== 'asset') finish();
  }, [ready, step, activeTab, entryOpen, entryMode, assetCount]);

  // Keep add instructions attached to the correct tab if the user navigates away.
  const target = step === 'asset-add' && activeTab !== 'asset' ? 'asset-tab'
    : step === 'ledger-add' && activeTab !== 'ledger' ? 'ledger-tab' : step;
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
  const text = target === 'asset-tab' ? '사용하시기 전에 자산을 먼저 추가해보세요!'
    : target === 'asset-add' ? '+ 버튼을 눌러 자산을 추가해보세요.'
      : target === 'ledger-tab' ? '이제 장부에서 지출·수입을 입력해보세요.' : '+ 버튼을 눌러 지출·수입을 입력해보세요.';
  return createPortal(<div className="first-use-guide" data-guide-step={target}>
    {position && <div className="first-use-guide-ring" aria-hidden="true" style={{ left: position.x - 4, top: position.y - 4, width: position.w + 8, height: position.h + 8 }} />}
    <div ref={tip} className="first-use-guide-tip" role="region" aria-label="첫 사용 가이드"
      style={{ visibility: position ? 'visible' : 'hidden', left: position?.tipX || 12, top: position?.tipY || 12, width: position?.tipW || 300 }}>
      <div className="first-use-guide-heading"><span>시작 가이드 · {step.startsWith('asset') ? '1' : '2'}/2</span>
        <button type="button" aria-label="가이드 닫기" onClick={finish}>×</button></div>
      <p aria-live="polite">{text}</p>
      {target === 'asset-add' && assetCount > 0 && <button className="first-use-guide-skip" type="button" onClick={() => setStep('ledger-tab')}>이미 자산이 있어요 →</button>}
      <button className="first-use-guide-off" type="button" onClick={finish}>가이드 끄기</button>
    </div>
  </div>, document.body);
}
