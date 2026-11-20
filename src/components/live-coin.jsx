'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { abis, config, connectWallet, ensureAllowance, publicClient, write } from '../lib/chain';
import { compactDollars, rules, units } from '../lib/market-data.mjs';
import { loadCoin, loadPosition, useLoader, useWallet } from '../lib/onchain';
import { Avatar, Delta, RuleIcon, Segmented } from './market-ui';

const SLIPPAGE_BPS = 200n; // 2% below the simulated output
const explorer = config.chainId === 8453 && !/127\.0\.0\.1|localhost/.test(config.rpcUrl) ? 'https://basescan.org/tx/' : null;
const pct = bps => `${(bps / 100).toFixed(2).replace(/\.00$/, '')}%`;
const fmt = (n, max = 6) => (Number.isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: max }).format(n) : '—');

export function LiveMarket() {
  const id = useSearchParams().get('id');
  const coin = useLoader(() => (id ? loadCoin(id) : Promise.reject(new Error('Missing coin id'))), [id], 15_000);
  if (coin.data) return <LiveCoin coin={coin.data} reload={coin.reload} />;
  return (
    <div className="empty-state" role="status">
      {coin.loading ? <p>Loading market from Base…</p> : (
        <><h1>Market unavailable</h1><p>{coin.error?.shortMessage || coin.error?.message}</p><Link className="button button-primary" href="/markets/">Browse markets</Link></>
      )}
    </div>
  );
}

