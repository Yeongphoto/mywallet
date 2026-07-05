function resetPageScroll() {
  window.requestAnimationFrame(() => {
    const content = document.querySelector<HTMLElement>('.content');
    content?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}

function normalizeAssetRows() {
  document.querySelectorAll<HTMLElement>('.asset-table-list > div').forEach((row) => {
    const info = row.querySelector<HTMLElement>(':scope > div:first-child');
    if (!info) return;

    const spans = Array.from(info.querySelectorAll<HTMLSpanElement>(':scope > span'));
    const amount = spans.find((span) => span.textContent?.includes('₩'));
    const memo = spans.find((span) => /^\(.+\)$/.test(span.textContent?.trim() ?? ''));
    if (!amount || !memo || info.querySelector('.asset-row-meta')) return;

    const meta = document.createElement('span');
    meta.className = 'asset-row-meta';
    meta.textContent = (memo.textContent ?? '').trim().replace(/^\(|\)$/g, '');

    info.insertBefore(meta, amount);
    memo.remove();
  });
}

if (typeof window !== 'undefined') {
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual';
  }

  window.addEventListener('hashchange', () => {
    resetPageScroll();
    normalizeAssetRows();
  });

  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest('a[href^="#"]');
    if (link) {
      resetPageScroll();
      normalizeAssetRows();
    }
  }, true);

  const observer = new MutationObserver(() => normalizeAssetRows());
  window.addEventListener('DOMContentLoaded', () => {
    normalizeAssetRows();
    const root = document.getElementById('root');
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
  });
}
