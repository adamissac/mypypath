// Called inside firebase emulators:exec by npm run test:teacher.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'], {
  cwd: root, stdio: ['ignore', 'pipe', 'ignore'],
});
try {
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local test server did not start')), 10000);
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Local server exited: ${code}`)); });
    server.stdout.on('data', chunk => {
      const match = String(chunk).match(/port (\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const test = spawn(process.execPath, ['tests/browser/teacher-actions.mjs'], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, PYPATH_TEST_BASE: `http://127.0.0.1:${port}` },
  });
  const [code] = await once(test, 'exit');
  process.exitCode = code ?? 1;
} finally {
  server.kill();
}