function LiveCoin({ coin, reload }) {
  const { address } = useWallet();
  const [nonce, setNonce] = useState(0);
  const position = useLoader(() => loadPosition(coin, address), [coin.id, address, nonce]);
  const refresh = () => { reload(); setNonce(n => n + 1); };
  const stock = coin.stockInfo;

  return (
    <>
      <Link className="back-link" href="/markets/">Markets</Link>
      <div className="coin-page-title">
        <Avatar coin={coin} large /><div><h1>{coin.symbol} <span>/ {stock.id}</span></h1><p>{coin.name} · {stock.name} pair</p></div>
        <span className="demo-label live-label">Live on Base</span>
      </div>
      <div className="coin-layout">
        <div className="coin-main">
          <section className="chart-panel" aria-labelledby="price-heading">
            <div className="chart-top">
              <div>
                <h2 id="price-heading">Meme price</h2>
                <div className="coin-price">${coin.priceUsd.toPrecision(4)}</div>
                <small className="table-note">{fmt(coin.priceStock, 12)} {stock.id} per {coin.symbol}</small>
              </div>
            </div>
            <div className="chart-empty">{coin.trades ? `${coin.trades} trades so far.` : 'No trades yet.'} Price chart comes from an indexer (not built yet).</div>
          </section>
          <LiveRules coin={coin} position={position.data} />
        </div>
        <aside className="coin-aside">
          <TradePanel coin={coin} position={position.data} address={address} onDone={refresh} />
          <section className="vault-panel" aria-labelledby="vault-title">
            <h2 id="vault-title">Share vault</h2>
            <div className="vault-value">{fmt(coin.vaultStock, 6)} <span>{stock.id}</span></div>
            <dl className="vault-metrics">
              <div><dt>Vault value</dt><dd>{compactDollars.format(coin.vaultUsd)}</dd></div>
              <div><dt>Floor per 1M {coin.symbol}</dt><dd>{fmt(coin.floorStockPerMeme * 1e6, 6)} {stock.id}</dd></div>
              <div><dt>Floor vs price</dt><dd>{coin.priceStock ? pct((coin.floorStockPerMeme / coin.priceStock) * 10_000) : '—'}</dd></div>
              {position.data && <div><dt>Your payout rate</dt><dd>{pct(position.data.payoutBps)}</dd></div>}
            </dl>
          </section>
          <section className="market-stats" aria-label="Coin statistics">
            <dl>
              <div><dt>FDV</dt><dd>{compactDollars.format(coin.cap)}</dd></div>
              <div><dt>Volume</dt><dd>{compactDollars.format(coin.volume)}</dd></div>
              <div><dt>{stock.id} today</dt><dd>{stock.moveKnown ? <Delta value={stock.move} /> : '—'}</dd></div>
              <div><dt>{stock.id} price</dt><dd>{stock.price ? `$${stock.price.toFixed(2)}` : '—'}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

function LiveRules({ coin, position }) {
  const r = coin.hookRules;
  const stock = coin.stockInfo;
  const now = coin.chainNow;
  const effects = {
    floor: `${fmt(coin.vaultStock, 4)} ${stock.id} in vault`,
    diamond: now < coin.fullPayoutUntil ? 'Stock up after earnings: 100% for everyone' : `${pct(coin.minPayoutBps)} → 100% over ${Math.round(coin.fullAfter / 86400)}d`,
    shadow: `Fee now ${pct(coin.feeBps)} · ${stock.id} ${stock.moveKnown ? `${stock.move >= 0 ? '+' : ''}${stock.move.toFixed(2)}%` : 'no ref yet'}`,
    bell: `Open ${pct(r.openFeeBps)} · Closed ${pct(r.closedFeeBps)}`,
    red: stock.moveKnown && stock.move * 100 <= -r.triggerBps ? `Boost on: vault gets ${pct(coin.vaultShareBps)} of fees` : `Boost at −${pct(r.triggerBps)}`,
    pass: position ? (position.feeBps < coin.feeBps ? `You qualify: ${pct(position.feeBps)} fee` : `Hold ${fmt(Number(formatUnits(r.minShares, stock.decimals)))} ${stock.id} for −${pct(r.discountBps)}`) : `−${pct(r.discountBps)} for holders`,
    earnings: 'Reacts to the next earnings report',
  };
  return (
    <section className="fee-panel" aria-labelledby="active-rule-title">
      <div className="fee-heading"><div><h2 id="active-rule-title">Active rules</h2><p>Locked on-chain at launch · trading fee now {pct(coin.feeBps)}, vault share {pct(coin.vaultShareBps)}</p></div></div>
      {coin.rules.map(id => (
        <div className="active-rule" key={id}>
          <RuleIcon rule={rules[id]} /><span><strong>{rules[id].name}</strong><small>{rules[id].description}</small></span><span>{effects[id]}</span>
        </div>
      ))}
    </section>
  );
}

const modes = [['buy', 'Buy'], ['sell', 'Sell'], ['redeem', 'Redeem']];

function TradePanel({ coin, position, address, onDone }) {
  const stock = coin.stockInfo;
  const [mode, setMode] = useState('buy');
  const [input, setInput] = useState('');
  const [status, setStatus] = useState({ busy: false, msg: '', tx: '' });
  const isBuy = mode === 'buy';
  const inDecimals = isBuy ? stock.decimals : 18;
  const balance = position ? (isBuy ? position.stockBal : position.memeBal) : null;
  const fee = position?.feeBps ?? coin.feeBps;
  const amountNum = Number(input) || 0;
  const redeemOpen = coin.chainNow >= coin.redeemOpensAt;

  // Spot estimate for display only; the transaction uses a simulated quote.
  const estimate = isBuy
    ? (amountNum * (1 - fee / 10_000)) / (coin.priceStock || Infinity)
    : mode === 'sell'
      ? amountNum * coin.priceStock * (1 - fee / 10_000)
      : amountNum * coin.floorStockPerMeme * ((position?.payoutBps ?? 10_000) / 10_000);

  async function submit(event) {
    event.preventDefault();
    let amount;
    try {
      amount = parseUnits(input || '0', inDecimals);
    } catch {
      return setStatus({ busy: false, msg: 'Enter a valid amount.', tx: '' });
    }
    if (amount <= 0n) return setStatus({ busy: false, msg: 'Enter an amount.', tx: '' });
    setStatus({ busy: true, msg: 'Confirm in your wallet…', tx: '' });
    try {
      const { address: me } = address ? { address } : await connectWallet();
      let receipt;
      if (mode === 'redeem') {
        const [out] = await publicClient.readContract({ address: coin.vaultAddr, abi: abis.vault, functionName: 'quoteRedeem', args: [me, amount] });
        receipt = await write({ address: coin.vaultAddr, abi: abis.vault, functionName: 'redeem', args: [amount, out - out / 1000n] });
      } else {
        const token = isBuy ? stock.address : coin.meme;
        await ensureAllowance(token, config.router, amount);
        const zeroForOne = isBuy ? coin.hookRules.stockIs0 : !coin.hookRules.stockIs0;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
        const args = [coin.key, zeroForOne, amount, 0n, me, deadline];
        const { result: quoted } = await publicClient.simulateContract({ account: me, address: config.router, abi: abis.router, functionName: 'swapExactIn', args });
        args[3] = quoted - (quoted * SLIPPAGE_BPS) / 10_000n;
        receipt = await write({ address: config.router, abi: abis.router, functionName: 'swapExactIn', args });
      }
      setStatus({ busy: false, msg: 'Done.', tx: receipt.transactionHash });
      setInput('');
      onDone();
    } catch (e) {
      setStatus({ busy: false, msg: e.shortMessage || e.message || 'Transaction failed.', tx: '' });
    }
  }

  return (
    <section className="trade-panel" aria-labelledby="trade-title">
      <div className="trade-heading"><h2 id="trade-title">Trade</h2><span className="table-note">Fee {pct(fee)}</span></div>
      <Segmented className="trade-tabs" label="Trade action" options={modes} value={mode} onChange={m => { setMode(m); setInput(''); setStatus({ busy: false, msg: '', tx: '' }); }} />
      <form onSubmit={submit}>
        <label className="form-field" htmlFor="trade-amount">
          {mode === 'buy' ? 'You pay' : mode === 'sell' ? 'You sell' : 'You burn'}
          {balance !== null && (
            <button type="button" className="link-button" onClick={() => setInput(formatUnits(balance, inDecimals))}>
              Balance {fmt(Number(formatUnits(balance, inDecimals)), 4)}
            </button>
          )}
        </label>
        <div className="field-unit">
          <input type="number" id="trade-amount" min="0" step="any" value={input} inputMode="decimal" placeholder="0.0" onChange={e => setInput(e.target.value)} />
          <span>{isBuy ? stock.id : coin.symbol}</span>
        </div>
        <div className="quote-summary" aria-live="polite">
          <span>Estimated output</span><strong>≈ {fmt(estimate, isBuy ? 0 : 6)} {isBuy ? coin.symbol : stock.id}</strong>
          <small>{mode === 'redeem' ? `${pct(position?.payoutBps ?? 10_000)} of the vault floor · burns your coins` : `Spot estimate · max ${pct(Number(SLIPPAGE_BPS))} slippage from the simulated quote`}</small>
        </div>
        {mode === 'redeem' && !redeemOpen && <p className="preview-note">Redemption opens {new Date(coin.redeemOpensAt * 1000).toLocaleString()}.</p>}
        <button className="button button-primary full-button" type="submit" disabled={status.busy || (mode === 'redeem' && !redeemOpen)}>
          {status.busy ? 'Working…' : !address ? 'Connect wallet' : mode === 'buy' ? `Buy ${coin.symbol}` : mode === 'sell' ? `Sell ${coin.symbol}` : `Redeem for ${stock.id}`}
        </button>
      </form>
      <p className="preview-note trade-note" role="status">
        {status.msg}{status.tx && (explorer ? <> <a href={`${explorer}${status.tx}`} target="_blank" rel="noreferrer">View transaction</a></> : <> Tx {status.tx.slice(0, 10)}…</>)}
      </p>
    </section>
  );
}
