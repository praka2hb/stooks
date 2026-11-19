import { stocks } from './market-data.mjs';

export function marketPath(stock) {
  return stocks.some(entry => entry.id === stock) ? `/markets/${stock}/` : '/markets/';
}

export function coinPath(id) {
  const safeId = encodeURIComponent(id);
  return id.startsWith('demo-') ? `/coin/preview/?id=${safeId}` : `/coin/${safeId}/`;
}
