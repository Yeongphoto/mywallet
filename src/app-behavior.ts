const STORAGE_KEY = 'mywallet:v2';

type CategoryScopeName = 'expense' | 'income' | 'asset';

type StoredCategory = {
  id: string;
  label: string;
  color?: string | null;
};

type StoredWalletData = {
  transactions?: unknown[];
  assets?: unknown[];
  plans?: unknown[];
  customExpenseCategories?: StoredCategory[];
  customIncomeCategories?: StoredCategory[];
  customAssetCategories?: StoredCategory[];
  categoryColors?: Record<string, string>;
  categoryLabels?: Record<string, string>;
  categoryOrder?: Partial<Record<CategoryScopeName, string[]>>;
  hiddenCategories?: Record<string, boolean>;
  recurringRules?: unknown[];
  deletedRecurringTxs?: string[];
  updatedAt?: number;
  [key: string]: unknown;
};

const defaultCategoryLabels: Record<CategoryScopeName, StoredCategory[]> = {
  expense: [
    { id: 'food', label: '음식' },
    { id: 'daily', label: '생필품' },
    { id: 'saving', label: '저축' },
    { id: 'utility', label: '공공요금' },
    { id: 'subscription', label: '월정료' },
    { id: 'medical', label: '의료' },
    { id: 'housing', label: '주거' },
    { id: 'transport', label: '교통' },
    { id: 'personal', label: '개인' },
    { id: 'travel', label: '여행' },
    { id: 'etc', label: '기타' },
  ],
  income: [
    { id: 'salary', label: '급여' },
    { id: 'bonus', label: '보너스' },
    { id: 'interest', label: '이자' },
    { id: 'etc', label: '기타' },
  ],
  asset: [
    { id: 'cash', label: '현금' },
    { id: 'stock', label: '주식' },
    { id: 'installment', label: '적금' },
    { id: 'deposit', label: '예금' },
    { id: 'subscription-saving', label: '청약' },
    { id: 'emergency', label: '비상금' },
    { id: 'travel', label: '여행' },
    { id: 'etc', label: '기타' },
  ],
};

let managedCategoryDrag: {
  row: HTMLElement;
  card: HTMLElement;
  type: CategoryScopeName;
} | null = null;
let managedCategorySaving = false;

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

function getStoredWalletData(): StoredWalletData | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredWalletData;
  } catch {
    return null;
  }
}

function getManagedCategoryType(card: HTMLElement): CategoryScopeName | null {
  const headText = card.querySelector<HTMLElement>('.category-table-head')?.innerText ?? '';
  if (headText.includes('자산')) return 'asset';
  if (headText.includes('수입')) return 'income';
  if (headText.includes('지출')) return 'expense';
  return null;
}

function normalizeCategoryLabel(text: string) {
  return text.replace(/삭제/g, '').replace(/⋮/g, '').replace(/\s+/g, '').trim();
}

function getManagedCategoryRowLabel(row: HTMLElement) {
  const mainText = row.querySelector<HTMLElement>('.category-row-main')?.innerText;
  if (mainText) return normalizeCategoryLabel(mainText);

  const cloned = row.cloneNode(true) as HTMLElement;
  cloned.querySelectorAll('.category-drag-handle, .category-color-menu, .category-row-action, button').forEach((node) => node.remove());
  return normalizeCategoryLabel(cloned.innerText ?? '');
}

function getKnownCategories(data: StoredWalletData, type: CategoryScopeName) {
  const customKey = type === 'expense'
    ? 'customExpenseCategories'
    : type === 'income'
    ? 'customIncomeCategories'
    : 'customAssetCategories';
  return [...defaultCategoryLabels[type], ...(Array.isArray(data[customKey]) ? data[customKey] as StoredCategory[] : [])];
}

