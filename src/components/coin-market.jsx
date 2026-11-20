'use client';

import Link from 'next/link';
import { useState } from 'react';
import { compactDollars, defaultSettings, getFee, percent, rules, stockById, units } from '../lib/market-data.mjs';
import { marketPath } from '../lib/routes.mjs';
import { MarketChart } from './market-graphics';
import { Avatar, Delta, RuleIcon, Segmented } from './market-ui';

const chartRanges = ['1h', '24h', '7d'].map(range => [range, range]);
const sessions = [['open', 'Market open'], ['closed', 'Market closed']];
const swapOptions = [['buy', 'Buy'], ['sell', 'Sell']];
const redeemOptions = [...swapOptions, ['redeem', 'Redeem']];

function PriceChart({ coin, price, stock }) {
  const [range, setRange] = useState('24h');

  return (
    <section className="chart-panel" aria-labelledby="price-heading">
      <div className="chart-top">
        <div><h2 id="price-heading">Meme price</h2><div className="coin-price">${price.toFixed(6)} <Delta value={coin.change} /></div></div>
        {!coin.draft && <Segmented className="chart-ranges" label="Chart range" options={chartRanges} value={range} onChange={setRange} />}
      </div>
      {coin.draft
        ? <div className="chart-empty">Your demo market has no trades yet.</div>
        : <>
            <MarketChart coin={coin} range={range} expanded />
            <div className="chart-bottom"><span><i className="legend-meme" />{coin.symbol}</span><span><i className="legend-stock" />{stock.id}</span><span className="chart-caption">Illustrative trend · normalized</span></div>
          </>}
    </section>
  );
}

function ActiveRules({ coin, effects, session, setSession }) {
  return (
    <section className="fee-panel" aria-labelledby="active-rule-title">
      <div className="fee-heading">
        <div><h2 id="active-rule-title">Active rules</h2><p>Configured at launch</p></div>
        <Segmented className="coin-sessions" label="Market session" options={sessions} value={session} onChange={setSession} />
      </div>
      {coin.rules.map(id => (
        <div className="active-rule" key={id}>
          <RuleIcon rule={rules[id]} /><span><strong>{rules[id].name}</strong><small>{rules[id].description}</small></span><span>{effects[id]}</span>
        </div>
      ))}
    </section>
  );
}

function TradePreview({ coin, stock, fee, floor, price, hasVault }) {
  const [mode, setMode] = useState('sell');
  const [input, setInput] = useState('100000');
  const amount = Math.max(0, Number(input) || 0);
  const sold = amount * price / stock.price * (1 - fee / 100);
  const redeemed = amount * floor * coin.payout / 100;
  const bought = amount * stock.price / price * (1 - fee / 100);
  const isBuying = mode === 'buy';
  const output = isBuying ? bought : mode === 'redeem' ? redeemed : sold;

  function changeMode(next) {
    if (isBuying !== (next === 'buy')) setInput(next === 'buy' ? '0.1' : '100000');
    setMode(next);
  }

  return (
    <section className="trade-panel" aria-labelledby="trade-title">
      <div className="trade-heading"><h2 id="trade-title">Trade preview</h2><span className="demo-label">Demo</span></div>
      <Segmented className="trade-tabs" label="Trade action" options={hasVault ? redeemOptions : swapOptions} value={mode} onChange={changeMode} />
      <label className="form-field" htmlFor="trade-amount">You pay</label>
      <div className="field-unit"><input type="number" id="trade-amount" min="0" step="any" value={input} inputMode="decimal" onChange={event => setInput(event.target.value)} /><span>{isBuying ? stock.id : coin.symbol}</span></div>
      <div className="quote-summary" aria-live="polite">
        <span>Estimated output</span><strong>{units.format(output)} {isBuying ? coin.symbol : stock.id}</strong>
        <small>{mode === 'redeem' ? `${coin.payout}% of vault floor · Burns the meme` : `${fee.toFixed(2)}% example swap fee`}</small>
      </div>
      {hasVault && !isBuying && (
        <div className="quote-comparison">
          <div><span>Sell</span><strong>{units.format(sold)} {stock.id}</strong></div><div><span>Redeem</span><strong>{units.format(redeemed)} {stock.id}</strong></div>
        </div>
      )}
      <p className="preview-note trade-note">Example quotes using sample prices. Price impact and network fees are excluded.</p>
    </section>
  );
}

export function CoinMarket({ coin }) {
  const [session, setSession] = useState('open');
  const stock = stockById[coin.stock];
  const settings = {
    ...defaultSettings,
    bell: coin.rules.includes('bell'), shadow: coin.rules.includes('shadow'), floor: true, red: coin.rules.includes('red'),
    ...coin.settings,
  };
  const hasVault = coin.rules.includes('floor');
  const price = coin.cap / 1e9;
  const floor = coin.vault / 2.7e8;
  const fee = getFee(settings, stock, session);
  const effects = {
    bell: `${fee.toFixed(2)}% current fee`,
    floor: `${units.format(coin.vault)} ${stock.id}`,
    red: session === 'open' && stock.move <= -settings.redTrigger ? 'Boost active' : 'Boost inactive',
    shadow: session === 'closed' ? 'Paused after hours' : `${percent(stock.move)} stock move`,
    diamond: `${settings.minPayout ?? 50}% → 100% over ${settings.payoutDays ?? 30}d`,
    pass: `−${settings.passDiscount ?? 50}% for shareholders`,
    earnings: 'Reacts to the next earnings report',
  };

  return (
    <>
      <Link className="back-link" href={marketPath(stock.id)}>{stock.id} markets</Link>
      <div className="coin-page-title">
        <Avatar coin={coin} large /><div><h1>{coin.symbol} <span>/ {stock.id}</span></h1><p>{coin.name} · {stock.name} pair</p></div>
        <span className="demo-label">{coin.draft ? 'Demo launch saved' : 'Sample market'}</span>
      </div>
      <div className="coin-layout">
        <div className="coin-main">
          <PriceChart coin={coin} price={price} stock={stock} />
          <ActiveRules coin={coin} effects={effects} session={session} setSession={setSession} />
        </div>
        <aside className="coin-aside">
          <TradePreview coin={coin} stock={stock} fee={fee} floor={floor} price={price} hasVault={hasVault} />
          {hasVault && (
            <section className="vault-panel" aria-labelledby="vault-title">
              <h2 id="vault-title">Share vault</h2><div className="vault-value">{units.format(coin.vault)} <span>{stock.id}</span></div>
              <dl className="vault-metrics">
                <div><dt>Floor per 1M {coin.symbol}</dt><dd>{units.format(floor * 1e6)} {stock.id}</dd></div>
                <div><dt>Sample payout rate</dt><dd>{coin.payout}%</dd></div>
              </dl>
            </section>
          )}
          <section className="market-stats" aria-label="Coin statistics">
            <dl><div><dt>Market cap</dt><dd>{compactDollars.format(coin.cap)}</dd></div><div><dt>24h volume</dt><dd>{compactDollars.format(coin.volume)}</dd></div><div><dt>Stock move</dt><dd><Delta value={stock.move} /></dd></div></dl>
          </section>
        </aside>
      </div>
    </>
  );
}
