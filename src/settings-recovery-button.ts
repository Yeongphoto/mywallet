function openServerPushPanel() {
  if (typeof window.mywalletOpenLocalRecovery === 'function') {
    window.mywalletOpenLocalRecovery();
    return;
  }

  const floatingButton = document.querySelector<HTMLButtonElement>('.local-recovery-force-button, .local-recovery-button');
  floatingButton?.click();
}

function mountSettingsServerPushButton() {
  document.querySelectorAll<HTMLElement>('.local-recovery-force-button, .local-recovery-button').forEach((button) => {
    button.style.display = 'none';
  });

  const dataGrid = document.querySelector<HTMLElement>('.settings-data-grid');
  if (!dataGrid || dataGrid.querySelector('.settings-server-push-card')) return;

  const card = document.createElement('article');
  card.className = 'settings-data-card settings-server-push-card';
  card.innerHTML = `
    <div>
      <span>SERVER PUSH</span>
      <strong>로컬 데이터 서버 반영</strong>
    </div>
  `;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary-button';
  button.textContent = '서버 반영';
  button.onclick = openServerPushPanel;
  card.appendChild(button);

  dataGrid.appendChild(card);
}

function bootSettingsServerPushButton() {
  mountSettingsServerPushButton();
  window.setTimeout(mountSettingsServerPushButton, 100);
  window.setTimeout(mountSettingsServerPushButton, 300);
  window.setTimeout(mountSettingsServerPushButton, 700);
  window.setTimeout(mountSettingsServerPushButton, 1500);

  const observer = new MutationObserver(() => mountSettingsServerPushButton());
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('hashchange', () => window.setTimeout(mountSettingsServerPushButton, 120));
  window.addEventListener('focus', () => window.setTimeout(mountSettingsServerPushButton, 120));
}

declare global {
  interface Window {
    mywalletOpenLocalRecovery?: () => void;
    mywalletMountSettingsRecoveryButton?: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.mywalletMountSettingsRecoveryButton = mountSettingsServerPushButton;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootSettingsServerPushButton, { once: true });
  } else {
    bootSettingsServerPushButton();
  }
}

export {};