function persistManagedCategoryOrder(card: HTMLElement) {
  const type = getManagedCategoryType(card);
  const data = getStoredWalletData();
  if (!type || !data) return;

  const knownCategories = getKnownCategories(data, type);
  const labelToId = new Map(knownCategories.map((category) => {
    const label = data.categoryLabels?.[`${type}:${category.id}`] ?? category.label;
    return [normalizeCategoryLabel(label), category.id];
  }));
  const orderedIds = Array.from(card.querySelectorAll<HTMLElement>('.category-row'))
    .map((row) => row.dataset.categoryId || labelToId.get(getManagedCategoryRowLabel(row)))
    .filter((id): id is string => Boolean(id));

  if (orderedIds.length === 0) return;

  const updatedAt = Date.now();
  const nextData: StoredWalletData = {
    ...data,
    categoryOrder: {
      ...(data.categoryOrder ?? {}),
      [type]: orderedIds,
    },
    updatedAt,
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));

  if (!managedCategorySaving) {
    managedCategorySaving = true;
    window.fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextData),
    }).catch(() => undefined).finally(() => {
      managedCategorySaving = false;
    });
  }
}

function enhanceManagedCategoryRows() {
  document.querySelectorAll<HTMLElement>('.category-table-card').forEach((card) => {
    const type = getManagedCategoryType(card);
    if (!type) return;

    card.querySelectorAll<HTMLElement>('.category-row').forEach((row) => {
      if (row.dataset.managedCategoryDnd === 'true') return;
      row.dataset.managedCategoryDnd = 'true';
      row.setAttribute('draggable', 'true');

      const handle = row.querySelector<HTMLElement>('.category-drag-handle');
      if (handle) {
        handle.style.cursor = 'grab';
        handle.style.touchAction = 'none';
      }
    });
  });
}

function handleManagedCategoryDragStart(event: DragEvent) {
  const target = event.target as HTMLElement | null;
  const row = target?.closest<HTMLElement>('.category-row');
  const card = row?.closest<HTMLElement>('.category-table-card');
  if (!row || !card) return;

  const type = getManagedCategoryType(card);
  if (!type) return;

  managedCategoryDrag = { row, card, type };
  row.classList.add('dragging');
  event.dataTransfer?.setData('text/plain', getManagedCategoryRowLabel(row));
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function handleManagedCategoryDragEnter(event: DragEvent) {
  if (!managedCategoryDrag) return;
  const targetRow = (event.target as HTMLElement | null)?.closest<HTMLElement>('.category-row');
  if (!targetRow || targetRow === managedCategoryDrag.row) return;

  const targetCard = targetRow.closest<HTMLElement>('.category-table-card');
  if (targetCard !== managedCategoryDrag.card) return;

  event.preventDefault();
  const table = managedCategoryDrag.card.querySelector<HTMLElement>('.category-table');
  if (!table) return;

  const rows = Array.from(table.querySelectorAll<HTMLElement>('.category-row'));
  const fromIndex = rows.indexOf(managedCategoryDrag.row);
  const toIndex = rows.indexOf(targetRow);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

  if (fromIndex < toIndex) {
    table.insertBefore(managedCategoryDrag.row, targetRow.nextSibling);
  } else {
    table.insertBefore(managedCategoryDrag.row, targetRow);
  }
}

function finishManagedCategoryDrag(event?: DragEvent) {
  if (!managedCategoryDrag) return;
  event?.preventDefault();
  managedCategoryDrag.row.classList.remove('dragging');
  persistManagedCategoryOrder(managedCategoryDrag.card);
  managedCategoryDrag = null;
}

if (typeof window !== 'undefined') {
  if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual';
  }

  window.addEventListener('hashchange', () => {
    resetPageScroll();
    normalizeAssetRows();
    enhanceManagedCategoryRows();
  });

  document.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest('a[href^="#"]');
    if (link) {
      resetPageScroll();
      normalizeAssetRows();
      enhanceManagedCategoryRows();
    }
  }, true);

  document.addEventListener('dragstart', handleManagedCategoryDragStart, true);
  document.addEventListener('dragenter', handleManagedCategoryDragEnter, true);
  document.addEventListener('dragover', (event) => {
    if (managedCategoryDrag) event.preventDefault();
  }, true);
  document.addEventListener('drop', finishManagedCategoryDrag, true);
  document.addEventListener('dragend', finishManagedCategoryDrag, true);

  const observer = new MutationObserver(() => {
    normalizeAssetRows();
    enhanceManagedCategoryRows();
  });
  window.addEventListener('DOMContentLoaded', () => {
    normalizeAssetRows();
    enhanceManagedCategoryRows();
    const root = document.getElementById('root');
    if (root) {
      observer.observe(root, { childList: true, subtree: true });
    }
  });
}
