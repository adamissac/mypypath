/* Bundle entry: the scene plus its data. scripts/build-summit.mjs replaces
   __SUMMIT_MODEL_URL__ with the model's URL at its content hash. */
import meta from './scene-meta.json';
import { mount } from './main.js';

export { entrancePlan, qualifies } from './main.js';

export function mountSummit(host, opts = {}) {
  // eslint-disable-next-line no-undef
  return mount(host, { modelUrl: __SUMMIT_MODEL_URL__, meta, ...opts });
}
