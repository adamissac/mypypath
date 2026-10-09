import { describe, it, expect } from 'vitest';
import { packBatches, translateBatch } from '../scripts/lib/azure-translator.mjs';

describe('offline Azure adapter', () => {
  it('maps Dari to its supported Azure tag and preserves response order', async () => {
    const result=await translateBatch(['<div>One</div>','<div>Two</div>'],'fa-AF',{
      key:'test-only',region:'eastus',fetchImpl:async(url,options)=>{
        expect(url.origin).toBe('https://api.cognitive.microsofttranslator.com');
        expect(url.searchParams.get('to')).toBe('prs');
        expect(options.redirect).toBe('error');
        expect(JSON.parse(options.body)).toEqual([{Text:'<div>One</div>'},{Text:'<div>Two</div>'}]);
        return {ok:true,json:async()=>[{translations:[{to:'prs',text:'یک'}]},{translations:[{to:'prs',text:'دو'}]}]};
      }
    });
    expect(result).toEqual(['یک','دو']);
  });

  it('stops on quota errors without leaking provider error bodies', async () => {
    await expect(translateBatch(['x'],'fr',{key:'test',region:'eastus',fetchImpl:async()=>({ok:false,status:403})})).rejects.toThrow('HTTP 403');
  });

  it('does not accept an incomplete service response', async () => {
    await expect(translateBatch(['x'],'fr',{key:'test',region:'eastus',fetchImpl:async()=>({ok:true,json:async()=>[]})})).rejects.toThrow('length mismatch');
  });

  it('splits by both character count and entry count', () => {
    expect(packBatches([{source:'abc'},{source:'def'},{source:'g'}],6).map(batch=>batch.length)).toEqual([2,1]);
    expect(packBatches(Array.from({length:101},()=>({source:'a'}))).map(batch=>batch.length)).toEqual([100,1]);
    expect(()=>packBatches([{source:'toolong'}],3)).toThrow('limit');
  });
});
