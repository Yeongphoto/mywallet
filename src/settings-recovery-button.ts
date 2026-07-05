function openRecoveryPanel() {
  if (typeof window.mywalletOpenLocalRecovery === 'function') {
    window.mywalletOpenLocalRecovery();
    return;
  }

  const floatingButton = document.querySelector<HTMLButtonElement>('.local-recovery-force-button, .local-recovery-button');
  floatingButton?.click();
}

function getCompactText(element: Element | null) {
  return element?.textContent?.replace(/\s+/g, '') ?? '';
}

function findResetButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
    const text = getCompactText(button);
    return text.includes('전체초기화') || text.includes('데이터초기화') || text === '초기화';
  }) ?? null;
}

function findDataResetCard(resetButton: HTMLButtonElement) {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('section, article, .glass-panel, div'));

  const titledCard = candidates.find((node) => {
    const text = getCompactText(node);
    return text.includes('데이터초기화') && node.contains(resetButton);
  });

  return titledCard
    ?? resetButton.closest<HTMLElement>('.glass-panel, section, article')
    ?? resetButton.parentElement;
}

function mountSettingsRecoveryButton() {
  document.querySelectorAll<HTMLElement>('.local-recovery-force-button, .local-recovery-button').forEach((button) => {
    button.style.display = 'none';
  });

  const resetButton = findResetButton();
  if (!resetButton) return;

  const card = findDataResetCard(resetButton);
  if (!card || card.querySelector('.settings-local-recovery-button')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button settings-local-recovery-button';
  button.textContent = '로컬 데이터 복구';
  button.style.cssText = `
    display: block;
    width: 100%;
    min-height: 48px;
    margin-top: 12px;
    border-radius: 14px;
    border: 1px solid rgba(14, 165, 183, .30);
    background: rgba(14, 165, 183, .10);
    color: var(--primary);
    font-size: 1rem;
    font-weight: 900;
  `;
  button.onclick = openRecoveryPanel;

  resetButton.insertAdjacentElement('afterend', button);
}

function bootSettingsRecoveryButton() {
  mountSettingsRecoveryButton();
  window.setTimeout(mountSettingsRecoveryButton, 100);
  window.setTimeout(mountSettingsRecoveryButton, 300);
  window.setTimeout(mountSettingsRecoveryButton, 700);
  window.setTimeout(mountSettingsRecoveryButton, 1500);
  window.setTimeout(mountSettingsRecoveryButton, 3000);

  const observer = new MutationObserver(() => mountSettingsRecoveryButton());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });

  window.addEventListener('hashchange', () => window.setTimeout(mountSettingsRecoveryButton, 120));
  window.addEventListener('focus', () => window.setTimeout(mountSettingsRecoveryButton, 120));
}

declare global {
  interface Window {
    mywalletOpenLocalRecovery?: () => void;
    mywalletMountSettingsRecoveryButton?: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.mywalletMountSettingsRecoveryButton = mountSettingsRecoveryButton;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootSettingsRecoveryButton, { once: true });
  } else {
    bootSettingsRecoveryButton();
  }
}

export {};
