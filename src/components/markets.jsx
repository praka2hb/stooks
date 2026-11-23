'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useDrafts } from '../lib/drafts';
import { isLive } from '../lib/chain';
import { loadCoins, useLoader } from '../lib/onchain';
import { compactDollars, originalCoins, rules, stockById, units } from '../lib/market-data.mjs';
import { coinPath } from '../lib/routes.mjs';
import { MarketChart } from './market-graphics';
import { Avatar, Delta, StockAvatar } from './market-ui';
import { safeImage } from '../lib/coin-image';

const tabs = [
  ['cap', 'Market cap'],
  ['volume', 'Volume'],
  ['new', 'New'],
  ['gainers', 'Gainers'],
  ['vault', 'Vault size'],
];

const sorters = {
  cap: (a, b) => b.cap - a.cap,
  volume: (a, b) => b.volume - a.volume,
  new: (a, b) => a.age - b.age,
  gainers: (a, b) => b.change - a.change,
  vault: (a, b) => b.vault - a.vault,
};

function ageLabel(minutes) {
  if (!minutes) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}

const stockOf = coin => coin.stockInfo ?? stockById[coin.stock] ?? { id: coin.stock, name: coin.stock };
const ruleNames = coin => coin.rules.filter(k => k !== 'floor').map(k => rules[k]?.name).filter(Boolean);

/** Live coins have no price history until an indexer exists, so they get a placeholder instead of a made-up line. */
function Spark({ coin, fill = false }) {
  if (coin.live || coin.draft) return <span className="spark-empty">No chart yet</span>;
  return <MarketChart coin={coin} fill={fill} />;
}

/** Big square art for trending cards: the coin's picture, or its ticker on the paired stock's colour. */
function CoinArt({ coin }) {
  const image = safeImage(coin.image);
  if (image) return <img className="coin-art coin-art-image" src={image} alt="" />;
  if (['cat', 'rocket', 'goose', 'receipt'].includes(coin.art)) return <span className={`coin-art avatar-${coin.art}`} />;
  return <span className="coin-art coin-art-initial" style={{ '--stock-color': stockOf(coin).color }}>{coin.symbol.slice(0, 4)}</span>;
}

