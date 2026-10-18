import { prepareSandbox } from './dev-sandbox.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
if (process.argv.slice(2).some(arg=>arg!=='--preview')) throw Error('Only --preview is accepted');
const { root, runtime } = prepareSandbox();
// Pages requires a standard configuration filename. Prepare only; never deploy,
// initialize DBs, copy private Android connection files, or change production here.
const config = JSON.parse(readFileSync(join(root, 'wrangler.android-data.json'), 'utf8'));
if (config.name !== 'mywallet' || config.vars.AUTH_ORIGIN !== 'https://mywallet-8mx.pages.dev' || config.vars.AUTH_ANDROID_DATA_COMPAT !== 'true') throw Error('Unexpected web deployment');
if (process.argv.includes('--preview')) config.vars.AUTH_ORIGIN = 'https://android-data.mywallet-8mx.pages.dev';
writeFileSync(join(runtime, 'wrangler.json'), JSON.stringify(config, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ runtime, action: 'prepared-only', databases: config.d1_databases.map(db => db.database_name) }));
