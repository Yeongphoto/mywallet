const TOUCH_SORTABLE_STORAGE_KEY = 'mywallet:v2';

export {};

type CategoryScopeName = 'expense' | 'income' | 'asset';

type WalletData = {
  assets?: Array<{ id: string; [key: string]: unknown }>;
  categoryOrder?: Partial<Record<CategoryScopeName, string[]>>;
  updatedAt?: number;
  [key: string]: unknown;
};

type TouchSortKind = 'asset' | 'category';

type TouchSortState = {
  kind: TouchSortKind;
  pointerId: number;
  source: HTMLElement;
  list: HTMLElement;
  ghost: HTMLElement;
  offsetX: number;
  offsetY: number;
  target: HTMLElement | null;
};

type PendingTouchSort = {
  kind: TouchSortKind;
  pointerId: number;
  source: HTMLElement;
  list: HTMLElement;
  handle: HTMLElement;
  startX: number;
  startY: number;
  timer: number;
};

let touchSortState: TouchSortState | null = null;
let pendingTouchSort: PendingTouchSort | null = null;
let touchSortSaving = false;
const TOUCH_SORT_DELAY = 170;
const TOUCH_SORT_CANCEL_DISTANCE = 9;
const HANDLE_HIT_WIDTH = 18;
const HANDLE_HIT_HEIGHT = 28;

function readWalletData(): WalletData | null {
  try {
    const raw = window.localStorage.getItem(TOUCH_SORTABLE_STORAGE_KEY);
    return raw ? JSON.parse(raw) as WalletData : null;
  } catch {
    return null;
  }
}

function writeWalletData(data: WalletData) {
  window.localStorage.setItem(TOUCH_SORTABLE_STORAGE_KEY, JSON.stringify(data));
  if (touchSortSaving) return;

  touchSortSaving = true;
  window.fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => undefined).finally(() => {
    touchSortSaving = false;
  });
}

function makeGhost(source: HTMLElement, rect: DOMRect) {
  const ghost = source.cloneNode(true) as HTMLElement;
  ghost.classList.add('touch-sort-ghost');
  ghost.classList.remove('touch-sort-source');
  ghost.style.position = 'fixed';
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  ghost.style.pointerEvents = 'none';
  ghost.style.zIndex = '9999';
  ghost.style.boxSizing = 'border-box';
  document.body.appendChild(ghost);
  return ghost;
}

function getSortTarget(clientY: number, list: HTMLElement, source: HTMLElement) {
  const rows = Array.from(list.children).filter((child): child is HTMLElement => {
    if (!(child instanceof HTMLElement)) return false;
    if (child === source) return false;
    return child.classList.contains('asset-row') || child.classList.contains('category-row');
  });

  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) {
      return row;
    }
  }

  return null;
}

function autoScrollNearEdges(clientY: number) {
  const margin = 58;
  const speed = 7;
  const scrollTarget = document.querySelector<HTMLElement>('.content') ?? document.documentElement;
  if (clientY < margin) {
    scrollTarget.scrollBy({ top: -speed, behavior: 'auto' });
    window.scrollBy({ top: -speed, behavior: 'auto' });
  } else if (clientY > window.innerHeight - margin) {
    scrollTarget.scrollBy({ top: speed, behavior: 'auto' });
    window.scrollBy({ top: speed, behavior: 'auto' });
  }
}

