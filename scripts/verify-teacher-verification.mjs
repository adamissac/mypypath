// One-command integration check. Uses only disposable, local Firebase emulators:
// node scripts/verify-teacher-verification.mjs
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = await mkdtemp(join(tmpdir(), 'pypath-teacher-verification-'));
const projectId = 'demo-pypath-teacher-verification';
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
async function unusedPort() {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}

try {
  const [auth, firestore, hub, logging, websocketPort] = await Promise.all(Array.from({ length: 5 }, unusedPort));
  await writeFile(join(directory, 'firestore.rules'), await readFile(join(root, 'firestore.rules')));
  const config = join(directory, 'firebase.json');
  await writeFile(config, JSON.stringify({
    firestore: { rules: 'firestore.rules' },
    emulators: {
      auth: { host: '127.0.0.1', port: auth },
      firestore: { host: '127.0.0.1', port: firestore, websocketPort },
      hub: { host: '127.0.0.1', port: hub },
      logging: { host: '127.0.0.1', port: logging },
      ui: { enabled: false }, singleProjectMode: true,
    },
  }));
  const env = { ...process.env, GCLOUD_PROJECT: projectId, GOOGLE_CLOUD_PROJECT: projectId,
    METADATA_SERVER_DETECTION: 'none',
    PYPATH_VERIFICATION_TEST_PROJECT: projectId };
  // Never pass production credentials or an existing emulator address into this
  // disposable run. Firebase supplies the new addresses to the child command.
  for (const key of ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_TOKEN',
    'PYPATH_FIREBASE_SERVICE_ACCOUNT', 'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_EMULATOR_HUB']) delete env[key];
  const command = [process.execPath, '--test', join(root, 'tests/integration/teacher-verification-emulator.mjs')]
    .map(quote).join(' ');
  const child = spawn(process.execPath, [join(root, 'node_modules/firebase-tools/lib/bin/firebase.js'),
    'emulators:exec', '--only', 'auth,firestore', '--project', projectId, '--config', config, command],
  { cwd: directory, env, stdio: 'inherit' });
  const [code] = await once(child, 'exit');
  process.exitCode = code ?? 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}
