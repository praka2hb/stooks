'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { decodeEventLog, parseUnits } from 'viem';
import { abis, config, ensureAllowance, isLive, knownStocks, publicClient, write } from '../lib/chain';
import { loadStock } from '../lib/onchain';
import { compressImage } from '../lib/coin-image';
import { saveDraft } from '../lib/drafts';
import { dexPrice } from '../lib/stock-prices';
import { MAX_RULES, defaultSettings, dollars, getFee, getFeeSplit, optionalRules, rules, sessionOptions, allStocks, stockById } from '../lib/market-data.mjs';
import { coinPath } from '../lib/routes.mjs';
import { RuleIcon, Segmented, StockAvatar } from './market-ui';

// Live: every Coinbase stock the factory allowlists (feed stocks first, then by tokens in circulation).
const liveStocks = Object.values(knownStocks).map(s => ({ ...s, price: 0, move: 0 }));
const stockChoices = isLive ? liveStocks : allStocks;
const SHOWN = 12;
// Rules that read an on-chain price: only stocks with a Chainlink feed can use them.
const FEED_RULES = ['shadow', 'red', 'earnings'];

// Dev buy, mirrored from StockHooksFactory: the first curve band holds 10% of supply between the opening FDV and
// 1.0001^16000 times it, the launcher may buy at most 5% of supply, and the buy pays the normal 1.5% fee.
const BAND1_TOP = Math.exp(16000 * Math.log(1.0001));
const DEV_FEE = 0.015;
const MAX_DEV_SHARE = 0.05;
/** Share of supply (0-1) a dev buy of `usd` gets at opening FDV `cap`. */
function devBuyShare(usd, cap) {
  if (!(usd > 0) || !(cap > 0)) return 0;
  const sa = Math.sqrt(cap), sb = Math.sqrt(cap * BAND1_TOP);
  const L = 0.1 / (1 / sa - 1 / sb);
  const sp = sa + (usd * (1 - DEV_FEE)) / L;
  return L * (1 / sa - 1 / sp);
}
/** Largest dev buy in USD, kept just under the contract's 5% so rounding never trips DevBuyTooLarge. */
function maxDevBuyUsd(cap) {
  const sa = Math.sqrt(cap), sb = Math.sqrt(cap * BAND1_TOP);
  const L = 0.1 / (1 / sa - 1 / sb);
  const sp = 1 / (1 / sa - (MAX_DEV_SHARE * 0.98) / L);
  return Math.floor((L * (sp - sa)) / (1 - DEV_FEE));
}

function searchStocks(query, selected) {
  const q = query.trim().toLowerCase();
  const hits = q ? stockChoices.filter(s => s.id.toLowerCase().startsWith(q) || s.name.toLowerCase().includes(q)) : stockChoices;
  const shown = hits.slice(0, SHOWN);
  if (!q && selected && !shown.includes(selected)) shown[shown.length - 1] = selected;
  return { shown, more: hits.length - shown.length };
}

function NumberParameter({ name, label, settings, update, min, max, step = 1, disabled }) {
  return (
    <label>
      {label}
      <input
        type="number" name={name} defaultValue={settings[name]} min={min} max={max} step={step}
        disabled={disabled} required
        onChange={event => {
          const { value, valueAsNumber, validity } = event.target;
          update(name, value !== '' && validity.valid ? valueAsNumber : defaultSettings[name]);
        }}
      />
    </label>
  );
}

