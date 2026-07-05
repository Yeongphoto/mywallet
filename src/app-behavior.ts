function resetPageScroll() {
  window.requestAnimationFrame(() => {
    const content = document.querySelector<HTMLElement>('.content');
    content?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}

if (typeof window !== 'undefined') {
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual';
  }

  window.addEventListener('hashchange', resetPageScroll);

  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest('a[href^="#"]');
    if (link) {
      resetPageScroll();
    }
  }, true);
}
