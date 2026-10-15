import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const [originValue, ownerUserId] = process.argv.slice(2);
if (process.argv.length !== 4) throw Error('Usage: node scripts/connect-shared-wallet.mjs <existing HTTPS web origin> <verified local user UUID>');
const origin = new URL(originValue);
if (origin.protocol !== 'https:' || origin.origin !== originValue ||
    !(origin.hostname === 'mywallet-8mx.pages.dev' || origin.hostname.endsWith('.mywallet-8mx.pages.dev')) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(ownerUserId)) throw Error('Invalid shared wallet connection');
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = join(root, '.android-tools');
const filename = join(directory, 'shared-wallet.json');
if (existsSync(filename)) throw Error('A shared wallet connection already exists. Inspect it before changing the ledger or backend.');
mkdirSync(directory, { recursive: true });
writeFileSync(filename, JSON.stringify({ origin: origin.origin, ownerUserId, ledgerId: randomUUID() }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
console.log('Local shared-wallet connection prepared. Restart android:server to apply it. No remote data was changed.');