function RuleParameters({ id, settings, update, disabled }) {
  const n = (name, label, min, max, step) => <NumberParameter name={name} label={label} settings={settings} update={update} min={min} max={max} step={step} disabled={disabled} />;
  return (
    <div className="rule-parameters" hidden={disabled}>
      {id === 'diamond' && <>{n('minPayout', 'Day-one payout (%)', 30, 95)}{n('payoutDays', 'Days to 100%', 1, 90)}</>}
      {id === 'shadow' && <>{n('sensitivity', 'Fee change per 1% move (bps)', 5, 50)}{n('maxShift', 'Max fee change (%)', 0.25, 1.5, 0.05)}</>}
      {id === 'bell' && <>{n('openFee', 'Market open fee (%)', 0.75, 2, 0.05)}{n('closeFee', 'Market closed fee (%)', 0.75, 3, 0.05)}</>}
      {id === 'red' && <>{n('redTrigger', 'Stock drop that triggers it (%)', 1, 10, 0.1)}{n('redBoost', 'Extra vault share (% of fee)', 10, 25)}</>}
      {id === 'pass' && <>{n('minShares', 'Shares a wallet must hold', 0.1, 100, 0.1)}{n('passDiscount', 'Fee discount (%)', 25, 75)}</>}
      {id === 'earnings' && <>{n('beatDays', 'Stock up: 100% payout window (days)', 1, 14)}{n('missBurn', 'Stock down: vault spent on buyback (%)', 5, 30)}</>}
    </div>
  );
}

function LaunchPreview({ name, symbol, image, stock, cap, devBuy, session, setSession, settings, feedback, busy, count }) {
  const devShare = devBuyShare(Number(devBuy), Number(cap));
  const feeSplit = getFeeSplit(settings, stock, session);
  const split = [
    { label: 'Coin’s share vault', value: feeSplit.vault, color: 'blue' },
    { label: 'Platform basket', value: feeSplit.platform, color: 'mist' },
  ];
  return (
    <aside className="launch-preview">
      <section className="preview-panel" aria-labelledby="preview-title">
        <div className="preview-panel-header"><span className="experience-dot" /><h2 id="preview-title">Launch preview</h2></div>
        <div className="preview-coin">
          {image ? <img className="preview-avatar" src={image} alt="" /> : <div className="preview-avatar">{symbol.slice(0, 2) || name.slice(0, 1).toUpperCase() || '?'}</div>}
          <div><strong>{symbol || name || 'Your coin'}</strong><span>Paired with {stock.id}</span></div>
        </div>
        <div className="preview-line"><span>Opening FDV</span><strong>{cap ? dollars.format(Number(cap)) : '—'}</strong></div>
        <div className="preview-line"><span>Dev buy</span><strong>{devShare ? `${dollars.format(Number(devBuy))} · ${(devShare * 100).toFixed(2)}% of supply` : 'None'}</strong></div>
        <div className="preview-line"><span>Rules picked</span><strong>{count} of {MAX_RULES}</strong></div>
        <div className="preview-session">
          <span>Market session</span><Segmented label="Market session" options={sessionOptions} value={session} onChange={setSession} />
        </div>
        <div className="preview-fees">
          <span>Trading fee</span><strong id="preview-fee" aria-live="polite">{getFee(settings, stock, session).toFixed(2)}%</strong>
          <small>Always taken in {stock.id}. The launcher earns no fees.</small>
        </div>
        <section className="split-section">
          <h3>Fee split</h3>
          <div className="split-bar" aria-hidden="true">{split.map(({ color, value }) => <span key={color} className={`split-${color}`} style={{ width: `${value}%` }} />)}</div>
          <dl className="split-legend">
            {split.map(({ label, color, value }) => <div key={label}><dt><i className={`split-${color}`} />{label}</dt><dd>{value}%</dd></div>)}
          </dl>
        </section>
        <button className="button button-primary full-button" type="submit" disabled={busy}>{busy ? 'Launching…' : isLive ? 'Launch on Base' : 'Save demo launch'}</button>
        <p className="preview-note">{isLive ? 'One transaction. Supply goes into a Uniswap v4 pool, locked forever. Rules lock on-chain. Buys in the first 5 minutes pay a sniper fee, from 25% down to normal, and it all goes to the vault.' : 'Demo mode: saves in this browser. No wallet needed.'}</p>
        <p id="launch-feedback" role="status">{feedback}</p>
      </section>
    </aside>
  );
}

