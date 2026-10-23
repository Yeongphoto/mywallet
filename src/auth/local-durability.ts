// Optional durability journal for the Android bundled guest ledger only.
// Never attach it to cloud caches or turn a local copy into a D1 authority.
type State = { id: string; revision: number; generation: string; values: Record<string,string>; hash: string };
type Controller = { storage: Storage; state: State; db: IDBDatabase };
let controller: Controller | null = null;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const activeKey = 'memoney:guest:active-id';
const prefix = (id: string) => `memoney:guest:${id}:`;
const generationKey = (id: string) => prefix(id) + 'recovery-generation';
const snapshotKey = (id: string, generation: string) => prefix(id) + 'mywallet:v2' + (generation === 'initial' ? '' : `:generation:${generation}`);
const generationOf = (id: string, values: Record<string,string>) => values[generationKey(id)] || 'initial';

export function guestDurabilityEnabled() { return controller !== null; }
export function guestValues(storage: Storage, id: string) {
  if (!uuid.test(id)) throw Error('LOCAL_STORAGE_INVALID');
  const values: Record<string,string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix(id))) { const value = storage.getItem(key); if (value !== null) values[key] = value; }
  }
  return Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));
}
function validate(id: string, values: Record<string,string>) {
  const generation = generationOf(id, values);
  if (!uuid.test(id) || generation !== 'initial' && !uuid.test(generation) ||
      Object.entries(values).some(([key, value]) => !key.startsWith(prefix(id)) || typeof value !== 'string')) throw Error('LOCAL_DURABILITY_CORRUPTED');
  const raw = values[snapshotKey(id, generation)];
  if (typeof raw !== 'string') throw Error('LOCAL_DURABILITY_CORRUPTED');
  const data = JSON.parse(raw);
  for (const field of ['transactions', 'assets', 'plans', 'recurringRules', 'deletedRecurringTxs']) {
    if (!Array.isArray(data[field])) throw Error('LOCAL_DURABILITY_CORRUPTED');
  }
  return generation;
}
async function digest(id: string, generation: string, values: Record<string,string>) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ id, generation, values })));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
}
export function durableWriteTransaction(db: IDBDatabase, stores: string | string[]): IDBTransaction {
  const tx = db.transaction(stores, 'readwrite', { durability: 'strict' });
  if (tx.durability !== 'strict') { tx.abort(); throw Error('LOCAL_DURABILITY_UNSUPPORTED'); }
  return tx;
}
function get<T>(db: IDBDatabase, store: string, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('memoney-guest-durability-v1', 1);
    request.onupgradeneeded = () => {
      for (const name of ['states', 'meta', 'displaced']) request.result.createObjectStore(name, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('LOCAL_DURABILITY_BLOCKED'));
  });
}
function commit(db: IDBDatabase, state: State, previous: State | null) {
  return new Promise<void>((resolve, reject) => {
    const tx = durableWriteTransaction(db, ['states', 'meta']);
    let conflict = false;
    const store = tx.objectStore('states'), request = store.get(state.id);
    request.onsuccess = () => {
      const current: State | undefined = request.result;
      if (previous ? !current || current.revision !== previous.revision || current.hash !== previous.hash : Boolean(current)) {
        conflict = true; tx.abort(); return;
      }
      try { store.put(state); tx.objectStore('meta').put({ id: 'active', guestId: state.id }); }
      catch { tx.abort(); }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(Error(conflict ? 'LOCAL_DURABILITY_CONFLICT' : 'LOCAL_DURABILITY_FAILED'));
    tx.onerror = () => { /* onabort reports the atomic failure. */ };
  });
}
async function preserveDisplaced(db: IDBDatabase, id: string, values: Record<string,string>, priorActiveId: string | null) {
  await new Promise<void>((resolve, reject) => {
    const tx = durableWriteTransaction(db, 'displaced');
    tx.objectStore('displaced').put({ id: crypto.randomUUID(), guestId: id, values, priorActiveId, createdAt: Date.now() });
    tx.oncomplete = () => resolve(); tx.onabort = () => reject(Error('LOCAL_DURABILITY_PRESERVATION_FAILED'));
  });
}
export async function initializeGuestDurability(storage = window.localStorage) {
  if (controller) return;
  if (!navigator.locks || !globalThis.indexedDB) throw Error('LOCAL_DURABILITY_UNSUPPORTED');
  await navigator.locks.request('memoney-local-durability:init', async () => {
    const db = await open();
    try {
      const meta = await get<{guestId:string}>(db, 'meta', 'active');
      const id = meta?.guestId || storage.getItem(activeKey) || crypto.randomUUID();
      if (!uuid.test(id)) throw Error('LOCAL_STORAGE_INVALID');
      await navigator.locks.request(`memoney-local:${id}`, async () => {
      let state = await get<State>(db, 'states', id);
      if (!state) {
        if (meta) throw Error('LOCAL_DURABILITY_CORRUPTED');
        const values = guestValues(storage, id), generation = generationOf(id, values), key = snapshotKey(id, generation);
        if (!values[key]) values[key] = JSON.stringify({ transactions: [], assets: [], plans: [], recurringRules: [], deletedRecurringTxs: [] });
        validate(id, values);
        state = { id, values, generation, revision: 1, hash: await digest(id, generation, values) };
        await commit(db, state, null);
      } else {
        const generation = validate(state.id, state.values);
        if (state.id !== id || state.generation !== generation || !Number.isSafeInteger(state.revision) || state.revision < 1 ||
            state.hash !== await digest(id, generation, state.values)) throw Error('LOCAL_DURABILITY_CORRUPTED');
        const existing = guestValues(storage, id);
        if (JSON.stringify(existing) !== JSON.stringify(state.values) || storage.getItem(activeKey) !== id) {
          // Keep an unconfirmed/newer-looking copy before restoring the last
          // acknowledged state. Do not merge by wall-clock time or row count.
          await preserveDisplaced(db, id, existing, storage.getItem(activeKey));
        }
      }
      for (const [key, value] of Object.entries(state.values)) storage.setItem(key, value);
      if (state.generation === 'initial') storage.removeItem(generationKey(id));
      storage.setItem(activeKey, id);
      controller = { storage, state, db };
      });
    } catch (error) { db.close(); throw error; }
  });
}
export async function checkpointGuest(id: string, storage = window.localStorage, allowGenerationChange = false) {
  const active = controller;
  if (!active || storage !== active.storage) return;
  if (id !== active.state.id || storage.getItem(activeKey) !== id) throw Error('LOCAL_DURABILITY_CONFLICT');
  const values = guestValues(storage, id), generation = validate(id, values);
  if (generation !== active.state.generation && !allowGenerationChange) throw Error('LOCAL_GENERATION_CHANGED');
  const hash = await digest(id, generation, values);
  if (hash === active.state.hash) {
    const current = await get<State>(active.db, 'states', id);
    if (!current || current.revision !== active.state.revision || current.hash !== hash) throw Error('LOCAL_DURABILITY_CONFLICT');
    return;
  }
  const next = { id, values, generation, hash, revision: active.state.revision + 1 };
  await commit(active.db, next, active.state);
  active.state = next;
}
export function persistGuestSnapshot(id: string, key: string, value: string, storage = window.localStorage) {
  const before = storage.getItem(key);
  storage.setItem(key, value);
  if (!controller || controller.storage !== storage) return;
  return checkpointGuest(id, storage).catch(error => {
    if (before === null) storage.removeItem(key); else storage.setItem(key, before);
    throw error;
  });
}
