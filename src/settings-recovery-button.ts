function openRecoveryPanel() {
  if (typeof window.mywalletOpenLocalRecovery === 'function') {
    window.mywalletOpenLocalRecovery();
    return;
  }

  const floatingButton = document.querySelector<HTMLButtonElement>('.local-recovery-force-button, .local-recovery-button');
  floatingButton?.click();
}

function findDataResetArea() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
  const resetButton = buttons.find((button) => {
    const text = button.textContent?.replace(/\s+/g, '') ?? '';
    return text.includes('초기화') || text.includes('데이터초기화');
  });

  if (!resetButton) return null;
  return resetButton.closest<HTMLElement>('.settings-row, .glass-panel, section, article, div') ?? resetButton.parentElement;
}

function mountSettingsRecoveryButton() {
  const area = findDataResetArea();
  if (!area || area.querySelector('.settings-local-recovery-button')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button settings-local-recovery-button';
  button.textContent = '로컬 데이터 복구';
  button.style.cssText = `
    min-height: 42px;
    min-width: 148px;
    margin-top: 8px;
    border-radius: 12px;
    border: 1px solid rgba(14, 165, 183, .26);
    background: rgba(14, 165, 183, .10);
    color: var(--primary);
    font-weight: 900;
  `;
  button.onclick = openRecoveryPanel;

  const actions = area.querySelector<HTMLElement>('.settings-actions, .confirm-actions')
    ?? Array.from(area.querySelectorAll<HTMLElement>('div')).find((node) => node.querySelector('button'))
    ?? area;

  actions.appendChild(button);
}

function bootSettingsRecoveryButton() {
  mountSettingsRecoveryButton();
  window.setTimeout(mountSettingsRecoveryButton, 300);
  window.setTimeout(mountSettingsRecoveryButton, 1000);
  window.setTimeout(mountSettingsRecoveryButton, 2500);

  const observer = new MutationObserver(() => mountSettingsRecoveryButton());
  observer.observe(document.body, { childList: true, subtree: true });
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