function Trending({ coins }) {
  const rail = useRef(null);
  const scroll = dir => rail.current?.scrollBy({ left: dir * rail.current.clientWidth * 0.8, behavior: 'smooth' });
  if (!coins.length) return null;
  return (
    <section className="trending" aria-labelledby="trending-title">
      <div className="trending-head">
        <h2 id="trending-title">Trending</h2>
        <div className="rail-arrows">
          <button type="button" aria-label="Scroll trending left" onClick={() => scroll(-1)}><Chevron dir={-1} /></button>
          <button type="button" aria-label="Scroll trending right" onClick={() => scroll(1)}><Chevron dir={1} /></button>
        </div>
      </div>
      <div className="trending-rail" ref={rail}>
        {coins.map((coin, i) => (
          <Link key={coin.id} href={coinPath(coin.id)} className="trend-card">
            <CoinArt coin={coin} />
            <span className="trend-name"><b>{i + 1}</b>{coin.name}</span>
            <span className="trend-cap"><strong>{compactDollars.format(coin.cap)}</strong><Delta value={coin.change} /></span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function ListView({ coins }) {
  return (
    <div className="mk-list" role="table" aria-label="Coins">
      <div className="mk-row mk-head" role="row">
        <span role="columnheader">Coin</span><span role="columnheader">Backed by</span><span role="columnheader" className="mk-graph-col">Graph</span>
        <span role="columnheader">Vault</span><span role="columnheader">24h</span><span role="columnheader">Market cap</span>
      </div>
      {coins.map(coin => {
        const names = ruleNames(coin);
        return (
          <Link key={coin.id} href={coinPath(coin.id)} className="mk-row" role="row">
            <span className="mk-coin" role="cell">
              <Avatar coin={coin} />
              <span>
                <span className="mk-title"><strong>{coin.name}</strong><em>{coin.symbol}</em></span>
                <small>{ageLabel(coin.age)}{names.length ? ` · ${names.slice(0, 2).join(' · ')}` : ''}</small>
              </span>
            </span>
            <span className="mk-pair" role="cell"><StockAvatar stock={stockOf(coin)} />{coin.stock}</span>
            <span className="mk-graph mk-graph-col" role="cell"><Spark coin={coin} /></span>
            <span className="monospace" role="cell">{coin.vault ? <>{units.format(coin.vault)} <small className="mk-unit">{coin.stock}</small></> : '—'}</span>
            <span role="cell"><Delta value={coin.change} /></span>
            <span className="mk-cap" role="cell">{compactDollars.format(coin.cap)}</span>
          </Link>
        );
      })}
    </div>
  );
}

function GridView({ coins }) {
  return (
    <div className="mk-grid">
      {coins.map(coin => (
        <Link key={coin.id} href={coinPath(coin.id)} className="mk-card">
          <span className="mk-card-top">
            <Avatar coin={coin} />
            <span>
              <span className="mk-title"><strong>{coin.name}</strong><em>{coin.symbol}</em></span>
              <small><span className="mk-pair"><StockAvatar stock={stockOf(coin)} />{coin.stock}</span> · {ageLabel(coin.age)}</small>
            </span>
          </span>
          <span className="mk-card-graph"><Spark coin={coin} fill /></span>
          <span className="mk-card-foot">
            <span><small>Market cap <Delta value={coin.change} /></small><strong>{compactDollars.format(coin.cap)}</strong></span>
            <span><small>Vault · {coin.stock}</small><strong>{coin.vault ? units.format(coin.vault) : '—'}</strong></span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export function Markets({ stockFilter }) {
  const [tab, setTab] = useState('cap');
  const [view, setView] = useState('list');
  const [pair, setPair] = useState(stockFilter ?? '');
  const [search, setSearch] = useState('');
  const drafts = useDrafts();
  const live = useLoader(() => (isLive ? loadCoins() : Promise.resolve([])), [], isLive ? 15_000 : 0);
  const allCoins = isLive ? live.data ?? [] : [...drafts, ...originalCoins];

  const pairs = [...new Set(allCoins.map(c => c.stock))].sort();
  const query = search.trim().toLowerCase();
  const coins = allCoins
    .filter(c => !pair || c.stock === pair)
    .filter(c => !query || [c.name, c.symbol, c.stock].some(f => f.toLowerCase().includes(query)))
    .sort(sorters[tab]);
  const trending = [...allCoins].sort(sorters.volume).slice(0, 10);
  const status = isLive ? (live.loading && !live.data ? 'Loading from Base…' : live.error && !live.data ? 'Could not reach Base' : 'Live on Base') : 'Sample data';

  return (
    <div className="markets-page">
      <div className="mk-heading">
        <h1>Markets</h1>
        <Link href="/launch/" className="button button-primary button-large">Launch a coin</Link>
      </div>

      <Trending coins={trending} />

      <div className="mk-toolbar">
        <div className="mk-tabs" role="tablist" aria-label="Sort coins">
          {tabs.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
        <div className="mk-controls">
          <label className="mk-search"><span className="sr-only">Search coins</span><input type="search" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} /></label>
          <label className="mk-select">
            <span className="sr-only">Filter by stock</span>
            <select value={pair} onChange={e => setPair(e.target.value)}>
              <option value="">Any stock</option>
              {pairs.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <div className="mk-view" role="group" aria-label="Layout">
            <button type="button" aria-pressed={view === 'list'} aria-label="List view" onClick={() => setView('list')}><ListIcon /></button>
            <button type="button" aria-pressed={view === 'grid'} aria-label="Grid view" onClick={() => setView('grid')}><GridIcon /></button>
          </div>
        </div>
      </div>

      {coins.length
        ? (view === 'list' ? <ListView coins={coins} /> : <GridView coins={coins} />)
        : <p className="empty-state" role="status">{isLive && !allCoins.length ? (live.loading ? 'Loading coins…' : 'No coins launched yet. Be the first.') : 'No coins match.'}</p>}
      <p className="mk-note">{status}{!isLive && ' · these markets are examples for the demo'}</p>
    </div>
  );
}

function ListIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function GridIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden="true">{[[2, 2], [9, 2], [2, 9], [9, 9]].map(([x, y]) => <rect key={`${x}${y}`} x={x} y={y} width="5" height="5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />)}</svg>;
}

function Chevron({ dir }) {
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d={dir < 0 ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
