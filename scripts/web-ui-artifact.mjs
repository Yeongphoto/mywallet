import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
const directory = join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'Memoney', 'web-ui-checks', String(process.pid));
export function webUiArtifact(name) {
  if (name.includes('/') || name.includes('\\')) throw Error('Artifact name must be a filename');
  mkdirSync(directory, { recursive: true });
  return join(directory, name);
}
