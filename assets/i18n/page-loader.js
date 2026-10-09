import { bindPageContent } from './page-content.js';

export function createPageLoader(document, fetchJson, pathname) {
  const route = pathname === '/' ? 'index.html' : pathname.replace(/^\//,'').replace(/\/$/,'/index.html');
  const page = route.endsWith('.html') ? route : route + '.html';
  let sourcePromise;
  let binding;
  return {
    async prepare(locale, allowPartial = false) {
      if (locale === 'en') return () => binding?.apply({});
      sourcePromise ||= fetchJson('/assets/i18n/pages/en/' + page + '.json').then(entries => {
        if (!Array.isArray(entries)) throw new Error('Invalid page source');
        binding = bindPageContent(document, entries);
        return entries;
      }).catch(error => { sourcePromise = null; throw error; });
      const [entries, translations] = await Promise.all([sourcePromise, fetchJson('/assets/i18n/pages/' + locale + '/' + page + '.json').catch(error=>{if(allowPartial)return {};throw error;})]);
      if (!translations || typeof translations !== 'object' || Array.isArray(translations) || (!allowPartial && entries.some(entry => !Array.isArray(translations[entry.key])))) throw new Error('Incomplete page translation');
      for (const entry of entries) {
        const parts=translations[entry.key];
        if (parts === undefined && allowPartial) continue;
        if (!Array.isArray(parts)) throw new Error('Invalid page translation');
        const refs=parts.filter(part=>typeof part!=='string');
        if(refs.length!==entry.tokens || new Set(refs.map(part=>part?.token)).size!==entry.tokens || refs.some(part=>!Number.isInteger(part?.token)||part.token<0||part.token>=entry.tokens)) throw new Error('Invalid translated inline tokens');
      }
      return () => binding.apply(translations,locale);
    }
  };
}
