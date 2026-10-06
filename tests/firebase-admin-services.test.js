import { describe, it, expect } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseServiceAccount } from '../server/firebase-admin-services.js';
const key = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
const account = { project_id: 'mypypath', client_email: 'fixture@mypypath.iam.gserviceaccount.com', private_key: key };
describe('server credential parsing', () => {
  it('loads server SDKs when the runtime disables require(ESM)', () => {
    expect(() => execFileSync(process.execPath, ['--no-experimental-require-module', '--input-type=module', '-e', "await import('firebase-admin/auth'); await import('firebase-admin/firestore');"], { stdio: 'pipe' })).not.toThrow();
  });
  it('accepts normal and double-encoded JSON and escaped PEM newlines', () => {
    for (const input of [JSON.stringify(account), JSON.stringify(JSON.stringify(account)), JSON.stringify({ ...account, private_key: key.replace(/\n/g, '\\n') })]) {
      expect(parseServiceAccount(input).private_key).toBe(key);
    }
  });
  it.each([
    ['', 'missing'], ['secret-invalid', 'json'], [JSON.stringify({ ...account, project_id: 'other' }), 'project'],
    [JSON.stringify({ project_id: 'mypypath' }), 'fields'], [JSON.stringify({ ...account, private_key: 'secret-invalid' }), 'key'],
  ])('returns a safe configuration category', (input, category) => {
    try { parseServiceAccount(input); throw Error('should reject'); }
    catch (error) { expect(error.publicCode).toBe('verification/config-' + category); expect(error.message).not.toContain('secret-invalid'); }
  });
});
