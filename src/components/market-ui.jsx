import Link from 'next/link';
import { percent } from '../lib/market-data.mjs';

const illustrations = new Set(['cat', 'rocket', 'goose', 'receipt']);

export function Brand() {
  return <Link className="wordmark" href="/" aria-label="StockHooks home"><i className="brand-mark" aria-hidden="true" />StockHooks</Link>;
}

export function Avatar({ coin, large = false }) {
  const art = illustrations.has(coin.art) ? coin.art : 'initial';
  return <span className={`avatar avatar-${art}${large ? ' large-avatar' : ''}`} aria-hidden="true">{art === 'initial' && coin.symbol.slice(0, 2)}</span>;
}

export function StockAvatar({ stock }) {
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