/** Builder settings → StockHooksFactory.RuleParams (bps, seconds, raw stock units). */
function toRuleParams(s, stockDecimals) {
  const bps = x => Math.round(x * 100);
  return {
    redeemOpenAfter: 3600,
    diamond: s.diamond, minPayoutBps: s.diamond ? bps(s.minPayout) : 0, fullAfter: s.diamond ? s.payoutDays * 86400 : 0,
    shadowPeg: s.shadow, sensitivity: s.shadow ? s.sensitivity : 0, maxShift: s.shadow ? bps(s.maxShift) : 0,
    bellMode: s.bell, openFeeBps: s.bell ? bps(s.openFee) : 0, closedFeeBps: s.bell ? bps(s.closeFee) : 0, bellBonusBps: s.bell ? 1000 : 0,
    redDay: s.red, triggerBps: s.red ? bps(s.redTrigger) : 0, boostBps: s.red ? bps(s.redBoost) : 0,
    shareholderPass: s.pass, minShares: s.pass ? parseUnits(String(s.minShares), stockDecimals) : 0n, discountBps: s.pass ? bps(s.passDiscount) : 0,
    earnings: s.earnings, beatPayoutDays: s.earnings ? s.beatDays : 0, missBurnBps: s.earnings ? bps(s.missBurn) : 0, earningsRepeat: s.earnings,
  };
}

