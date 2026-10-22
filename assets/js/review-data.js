/* Lossless aggregate JSON reader; no external libraries or service. */
(() => {
  'use strict';
  let catalog;
  const dictionary = () => catalog || (catalog = fetch('data/review-dictionary.json').then(r => {
    if (!r.ok) throw new Error('Dicionário de dados indisponível.'); return r.json();
  }).catch(e => { catalog = null; throw e; }));
  function decode(value, dict) {
    if (!Array.isArray(value)) return value;
    const [tag, ...items] = value;
    if (tag === -1) return items.map(item => decode(item, dict));
    if (tag === -2) return dict.strings[items[0]];
    const keys = dict.schemas[tag];
    if (!keys || keys.length !== items.length) throw new Error('Dados agregados incompatíveis.');
    return Object.fromEntries(keys.map((key, i) => [key, decode(items[i], dict)]));
  }
  async function read(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Dados agregados indisponíveis.');
    const payload = await response.json();
    if (payload.format !== 'wash.review.compact.v1') return payload;
    return decode(payload.value, await dictionary());
  }
  window.WASH_REVIEW_DATA = Object.freeze({read, decode});
})();
