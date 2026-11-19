'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useDrafts } from '../lib/drafts';
import { stockById, stocks, originalCoins, rules, compactDollars } from '../lib/market-data.mjs';
import { coinPath, marketPath } from '../lib/routes.mjs';
import { Avatar, Delta, StockAvatar } from './market-ui';

function ageLabel(minutes) {
  if (!minutes) return 'Just now';
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

export function Markets({ stockFilter }) {
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState('volume');
  const drafts = useDrafts();
  const allCoins = [...drafts, ...originalCoins];
  const query = search.trim().toLowerCase();
  const coins = allCoins.filter(coin =>
    (!stockFilter || stockFilter === coin.stock) &&
    [coin.name, coin.symbol, coin.stock].some(field => field.toLowerCase().includes(query))
  );
  coins.sort((a, b) => order === 'new' ? a.age - b.age : b[order] - a[order]);

  return (
    <>
      <div className="app-heading">
        <div><h1>Markets</h1><p>Discover memes by the stock they trade against.</p></div>
        <Link href="/launch/" className="button button-primary">Launch a coin</Link>
      </div>
      <nav className="stock-rail" aria-label="Filter markets by stock">
        <Link className="stock-tile" href="/markets/" aria-current={!stockFilter || undefined}>
          <span className="stock-avatar stock-all" aria-hidden="true">▦</span><span><strong>All stocks</strong><small>{allCoins.length} markets</small></span>
        </Link>
        {stocks.map(stock => (
          <Link key={stock.id} className="stock-tile" href={marketPath(stock.id)} aria-current={stockFilter === stock.id || undefined}>
            <StockAvatar stock={stock} /><span><strong>{stock.id}</strong><small>{stock.name}</small></span><Delta value={stock.move} />
          </Link>
        ))}
      </nav>
      <section className="table-panel" aria-labelledby="market-table-title">
        <div className="table-tools">
          <div><h2 id="market-table-title">{stockFilter ? `${stockFilter} markets` : 'All markets'}</h2><span className="table-note">Sample data</span></div>
          <div className="table-controls">
            <label className="search-field"><span aria-hidden="true" /><input type="search" placeholder="Search coins" aria-label="Search coins" value={search} onChange={event => setSearch(event.target.value)} /></label>
            <label className="sort-field">
              <span className="sr-only">Sort markets</span>
              <select value={order} onChange={event => setOrder(event.target.value)}><option value="volume">24h volume</option><option value="new">Newest</option><option value="change">24h change</option><option value="cap">Market cap</option></select>
            </label>
          </div>
        </div>
        <div className="markets-table">
          {coins.length ? (
            <>
              <div className="market-table-head" aria-hidden="true"><span>Coin</span><span>Paired stock</span><span>24h change</span><span>Market cap</span><span>24h volume</span><span>Rules</span></div>
              {coins.map(coin => <MarketRow key={coin.id} coin={coin} />)}
            </>
          ) : <p className="empty-state" role="status">No coins match your search.</p>}
        </div>
      </section>
    </>
  );
}

function MarketRow({ coin }) {
  const ruleNames = coin.rules.filter(key => key !== 'snipe').slice(0, 2);
  const stock = stockById[coin.stock];
  return (
    <Link className="market-table-row" href={coinPath(coin.id)}>
      <span className="coin-identity"><Avatar coin={coin} /><span><strong>{coin.symbol}</strong><small>{coin.name} · {ageLabel(coin.age)}</small></span></span>
      <span className="paired-stock"><span className="pair-dot" />{stock.id}</span>
      <span><Delta value={coin.change} /></span><span className="monospace metric-cap">{compactDollars.format(coin.cap)}</span>
      <span className="monospace metric-volume">{compactDollars.format(coin.volume)}</span>
      <span className="row-rules">{ruleNames.length ? ruleNames.map(key => <span key={key} className="rule-tag">{rules[key].name}</span>) : '—'}</span>
    </Link>
  );
}