export function LaunchBuilder() {
  const router = useRouter();
  const [stockId, setStockId] = useState(stockChoices[0].id);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [cap, setCap] = useState('10000');
  const [devBuy, setDevBuy] = useState('');
  const [image, setImage] = useState('');
  const [imageNote, setImageNote] = useState('');

  async function pickImage(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImageNote('Shrinking…');
    try {
      const uri = await compressImage(file);
      setImage(uri);
      setImageNote(`${(uri.length / 1024).toFixed(1)} KB, stored on-chain with the coin.`);
    } catch (e) {
      setImageNote(e.message);
    }
  }
  const [settings, setSettings] = useState(defaultSettings);
  const [session, setSession] = useState('open');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [quote, setQuote] = useState(null); // { price, liquidityUsd, dex } for a no-feed stock; null = none; undefined = loading
  const stock = stockChoices.find(s => s.id === stockId) ?? stockById[stockId];
  const needsFeed = isLive && !stock.feed;
  const { shown, more } = searchStocks(query, stock);

  useEffect(() => {
    if (!needsFeed) return setQuote(null);
    let live = true;
    setQuote(undefined);
    dexPrice(stock.address).then(q => { if (live) setQuote(q); });
    return () => { live = false; };
  }, [needsFeed, stock.address]);

  function pickStock(entry) {
    setStockId(entry.id);
    setFeedback('');
    if (isLive && !entry.feed) setSettings(current => ({ ...current, ...Object.fromEntries(FEED_RULES.map(k => [k, false])) }));
  }
  const picked = optionalRules.filter(key => settings[key]);

  function updateSetting(key, value) {
    setFeedback('');
    setSettings(current => {
      if (optionalRules.includes(key) && value) {
        if (needsFeed && FEED_RULES.includes(key)) return current;
        if (picked.length >= MAX_RULES) { setFeedback(`Pick up to ${MAX_RULES} rules.`); return current; }
        if (key === 'earnings' && !current.diamond) return { ...current, earnings: true, diamond: picked.length + 1 < MAX_RULES ? true : current.diamond };
      }
      if (key === 'diamond' && !value) return { ...current, diamond: false, earnings: false };
      return { ...current, [key]: value };
    });
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setFeedback('Enter a coin name.');
      event.currentTarget.elements.namedItem('name').focus();
      return;
    }
    if (settings.earnings && !settings.diamond) return setFeedback('Earnings Bomb needs Diamond Redeem.');
    const devUsd = Number(devBuy) || 0;
    if (devUsd < 0) return setFeedback('Dev buy can’t be negative.');
    if (devUsd > maxDevBuyUsd(Number(cap))) return setFeedback(`Dev buy is capped at 5% of supply, about ${dollars.format(maxDevBuyUsd(Number(cap)))} at this FDV.`);
    if (needsFeed && FEED_RULES.some(k => settings[k])) return setFeedback(`${stock.id} has no price feed, so Shadow Peg, Red Day Boost and Earnings Bomb are off.`);

    if (!isLive) {
      const coin = {
        id: `demo-${crypto.randomUUID()}`, name: name.trim(), symbol: symbol.toUpperCase(), stock: stock.id,
        art: '', image, age: 0, cap: Number(cap), volume: 0, change: 0, vault: 0,
        payout: settings.diamond ? settings.minPayout : 100,
        rules: ['floor', ...picked], settings, draft: true,
      };
      try { saveDraft(coin); } catch { return setFeedback('This browser could not save your demo.'); }
      return router.push(coinPath(coin.id));
    }

    setBusy(true);
    setFeedback('Confirm the launch in your wallet…');
    try {
      const decimals = Number(await publicClient.readContract({ address: stock.address, abi: abis.erc20, functionName: 'decimals' }));
      // No feed: the contract can't price the start, so we give it in stock units from the DEX price (as Doppler does).
      let startFdvStock = 0n;
      if (needsFeed) {
        const q = await dexPrice(stock.address);
        if (!q) throw new Error(`No market price for ${stock.id} yet. It needs a USDC pool on Base with at least $1K of liquidity.`);
        startFdvStock = parseUnits((Number(cap) / q.price).toFixed(decimals), decimals);
      }
      // Dev buy: priced from the same source the launch uses (Chainlink, else the DEX pool), sent in stock units.
      // It runs inside the launch transaction before anyone else can trade, so no slippage limit is needed.
      let devBuyStock = 0n;
      if (devUsd > 0) {
        const px = needsFeed ? (await dexPrice(stock.address))?.price : (await loadStock(stock.address)).price;
        if (!px) throw new Error(`No price for ${stock.id}, so the dev buy can’t be sized.`);
        devBuyStock = parseUnits((devUsd / px).toFixed(decimals), decimals);
        setFeedback(`Approve ${stock.id} for the dev buy in your wallet…`);
        await ensureAllowance(stock.address, config.factory, devBuyStock);
        setFeedback('Confirm the launch in your wallet…');
      }
      const receipt = await write({
        address: config.factory, abi: abis.factory, functionName: 'launch',
        args: [{
          name: name.trim(), symbol: symbol.toUpperCase(), metadataURI: image, stock: stock.address,
          startFdvUsd: parseUnits(String(cap), 18), startFdvStock, rules: toRuleParams(settings, decimals), devBuyStock, minDevBuyOut: 0n,
        }],
      });
      const launched = receipt.logs
        .filter(l => l.address.toLowerCase() === config.factory.toLowerCase())
        .map(l => { try { return decodeEventLog({ abi: abis.factory, ...l }); } catch { return null; } })
        .find(e => e?.eventName === 'Launched');
      if (!launched) throw new Error('Launched, but could not read the pool id from the receipt.');
      router.push(coinPath(launched.args.poolId));
    } catch (e) {
      setFeedback(e.shortMessage || e.message || 'Launch failed.');
      setBusy(false);
    }
  }

  return (
    <>
      <div className="app-heading">
        <div><Link className="back-link" href="/markets/">Markets</Link><h1>Launch a coin</h1><p>Choose a stock, then pick up to {MAX_RULES} rules. Share Floor is always on.</p></div>
        <span className="demo-label">{isLive ? 'Live on Base' : 'Demo builder'}</span>
      </div>
      <form className="launch-layout" onSubmit={onSubmit}>
        <div className="launch-fields">
          <fieldset className="form-panel">
            <legend className="sr-only">Paired stock</legend>
            <h2>Paired stock</h2><p>The token your coin trades against.</p>
            {stockChoices.length > SHOWN && (
              <input className="stock-search" type="search" placeholder={`Search ${stockChoices.length} stocks`} aria-label="Search stocks" value={query} onChange={event => setQuery(event.target.value)} />
            )}
            <div className="stock-options">
              {shown.map(entry => (
                <label className="stock-option" key={entry.id}>
                  <input type="radio" name="stock" value={entry.id} checked={stockId === entry.id} onChange={() => pickStock(entry)} />
                  <StockAvatar stock={entry} /><span><strong>{entry.id}</strong><small>{entry.name}</small></span>
                </label>
              ))}
            </div>
            {shown.length === 0 && <p className="stock-note">No stock matches “{query}”.</p>}
            {more > 0 && <p className="stock-note">{more} more. Search by ticker or name.</p>}
            {isLive && (
              <p className="stock-note" aria-live="polite">
                {!needsFeed ? 'Chainlink price feed: all rules available.'
                  : quote === undefined ? `Checking ${stock.id}’s market price…`
                  : quote ? `No Chainlink feed. Starting price from the ${quote.dex} pool: ${dollars.format(quote.price)}. Shadow Peg, Red Day Boost and Earnings Bomb need a feed.`
                  : `No Chainlink feed and no liquid USDC pool yet, so ${stock.id} can’t be priced for a launch.`}
              </p>
            )}
          </fieldset>
          <fieldset className="form-panel">
            <legend className="sr-only">Coin identity</legend>
            <h2>Coin identity</h2>
            <div className="field-grid">
              <label>Coin name<input name="name" maxLength={36} required placeholder="Silicon Alley" value={name} onChange={event => { setName(event.target.value); setFeedback(''); }} /></label>
              <label>Ticker<input name="symbol" maxLength={10} required pattern="[A-Za-z0-9]{2,10}" title="Use 2 to 10 letters or numbers" placeholder="CHIPS" value={symbol} onChange={event => setSymbol(event.target.value)} /></label>
            </div>
            <div className="form-field image-field">
              <span>Picture <small className="field-hint">Optional. Square works best. It’s shrunk to a few KB and stored on-chain, so it can never go missing.</small></span>
              <div className="image-picker">
                {image ? <img src={image} alt="Coin picture preview" /> : <span className="image-empty" aria-hidden="true">+</span>}
                <label className="button button-outline">{image ? 'Change' : 'Choose picture'}<input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pickImage} /></label>
                {image && <button type="button" className="image-remove" onClick={() => { setImage(''); setImageNote(''); }}>Remove</button>}
              </div>
              {imageNote && <small className="field-hint" role="status">{imageNote}</small>}
            </div>
            <label className="form-field">
              Opening FDV <span className="field-unit"><input name="cap" type="number" min="5000" max="50000" step="100" value={cap} required onChange={event => setCap(event.target.value)} /><span>USD</span></span>
            </label>
            <label className="form-field">
              Dev buy <small className="field-hint">Optional. Buy first, in the launch transaction, paid in {stock.id}. Up to 5% of supply, about {dollars.format(maxDevBuyUsd(Number(cap) || 10000))}. No sniper fee.</small>
              <span className="field-unit"><input name="devBuy" type="number" min="0" max={maxDevBuyUsd(Number(cap) || 10000)} step="any" placeholder="0" value={devBuy} onChange={event => { setDevBuy(event.target.value); setFeedback(''); }} /><span>USD</span></span>
            </label>
          </fieldset>
          <fieldset className="form-panel rules-form">
            <legend className="sr-only">Trading rules</legend>
            <h2>Trading rules</h2><p>Rule settings lock on-chain when the coin launches.</p>
            {Object.entries(rules).map(([id, rule]) => (
              <div className="builder-rule" key={id}>
                <label className="builder-rule-header">
                  <RuleIcon rule={rule} />
                  <span><strong>{rule.name}</strong><small>{rule.description}</small></span>
                  {rule.always
                    ? <span className="rule-tag included">Always on</span>
                    : needsFeed && FEED_RULES.includes(id)
                      ? <span className="rule-tag">Needs a price feed</span>
                      : <input className="switch" type="checkbox" name={id} checked={settings[id]} onChange={event => updateSetting(id, event.target.checked)} />}
                </label>
                {!rule.always && <RuleParameters id={id} settings={settings} update={updateSetting} disabled={!settings[id]} />}
              </div>
            ))}
          </fieldset>
        </div>
        <LaunchPreview name={name.trim()} symbol={symbol.toUpperCase()} image={image} stock={stock} cap={cap} devBuy={devBuy} session={session} setSession={setSession} settings={settings} feedback={feedback} busy={busy} count={picked.length} />
      </form>
    </>
  );
}
