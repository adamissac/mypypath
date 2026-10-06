import { describe, it, expect, vi } from 'vitest';
import { resolveInstitution, schoolNamespace } from '../server/institution-registry.js';
import { automaticTeacherCheck, nameMatches } from '../server/automatic-teacher-verification.js';
const school = { id: 'https://ror.org/012345678', status: 'active', types: ['education'], domains: ['school-mail.org'], links: [{ type: 'website', value: 'https://www.school-web.edu' }] };
describe('independent institution evidence', () => {
  it('does not trust a purchased domain or a self-published teacher listing', async () => {
    expect(await resolveInstitution({ email: 'owner@invented-school.org', lookup: async () => [] })).toBe(null);
    let record; const ref = { get: async () => ({ exists: !!record, data: () => record }) };
    const db = { doc: () => ref, runTransaction: async cb => cb({ get: r => r.get(), set: (_, d, o) => { record = o?.merge ? { ...record, ...d } : d; } }) };
    const fetchPage = vi.fn(async () => '<p>Example Person Teacher owner@invented-school.org</p>');
    const result = await automaticTeacherCheck({ db, uid: 'fixture', email: 'owner@invented-school.org', fullName: 'Example Person', fetchPage, resolveSchool: async () => null });
    expect(result.status).toBe('needs-information'); expect(fetchPage).not.toHaveBeenCalled();
  });
  it('resolves email subdomains to their district homepage', () => {
    expect(schoolNamespace('staff.district.k12.ga.us')).toBe('district.k12.ga.us');
    expect(schoolNamespace('district.k12.ga.us.evil.org')).toBe(null);
    expect(schoolNamespace('district.k12.zz.us')).toBe(null);
  });
  it('uses independent registry mapping for different email and website domains', async () => {
    const result = await resolveInstitution({ email: 'ada@staff.school-mail.org', lookup: async () => [school] });
    expect(result.homepage).toBe('https://www.school-web.edu/');
    expect(result.roots).toContain('school-mail.org');
  });
  it('lets teachers provide a real school directory when their email domain differs', async () => {
    expect((await resolveInstitution({ email: 'ada@different.org', directoryUrl: 'https://www.school-web.edu/staff/ada', lookup: async () => [school] })).id).toBe(school.id);
  });
  it.each([{ ...school, status: 'inactive' }, { ...school, types: ['company'] }, { ...school, domains: ['evil.org'], links: [] }])('does not trust irrelevant registry matches', async record => {
    expect(await resolveInstitution({ email: 'ada@school-mail.org', lookup: async () => [record] })).toBe(null);
  });
  it('rejects suffix lookalikes even if a search returns the real institution', async () => {
    expect(await resolveInstitution({ email: 'ada@school-mail.org.evil.org', lookup: async () => [school] })).toBe(null);
  });
  it('uses a website explicitly identified in an NCES record', async () => {
    const result = await resolveInstitution({ email: 'ada@different.org', directoryUrl: 'https://district.org/staff', registryUrl: 'https://nces.ed.gov/ccd/districtsearch/district_detail.asp?ID2=1234567', fetchPage: async () => '<table><tr><td>Website:</td><td><a href="https://district.org">District</a></td></tr></table>', lookup: async () => [] });
    expect(result.source).toBe('nces-directory');
  });
  it('refuses arbitrary registry URLs before fetching them', async () => {
    const fetchPage = vi.fn();
    await expect(resolveInstitution({ email: 'ada@district.org', registryUrl: 'https://evil.org/registry', fetchPage })).rejects.toMatchObject({ status: 400 });
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
describe('teacher name tolerance with exact email evidence', () => {
  it.each([['Dr. José M. García', 'Jose Garcia'], ['Lovelace, Ada', 'Ada Lovelace'], ['Ms. Ada Lovelace', 'Ada Lovelace'], ['A. Lovelace', 'Ada Lovelace'], ['Ada Lovelace Jr.', 'Ada Lovelace'], ['Li', 'Li']])('accepts formatting differences: %s', (a, b) => expect(nameMatches(a, b)).toBe(true));
  it('does not treat a single name as an abbreviation for a different name', () => {
    expect(nameMatches('Li', 'Lin')).toBe(false);
    expect(nameMatches('Li', 'Li Chen')).toBe(false);
  });
  it.each([['Ada Lovelace', 'Sam Lovelace'], ['Ada Lovelace', 'Ada Love'], ['Ada Marie Lovelace', 'Ada Jane Lovelace']])('does not combine different names: %s', (a, b) => expect(nameMatches(a, b)).toBe(false));
});
