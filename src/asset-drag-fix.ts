const ASSET_DRAG_STORAGE_KEY = 'mywallet:v2';

type AssetDragItem = {
  id: string;
  [key: string]: unknown;
};

type AssetDragWalletData = {
  assets?: AssetDragItem[];
  updatedAt?: number;
  [key: string]: unknown;
};

let assetPointerDrag: { row: HTMLElement; list: HTMLElement; pointerId: number } | null = null;
let assetOrderSaving = false;

function readAssetDragData(): AssetDragWalletData | null {
  try {
    const raw = window.localStorage.getItem(ASSET_DRAG_STORAGE_KEY);
    return raw ? JSON.parse(raw) as AssetDragWalletData : null;
  } catch {
    return null;
  }
}

function writeAssetDragData(data: AssetDragWalletData) {
  window.localStorage.setItem(ASSET_DRAG_STORAGE_KEY, JSON.stringify(data));
  if (assetOrderSaving) return;
  assetOrderSaving = true;
  window.fetch('/api/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => undefined).finally(() => {
    assetOrderSaving = false;
  });
}

function prepareAssetRows() {
  const data = readAssetDragData();
  const assets = Array.isArray(data?.assets) ? data.assets : [];

  document.querySelectorAll<HTMLElement>('.asset-table-list').forEach((list) => {
    Array.from(list.querySelectorAll<HTMLElement>(':scope > div')).forEach((row, index) => {
      const info = row.querySelector<HTMLElement>(':scope > div:first-child');
      const handle = info?.querySelector<HTMLElement>(':scope > span:first-child');
      if (!info || !handle) return;

      row.classList.add('asset-row');
      row.setAttribute('draggable', 'true');
      row.style.touchAction = 'none';
      if (!row.dataset.assetId && assets[index]?.id) {
        row.dataset.assetId = assets[index].id;
      }

      handle.classList.add('asset-drag-handle');
      handle.setAttribute('role', 'button');
      handle.setAttribute('aria-label', '자산 순서 이동');
      handle.style.cursor = 'grab';
      handle.style.touchAction = 'none';
      handle.style.setProperty('-webkit-user-drag', 'element');
    });
  });
}

function saveAssetDomOrder(list: HTMLElement) {
  const data = readAssetDragData();
  if (!data || !Array.isArray(data.assets)) return;

  const ids = Array.from(list.querySelectorAll<HTMLElement>('.asset-row'))
    .map((row) => row.dataset.assetId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;

  const assetMap = new Map(data.assets.map((asset) => [asset.id, asset]));
  const orderedAssets = ids.map((id) => assetMap.get(id)).filter((asset): asset is AssetDragItem => Boolean(asset));
  const remainingAssets = data.assets.filter((asset) => !ids.includes(asset.id));

  writeAssetDragData({ ...data, assets: [...orderedAssets, ...remainingAssets], updatedAt: Date.now() });
}

function startAssetPointerDrag(event: PointerEvent) {
  const handle = (event.target as HTMLElement | null)?.closest<HTMLElement>('.asset-drag-handle');
  if (!handle) return;
  const row = handle.closest<HTMLElement>('.asset-row');
  const list = row?.closest<HTMLElement>('.asset-table-list');
  if (!row || !list) return;
  if (row.dataset.assetId) return;

  assetPointerDrag = { row, list, pointerId: event.pointerId };
  row.classList.add('dragging');
  handle.style.cursor = 'grabbing';
  event.preventDefault();
  try { handle.setPointerCapture(event.pointerId); } catch { /* noop */ }
}

function moveAssetPointerDrag(event: PointerEvent) {
  if (!assetPointerDrag || assetPointerDrag.pointerId !== event.pointerId) return;
  const { row, list } = assetPointerDrag;
  const targetRow = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>('.asset-row');
  if (!targetRow || targetRow === row || targetRow.closest('.asset-table-list') !== list) return;

  event.preventDefault();
  const rows = Array.from(list.querySelectorAll<HTMLElement>('.asset-row'));
  const fromIndex = rows.indexOf(row);
  const toIndex = rows.indexOf(targetRow);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;

  if (fromIndex < toIndex) list.insertBefore(row, targetRow.nextSibling);
  else list.insertBefore(row, targetRow);
}

function finishAssetPointerDrag(event?: PointerEvent) {
  if (!assetPointerDrag) return;
  if (event && assetPointerDrag.pointerId !== event.pointerId) return;
  const { row, list } = assetPointerDrag;
  row.classList.remove('dragging');
  row.querySelector<HTMLElement>('.asset-drag-handle')?.style.setProperty('cursor', 'grab');
  saveAssetDomOrder(list);
  assetPointerDrag = null;
}

if (typeof window !== 'undefined') {
  document.addEventListener('pointerdown', startAssetPointerDrag, true);
  document.addEventListener('pointermove', moveAssetPointerDrag, true);
  document.addEventListener('pointerup', finishAssetPointerDrag, true);
  document.addEventListener('pointercancel', finishAssetPointerDrag, true);

  const observer = new MutationObserver(() => prepareAssetRows());
  window.addEventListener('DOMContentLoaded', () => {
    prepareAssetRows();
    const root = document.getElementById('root');
    if (root) observer.observe(root, { childList: true, subtree: true });
  });
  window.addEventListener('hashchange', () => window.requestAnimationFrame(prepareAssetRows));
}
