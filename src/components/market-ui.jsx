import Link from 'next/link';
import { percent } from '../lib/market-data.mjs';
import stockList from '../lib/stock-list.json';
import { safeImage } from '../lib/coin-image';

const illustrations = new Set(['cat', 'rocket', 'goose', 'receipt']);

export function Brand() {
  return <Link className="wordmark" href="/" aria-label="Stooks home"><i className="brand-mark" aria-hidden="true" />Stooks</Link>;
}

export function Avatar({ coin, large = false }) {
  const image = safeImage(coin.image);
  if (image) return <img className={`avatar avatar-image${large ? ' large-avatar' : ''}`} src={image} alt="" aria-hidden="true" />;
  const art = illustrations.has(coin.art) ? coin.art : 'initial';
  return <span className={`avatar avatar-${art}${large ? ' large-avatar' : ''}`} aria-hidden="true">{art === 'initial' && coin.symbol.slice(0, 2)}</span>;
}

// Stock logos from each token's on-chain contractURI() metadata (see scripts/sync-stocks.mjs).
const stockIcons = Object.fromEntries(stockList.filter(s => s.icon).map(s => [s.id, s.icon]));

export function StockAvatar({ stock }) {
  const icon = stock.icon || stockIcons[stock.id];
  if (icon) return <img className="stock-avatar stock-logo" src={icon} alt="" aria-hidden="true" loading="lazy" decoding="async" />;
  return <span className="stock-avatar" style={{ '--stock-color': stock.color }} aria-hidden="true">{stock.id[0]}</span>;
}

export function Delta({ value }) {
  return <span className={`delta ${value < 0 ? 'negative' : value > 0 ? 'positive' : ''}`}>{percent(value)}</span>;
}

export function RuleIcon({ rule }) {
  return <span className="rule-icon" aria-hidden="true">{rule.mark}</span>;
}

export function Segmented({ label, options, value, onChange, className = '' }) {
  return (
    <div className={`segmented ${className}`} role="group" aria-label={label}>
      {options.map(([key, title]) => (
        <button type="button" key={key} aria-pressed={key === value} onClick={() => onChange(key)}>{title}</button>
      ))}
    </div>
  );
}
