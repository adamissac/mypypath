import { describe, it, expect, vi } from 'vitest';
import { publicAddress, directoryUrl } from '../server/public-school-web.js';
import { createTeacherHandler, verificationView } from '../server/teacher-verification-service.js';
import handler from '../api/teacher-verification.js';

describe('directory request safety', () => {
  it.each(['127.0.0.1','10.0.0.1','172.16.0.1','192.168.0.1','169.254.169.254','0.0.0.0','100.64.0.1','224.0.0.1','::1','192.0.2.1'])('blocks %s', ip => expect(publicAddress(ip)).toBe(false));
  it('accepts a public address', () => expect(publicAddress('8.8.8.8')).toBe(true));
  it.each(['http://school.example/staff','https://school.example:8443/staff','https://school.example.evil.test/','https://user:secret@school.example/','https://127.0.0.1/'])('blocks unsafe URL %s', url => expect(()=>directoryUrl(url,['school.example'])).toThrow());
});
const time=100000000;
const user={uid:'teacher1',email:'ada@district.k12.ga.us',email_verified:true};
const profile={role:'teacher',firstName:'Ada',lastName:'Teacher'};
const verified={uid:user.uid,email:user.email,method:'official-directory-v1',status:'affiliation-verified-automatically',requestedAt:time-1000,expiresAt:time+1000};
function response(){return {setHeader:vi.fn(),status:vi.fn(function(code){this.code=code;return this}),json:vi.fn(function(body){this.body=body;return this})};}
function setup({identity=user,account=profile,record=null,tokenError=false}={}) {
  const paths=[];const store={['users/'+user.uid]:account,['teacherVerificationRequests/'+user.uid]:record};
  const db={doc:path=>{paths.push(path);return {get:async()=>({exists:!!store[path],data:()=>store[path]})}}};
  const auth={verifyIdToken:vi.fn(async()=>{if(tokenError)throw Error('revoked');return identity})};
  const checkTeacher=vi.fn(async options=>{store['teacherVerificationRequests/'+user.uid]={...verified,fullName:options.fullName}});
  const getServices=vi.fn(async()=>({auth,db}));
  const endpoint=createTeacherHandler({getServices,checkTeacher,now:()=>time});
  const request=(method='POST',body={action:'ensure'})=>({method,body,headers:{authorization:'Bearer test-token'}});
  return {endpoint,request,paths,checkTeacher,auth,getServices};
}
describe('automatic teacher API',()=>{
  it('rejects unauthenticated requests before touching backend credentials',async()=>{
    const x=setup(),res=response();await x.endpoint({method:'GET',headers:{}},res);
    expect(res.code).toBe(401);expect(x.getServices).not.toHaveBeenCalled();
  });
  it('rejects revoked tokens',async()=>{
    const x=setup({tokenError:true}),res=response();await x.endpoint(x.request(),res);
    expect(res.code).toBe(401);expect(x.auth.verifyIdToken).toHaveBeenCalledWith('test-token',true);expect(x.checkTeacher).not.toHaveBeenCalled();
  });
  it.each([{...user,email_verified:false}])('requires verified email',async identity=>{
    const x=setup({identity}),res=response();await x.endpoint(x.request(),res);expect(res.code).toBe(403);
  });
  it('rejects student accounts despite body claims',async()=>{
    const x=setup({account:{role:'student'}}),res=response();await x.endpoint(x.request(),res);expect(res.code).toBe(403);expect(x.checkTeacher).not.toHaveBeenCalled();
  });
  it('automatically uses server account identity, not a supplied email',async()=>{
    const x=setup(),res=response();await x.endpoint(x.request(),res);
    expect(res.code).toBe(200);expect(res.body.verified).toBe(true);
    expect(x.checkTeacher).toHaveBeenCalledWith(expect.objectContaining({uid:user.uid,email:user.email,fullName:'Ada Teacher'}));
  });
  it('rejects old manual review actions and identity injection',async()=>{
    for(const body of [{action:'review'},{action:'ensure',email:'other@example.test'},{action:'ensure',uid:'other'}]){
      const x=setup(),res=response();await x.endpoint(x.request('POST',body),res);expect(res.code).toBe(400);expect(x.checkTeacher).not.toHaveBeenCalled();
    }
  });
  it('reuses a current verification without scraping',async()=>{
    const x=setup({record:verified}),res=response();await x.endpoint(x.request(),res);expect(res.body.verified).toBe(true);expect(x.checkTeacher).not.toHaveBeenCalled();
  });
  it('rechecks an expired result',async()=>{
    const x=setup({record:{...verified,requestedAt:time-31*86400000,expiresAt:time-1}}),res=response();await x.endpoint(x.request(),res);expect(x.checkTeacher).toHaveBeenCalledOnce();
  });
  it('automatically retries a stale interrupted job',async()=>{
    const x=setup({record:{...verified,status:'checking',requestedAt:time-121000}}),res=response();await x.endpoint(x.request(),res);expect(x.checkTeacher).toHaveBeenCalledOnce();
  });
  it('does not duplicate an in-progress job',async()=>{
    const x=setup({record:{...verified,status:'checking',requestedAt:time-1000}}),res=response();await x.endpoint(x.request(),res);expect(x.checkTeacher).not.toHaveBeenCalled();expect(res.body.verified).toBe(false);
  });
  it('only reads the caller records, never an admin-wide queue',async()=>{
    const x=setup(),res=response();await x.endpoint(x.request('GET'),res);expect(x.paths).toEqual(['users/teacher1','teacherVerificationRequests/teacher1']);
  });
  it('invalidates old evidence when the account email changes',()=>{
    expect(verificationView(verified,{...user,email:'new@district.k12.ga.us'},profile,time)).toMatchObject({verified:false,status:'identity-changed',request:null});
  });
  it('rejects stale verified badges for role changes and expiry',()=>{
    expect(verificationView(verified,user,{role:'student'},time).verified).toBe(false);
    expect(verificationView({...verified,expiresAt:time},user,profile,time).verified).toBe(false);
  });
});
it('reports missing runtime configuration without exposing credentials',async()=>{
  vi.stubEnv('PYPATH_FIREBASE_SERVICE_ACCOUNT','');
  const res=response();await handler({method:'GET',headers:{authorization:'Bearer test'}},res);
  expect(res.code).toBe(503);expect(res.body.code).toBe('verification/config-missing');vi.unstubAllEnvs();
});