function persistAssetOrder(list: HTMLElement) {
  const data = readWalletData();
  if (!data || !Array.isArray(data.assets)) return;

  const ids = Array.from(list.querySelectorAll<HTMLElement>('.asset-row'))
    .map((row) => row.dataset.assetId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;

  const assetMap = new Map(data.assets.map((asset) => [asset.id, asset]));
  const orderedAssets = ids.map((id) => assetMap.get(id)).filter((asset): asset is { id: string; [key: string]: unknown } => Boolean(asset));
  const remainingAssets = data.assets.filter((asset) => !ids.includes(asset.id));
  writeWalletData({ ...data, assets: [...orderedAssets, ...remainingAssets], updatedAt: Date.now() });
}

function persistCategoryOrder(list: HTMLElement) {
  const data = readWalletData();
  const card = list.closest<HTMLElement>('.managed-category-card');
  const scope = card?.dataset.categoryScope as CategoryScopeName | undefined;
  if (!data || !scope) return;

  const orderedIds = Array.from(list.querySelectorAll<HTMLElement>('.category-row'))
    .map((row) => row.dataset.categoryId)
    .filter((id): id is string => Boolean(id));
  if (orderedIds.length === 0) return;

  writeWalletData({
    ...data,
    categoryOrder: {
      ...(data.categoryOrder ?? {}),
      [scope]: orderedIds,
    },
    updatedAt: Date.now(),
  });
}

function getSortableFromHandle(handle: HTMLElement) {
  if (handle.closest('.category-color-menu, button, input, select, textarea')) return null;

  const categoryRow = handle.closest<HTMLElement>('.managed-category-card .category-row');
  if (categoryRow) {
    const list = categoryRow.closest<HTMLElement>('.category-table');
    if (list) return { kind: 'category' as const, source: categoryRow, list };
  }

  const assetRow = handle.closest<HTMLElement>('.asset-row');
  if (assetRow) {
    const list = assetRow.closest<HTMLElement>('.asset-table-list');
    if (list) return { kind: 'asset' as const, source: assetRow, list };
  }

  return null;
}

function isPreciseHandleHit(event: PointerEvent, handle: HTMLElement) {
  const rect = handle.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  return Math.abs(event.clientX - centerX) <= HANDLE_HIT_WIDTH / 2
    && Math.abs(event.clientY - centerY) <= HANDLE_HIT_HEIGHT / 2;
}

function activateTouchSort(pending: PendingTouchSort) {
  if (touchSortState || pendingTouchSort !== pending) return;

  const rect = pending.source.getBoundingClientRect();
  const ghost = makeGhost(pending.source, rect);

  pending.source.classList.add('touch-sort-source');
  pending.handle.style.cursor = 'grabbing';

  touchSortState = {
    kind: pending.kind,
    pointerId: pending.pointerId,
    source: pending.source,
    list: pending.list,
    ghost,
    offsetX: pending.startX - rect.left,
    offsetY: pending.startY - rect.top,
    target: null,
  };

  pendingTouchSort = null;
  document.body.classList.add('touch-sort-active');
  try { pending.handle.setPointerCapture(pending.pointerId); } catch { /* noop */ }
}

function cancelPendingTouchSort(event?: PointerEvent) {
  if (!pendingTouchSort) return;
  if (event && pendingTouchSort.pointerId !== event.pointerId) return;
  window.clearTimeout(pendingTouchSort.timer);
  pendingTouchSort = null;
}

function queueTouchSort(event: PointerEvent) {
  if (event.button !== 0) return;
  const handle = (event.target as HTMLElement | null)?.closest<HTMLElement>('.category-drag-handle, .asset-drag-handle');
  if (!handle) return;
  if (!isPreciseHandleHit(event, handle)) return;

  const sortable = getSortableFromHandle(handle);
  if (!sortable) return;

  cancelPendingTouchSort();
  const pending: PendingTouchSort = {
    ...sortable,
    pointerId: event.pointerId,
    handle,
    startX: event.clientX,
    startY: event.clientY,
    timer: 0,
  };
  pending.timer = window.setTimeout(() => activateTouchSort(pending), TOUCH_SORT_DELAY);
  pendingTouchSort = pending;
}

function moveTouchSort(event: PointerEvent) {
  if (pendingTouchSort && pendingTouchSort.pointerId === event.pointerId) {
    const moved = Math.hypot(event.clientX - pendingTouchSort.startX, event.clientY - pendingTouchSort.startY);
    if (moved > TOUCH_SORT_CANCEL_DISTANCE) {
      cancelPendingTouchSort(event);
    }
    return;
  }

  if (!touchSortState || touchSortState.pointerId !== event.pointerId) return;

  event.preventDefault();
  const { ghost, list, source, offsetX, offsetY } = touchSortState;
  ghost.style.left = `${event.clientX - offsetX}px`;
  ghost.style.top = `${event.clientY - offsetY}px`;
  autoScrollNearEdges(event.clientY);

  touchSortState.target = getSortTarget(event.clientY, list, source);
}

function finishTouchSort(event?: PointerEvent) {
  cancelPendingTouchSort(event);
  if (!touchSortState) return;
  if (event && touchSortState.pointerId !== event.pointerId) return;

  const { kind, source, list, ghost, target } = touchSortState;
  source.classList.remove('touch-sort-source');
  ghost.remove();
  document.body.classList.remove('touch-sort-active');

  if (target) {
    list.insertBefore(source, target);
  } else {
    list.appendChild(source);
  }

  if (kind === 'asset') {
    persistAssetOrder(list);
  } else {
    persistCategoryOrder(list);
  }

  touchSortState = null;
}

function prepareTouchSortableRows() {
  document.querySelectorAll<HTMLElement>('.asset-row, .managed-category-card .category-row').forEach((row) => {
    row.classList.add('touch-sortable-ready');
  });
}

if (typeof window !== 'undefined') {
  document.addEventListener('pointerdown', queueTouchSort, true);
  document.addEventListener('pointermove', moveTouchSort, true);
  document.addEventListener('pointerup', finishTouchSort, true);
  document.addEventListener('pointercancel', finishTouchSort, true);

  const observer = new MutationObserver(() => prepareTouchSortableRows());
  window.addEventListener('DOMContentLoaded', () => {
    prepareTouchSortableRows();
    const root = document.getElementById('root');
    if (root) observer.observe(root, { childList: true, subtree: true });
  });
  window.addEventListener('hashchange', () => window.requestAnimationFrame(prepareTouchSortableRows));
}
