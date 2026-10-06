import { describe, it, expect, vi } from 'vitest';
import { institutionalHost, teacherEvidence, directoryLinks, automaticTeacherCheck } from '../server/automatic-teacher-verification.js';

describe('automatic affiliation verification', () => {
  it('accepts supported institutional domains, not personal or lookalike domains', () => {
    expect(institutionalHost('ada@district.k12.ga.us')).toBe('district.k12.ga.us');
    for (const email of ['ada@gmail.com','ada@district.com','ada@district.k12.ga.us.evil.com','ada@district.k12.zz.us']) expect(institutionalHost(email)).toBe(null);
    expect(institutionalHost('ada@university.edu')).toBe('university.edu');
    expect(institutionalHost('ada@district.org')).toBe('district.org');
    expect(institutionalHost('ada@academy.school')).toBe('academy.school');
  });
  it('requires matching name, exact email and teaching role in nearby visible text', () => {
    expect(teacherEvidence('<p>Ada Lovelace — Teacher — ada@district.k12.ga.us</p>','Ada Lovelace','ada@district.k12.ga.us')).toBe(true);
    expect(teacherEvidence('<p>Ada Lovelace — ada@district.k12.ga.us</p>','Ada Lovelace','ada@district.k12.ga.us')).toBe(false);
    expect(teacherEvidence('<script>Ada Lovelace Teacher ada@district.k12.ga.us</script>','Ada Lovelace','ada@district.k12.ga.us')).toBe(false);
    expect(teacherEvidence('Ada Lovelace Teacher notada@district.k12.ga.us','Ada Lovelace','ada@district.k12.ga.us')).toBe(false);
  });
  it.each([
    '<div><p>Ada Lovelace — Teacher</p><p>Sam Student — student@district.k12.ga.us</p></div>',
    '<div><h2>Contact a teacher</h2><p>Sam Student — student@district.k12.ga.us</p></div>',
    '<article><p>Ada Lovelace — Teacher</p><p>Sam Student — student@district.k12.ga.us</p></article>',
    '<article><p>Ada Lovelace</p><p>Teacher</p><p>Sam Student</p><p>student@district.k12.ga.us</p></article>',
    '<article><h3>Ada Lovelace</h3><p>Teacher</p><h3>Sam Student</h3><p>student@district.k12.ga.us</p></article>',
    '<p>Sam Student student@district.k12.ga.us; Ada Lovelace Teacher</p>',
    '<p>Sam Student — Student, not a teacher — student@district.k12.ga.us</p>',
    '<p>Sam Student — Parent Teacher Association — student@district.k12.ga.us</p>',
  ])('does not combine adjacent people or non-teaching text: %s', html => {
    expect(teacherEvidence(html, 'Sam Student', 'student@district.k12.ga.us')).toBe(false);
  });
  it('reads nested staff-card fields and mailto addresses with decoded entities', () => {
    const html = '<div class="staff-directory"><div class="staff-card"><div class="name">Ada &amp; Lovelace</div><div class="role">Computer Science Teacher</div><div class="email"><a href="mailto:ada&#64;district.k12.ga.us?subject=Hello">Email</a></div></div></div>';
    expect(teacherEvidence(html, 'Ada & Lovelace', 'ada@district.k12.ga.us')).toBe(true);
  });
  it('accepts a mailto link in a simple paragraph and deduplicates its visible email', () => {
    for (const label of ['Email', 'ada@district.k12.ga.us']) {
      const html = `<p>Ada Lovelace — Teacher — <a href="mailto:ada@district.k12.ga.us">${label}</a></p>`;
      expect(teacherEvidence(html, 'Ada Lovelace', 'ada@district.k12.ga.us')).toBe(true);
    }
  });
  it('accepts an individual structured staff row', () => {
    expect(teacherEvidence('<table><tr><td>Ada Lovelace</td><td>Math Teacher</td><td><a href="mailto:ada@district.k12.ga.us">Email</a></td></tr></table>', 'Ada Lovelace', 'ada@district.k12.ga.us')).toBe(true);
  });
  it('rejects multiple identities and hidden role evidence', () => {
    const row = '<article><h3>Ada Lovelace</h3><p>Teacher</p><a href="mailto:ada@district.k12.ga.us">Email</a><a href="mailto:other@district.k12.ga.us">Other</a></article>';
    expect(teacherEvidence(row, 'Ada Lovelace', 'ada@district.k12.ga.us')).toBe(false);
    for (const attribute of ['hidden', 'aria-hidden="true"', 'style="display: none"']) {
      expect(teacherEvidence(`<article><h3>Ada Lovelace</h3><p ${attribute}>Teacher</p><a href="mailto:ada@district.k12.ga.us">Email</a></article>`, 'Ada Lovelace', 'ada@district.k12.ga.us')).toBe(false);
    }
  });
  it('does not mistake the surname Teacher for a teaching role', () => {
    expect(teacherEvidence('<article><h3>Ada Teacher</h3><a href="mailto:ada@district.k12.ga.us">Email</a></article>', 'Ada Teacher', 'ada@district.k12.ga.us')).toBe(false);
  });
  it('rejects mixed nested cards even when one person has no email', () => {
    expect(teacherEvidence('<article><div class="staff-card"><h3>Ada Lovelace</h3><p>Teacher</p></div><div class="staff-card"><h3>Sam Student</h3><a href="mailto:student@district.k12.ga.us">Email</a></div></article>', 'Sam Student', 'student@district.k12.ga.us')).toBe(false);
  });
  it('discovers decoded directory links on the explicit root/www host pair only', () => {
    const html = '<a href="https://www.district.k12.ga.us/staff?view=a&amp;page=1#names">Staff</a><a href="/directory">Directory</a><a href="http://district.k12.ga.us/staff">Staff</a><a href="https://district.k12.ga.us:8443/staff">Staff</a><a href="https://evil.district.k12.ga.us/staff">Staff</a>';
    expect(directoryLinks(html, 'https://district.k12.ga.us/')).toEqual(['https://www.district.k12.ga.us/staff?view=a&page=1', 'https://district.k12.ga.us/directory']);
    expect(directoryLinks(html, 'https://district.k12.ga.us/', ['district.k12.ga.us'])).toEqual(['https://district.k12.ga.us/directory']);
  });
  it('discovers directory links only on the official email-domain website', () => {
    expect(directoryLinks('<a href="/staff">Staff</a><a href="https://evil.test/staff">Directory</a><a href="javascript:alert(1)">Faculty</a>', 'https://district.k12.ga.us/')).toEqual(['https://district.k12.ga.us/staff']);
  });
  function dbMock() {
    const writes=[]; let record=null;
    const ref={get:async()=>({exists:!!record,data:()=>record})};
    return {writes,db:{doc:()=>ref,runTransaction:async cb=>cb({get:r=>r.get(),set:(_r,d,options)=>{record=options?.merge?{...record,...d}:d;writes.push(d)}})}};
  }
  it('automatically verifies a matching directory listing with no operator review', async () => {
    const {db,writes}=dbMock();
    const fetchPage=vi.fn().mockResolvedValueOnce('<a href="/staff">Staff directory</a>').mockResolvedValueOnce('<p>Ada Lovelace Teacher ada@district.k12.ga.us</p>');
    const result=await automaticTeacherCheck({db,uid:'t1',email:'ada@district.k12.ga.us',fullName:'Ada Lovelace',fetchPage,now:1000});
    expect(result.status).toBe('affiliation-verified-automatically');
    expect(result.expiresAt).toBe(1000+30*86400000);
    expect(result.schoolAuthorization).toBe(false);
    expect(fetchPage.mock.calls.map(c=>c[0])).toEqual(['https://district.k12.ga.us/','https://district.k12.ga.us/staff']);
    expect(writes).toHaveLength(2);
  });
  it('fails closed on source errors and does not queue a human approval', async () => {
    const {db}=dbMock();
    const result=await automaticTeacherCheck({db,uid:'t1',email:'ada@district.k12.ga.us',fullName:'Ada Lovelace',fetchPage:async()=>{throw Error('unreachable')}});
    expect(result.status).toBe('source-unavailable');
    expect(result.schoolAuthorization).toBe(false);
  });
});
