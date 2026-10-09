export const azureLanguage = tag => ({ 'fa-AF': 'prs', 'zh-CN': 'zh-Hans' }[tag] || tag);

export async function translateBatch(texts, locale, { key, region, fetchImpl = fetch }) {
  const url = new URL('https://api.cognitive.microsofttranslator.com/translate');
  url.search = new URLSearchParams({'api-version':'3.0',from:'en',to:azureLanguage(locale),textType:'html'});
  const response = await fetchImpl(url, {
    method:'POST', redirect:'error', signal:AbortSignal.timeout(60000),
    headers:{'Content-Type':'application/json','Ocp-Apim-Subscription-Key':key,'Ocp-Apim-Subscription-Region':region},
    body:JSON.stringify(texts.map(Text=>({Text})))
  });
  if (!response.ok) {
    const error = new Error(`Translator HTTP ${response.status}; batch stopped without publishing partial output`);
    error.status = response.status;
    const retry = response.headers?.get('retry-after');
    const delay = /^\d+$/.test(retry || '') ? Number(retry)*1000 : Date.parse(retry || '')-Date.now();
    error.retryAfterMs = Number.isFinite(delay) ? Math.max(1000,delay) : 60000;
    throw error;
  }
  const result = await response.json();
  if (!Array.isArray(result) || result.length !== texts.length) throw new Error('Translator response length mismatch');
  return result.map(item => {
    const text = item.translations?.find(t=>t.to === azureLanguage(locale))?.text;
    if (typeof text !== 'string' || !text.trim()) throw new Error('Translator response missing text');
    return text;
  });
}

export function packBatches(entries, maxCharacters = 20000) {
  const batches = [];
  let batch = [], size = 0;
  for (const entry of entries) {
    const cost = Array.from(entry.source).length;
    if (cost > maxCharacters) throw new Error('Translation unit exceeds batch limit');
    if (size + cost > maxCharacters || batch.length >= 100) { batches.push(batch); batch = []; size = 0; }
    batch.push(entry); size += cost;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
