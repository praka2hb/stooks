'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { formatUnits, parseUnits } from 'viem';
import { abis, config, connectWallet, ensureAllowance, publicClient, write } from '../lib/chain';
import { compactDollars, rules } from '../lib/market-data.mjs';
import { loadActivity, loadCoin, loadPosition, useLoader, useWallet } from '../lib/onchain';
import { Avatar, RuleIcon, Segmented } from './market-ui';
import { ChartToolbar, PriceChart, usd } from './price-chart';

const SLIPPAGE_BPS = 200n; // 2% below the simulated output
const USDC_DECIMALS = 6;
const NO_TRADER = '0x0000000000000000000000000000000000000000';

/** Output of a USDC buy (coins) or sell (USDC) through the zap, both legs and all fees, from an eth_call. */
async function zapQuote(coin, isBuy, amount, trader) {
  const { result } = await publicClient.simulateContract({
    address: config.zap, abi: abis.zap, functionName: isBuy ? 'quoteBuy' : 'quoteSell', args: [coin.key, amount, trader || NO_TRADER],
  });
  return result;
}
const explorer = config.chainId === 8453 && !/127\.0\.0\.1|localhost/.test(config.rpcUrl) ? 'https://basescan.org/tx/' : null;
const scan = config.chainId === 8453 && !/127\.0\.0\.1|localhost/.test(config.rpcUrl) ? 'https://basescan.org' : null;
const short = a => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** An address (or id) with a copy button and, on Base, a Basescan link. */
function CopyValue({ value, label, kind = 'address' }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); } catch { return; }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="copy-value">
      <code title={value}>{short(value)}</code>
      <button type="button" onClick={copy} aria-label={`Copy ${label}`}>{copied ? 'Copied' : 'Copy'}</button>
      {scan && kind === 'address' && <a href={`${scan}/address/${value}`} target="_blank" rel="noopener noreferrer" aria-label={`${label} on Basescan`}>↗</a>}
    </span>
  );
}

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

const SUPPLY = 1_000_000_000; // every coin mints a fixed 1B supply

const ago = (seconds, now) => {
  const d = Math.max(0, now - seconds);
  if (d < 60) return `${Math.floor(d)}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  if (d < 86400 * 30) return `${Math.floor(d / 86400)}d`;
  if (d < 86400 * 365) return `${Math.floor(d / (86400 * 30))}mo`;
  return `${Math.floor(d / (86400 * 365))}y`;
};
const compact = n => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
const when = s => new Date(s * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

function AddressLink({ value, children }) {
  return scan
    ? <a className="td-addr" href={`${scan}/address/${value}`} target="_blank" rel="noopener noreferrer">{children ?? short(value)}</a>
    : <span className="td-addr">{children ?? short(value)}</span>;
}

function LiveCoin({ coin, reload }) {
  const { address } = useWallet();
  const [nonce, setNonce] = useState(0);
  const position = useLoader(() => loadPosition(coin, address), [coin.id, address, nonce]);
  const activity = useLoader(() => loadActivity(coin), [coin.id, nonce], 30_000);
  const [style, setStyle] = useState('candles');
  const [candleStep, setCandleStep] = useState('300');
  const [tab, setTab] = useState('trades');
  const refresh = () => { reload(); setNonce(n => n + 1); };
  const stock = coin.stockInfo;
  const toUsd = useCallback(p => p * (stock.price || 0), [stock.price]);

  const trades = activity.data?.trades ?? [];
  const holders = activity.data?.holders ?? [];
  // The pool, vault and factory hold coins for the protocol, not as people; leave them out of the count.
  const protocol = new Set([config.poolManager, coin.vaultAddr, config.factory].map(a => a.toLowerCase()));
  const holderCount = holders.filter(h => !protocol.has(h.address)).length;
  const now = activity.data?.now ?? coin.chainNow;
  const volumeIn = seconds => trades.filter(t => t.time >= now - seconds).reduce((sum, t) => sum + t.stock, 0) * (stock.price || 0);
  // 24h change: last price at least 24h old, or the first trade when the coin is younger than that.
  const before = [...trades].reverse().find(t => t.time <= now - 86400) ?? trades[0];
  const change = before && before.priceStock ? (coin.priceStock / before.priceStock - 1) * 100 : null;
  const loadingActivity = activity.loading && !activity.data;

  return (
    <div className="td-page">
      <Link className="back-link" href="/markets/">Markets</Link>
      <header className="td-head">
        <div className="td-title">
          <Avatar coin={coin} large />
          <div>
            <h1>{coin.name} <span>{coin.symbol}</span></h1>
            <p className="td-meta">
              <span>by <AddressLink value={coin.launcher} /></span>
              <span>{ago(coin.launchTime, now)} ago</span>
              <span>{stock.id} pair</span>
              <CopyValue value={coin.meme} label="token address" />
            </p>
          </div>
        </div>
        <div className="td-cap">
          <small>Market cap</small>
          <strong>{compactDollars.format(coin.cap)}</strong>
          <small>{usd(coin.priceUsd)} price</small>
        </div>
      </header>

      <div className="td-layout">
        <div className="td-main">
          <section aria-labelledby="price-heading">
            <div className="td-price-row">
              <div>
                <h2 id="price-heading" className="sr-only">{coin.symbol} price</h2>
                <div className="td-price">{usd(coin.priceUsd)}</div>
                <small className={change === null ? 'td-change' : change < 0 ? 'td-change down' : 'td-change up'}>
                  {change === null ? `${fmt(coin.priceStock, 12)} ${stock.id} per ${coin.symbol}` : `${change >= 0 ? '+' : ''}${change.toFixed(2)}% 24h`}
                </small>
              </div>
              <ChartToolbar style={style} setStyle={setStyle} interval={candleStep} setInterval={setCandleStep} />
            </div>
            {loadingActivity
              ? <div className="td-chart-empty">Loading trades from Base…</div>
              : <PriceChart trades={trades} toUsd={toUsd} style={style} interval={candleStep} symbol={coin.symbol} />}
            <p className="td-chart-note">USD prices use today&apos;s {stock.id} price{stock.price ? ` ($${stock.price.toFixed(2)})` : ''}. Times are approximate (from block numbers).</p>
          </section>

          <section className="td-stats" aria-label="Coin statistics">
            <dl className="td-stat-row">
              <div><dt>Market cap</dt><dd>{compactDollars.format(coin.cap)}</dd></div>
              <div><dt>Holders</dt><dd>{loadingActivity ? '—' : holderCount.toLocaleString('en-US')}</dd></div>
              <div><dt>Trades</dt><dd>{(activity.data ? trades.length : coin.trades).toLocaleString('en-US')}</dd></div>
              <div><dt>Supply</dt><dd>{compact(SUPPLY)}</dd></div>
              <div><dt>Share vault</dt><dd>{compactDollars.format(coin.vaultUsd)}</dd></div>
            </dl>
            <dl className="td-stat-row">
              <div><dt>5m volume</dt><dd>{compactDollars.format(volumeIn(300))}</dd></div>
              <div><dt>1h volume</dt><dd>{compactDollars.format(volumeIn(3600))}</dd></div>
              <div><dt>6h volume</dt><dd>{compactDollars.format(volumeIn(21600))}</dd></div>
              <div><dt>24h volume</dt><dd>{compactDollars.format(volumeIn(86400))}</dd></div>
              <div><dt>All-time volume</dt><dd>{compactDollars.format(coin.volume)}</dd></div>
            </dl>
            <dl className="td-stat-row td-stat-small">
              <div><dt>Token</dt><dd><AddressLink value={coin.meme} /></dd></div>
              <div><dt>Share vault</dt><dd><AddressLink value={coin.vaultAddr} /></dd></div>
              <div><dt>{stock.id}</dt><dd><AddressLink value={stock.address} /></dd></div>
              <div><dt>Pool ID</dt><dd><CopyValue value={coin.id} label="pool ID" kind="id" /></dd></div>
              <div><dt>Launched</dt><dd>{when(coin.launchTime)}</dd></div>
            </dl>
          </section>

          <section className="td-activity" aria-label="Activity">
            <div className="td-tabs">
              <div role="tablist" aria-label="Activity">
                {[['trades', 'Trades'], ['holders', 'Holders'], ['rules', 'Rules']].map(([key, label]) => (
                  <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>
                ))}
              </div>
              <span>{tab === 'trades' ? `${trades.length.toLocaleString('en-US')} total` : tab === 'holders' ? `${holderCount.toLocaleString('en-US')} holders` : `${coin.rules.length} active`}</span>
            </div>
            {tab === 'trades' && <TradesTable trades={trades} coin={coin} now={now} toUsd={toUsd} loading={loadingActivity} />}
            {tab === 'holders' && <HoldersTable holders={holders} coin={coin} loading={loadingActivity} />}
            {tab === 'rules' && <LiveRules coin={coin} position={position.data} />}
          </section>
        </div>

        <aside className="td-aside">
          <TradePanel coin={coin} position={position.data} address={address} onDone={refresh} />
          <section className="td-card td-vault" aria-labelledby="vault-title">
            <h2 id="vault-title">Share vault</h2>
            <div className="vault-value">{fmt(coin.vaultStock, 6)} <span>{stock.id}</span></div>
            <dl className="vault-metrics">
              <div><dt>Vault value</dt><dd>{compactDollars.format(coin.vaultUsd)}</dd></div>
              <div><dt>Floor per 1M {coin.symbol}</dt><dd>{fmt(coin.floorStockPerMeme * 1e6, 6)} {stock.id}</dd></div>
              <div><dt>Floor vs price</dt><dd>{coin.priceStock ? pct((coin.floorStockPerMeme / coin.priceStock) * 10_000) : '—'}</dd></div>
              {position.data && <div><dt>Your payout rate</dt><dd>{pct(position.data.payoutBps)}</dd></div>}
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}

function TradesTable({ trades, coin, now, toUsd, loading }) {
  const stock = coin.stockInfo;
  if (loading) return <p className="td-table-empty">Loading trades…</p>;
  if (!trades.length) return <p className="td-table-empty">No trades yet. Be the first to buy {coin.symbol}.</p>;
  const rows = [...trades].reverse().slice(0, 50);
  return (
    <div className="td-table-wrap">
      <table className="td-table">
        <thead><tr><th>Side</th><th>Trader</th><th className="num">{stock.id}</th><th className="num">{coin.symbol}</th><th className="num">Price</th><th className="num">Age</th></tr></thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.key}>
              <td className={t.isBuy ? 'td-side up' : 'td-side down'}>{t.isBuy ? '↗ Buy' : '↘ Sell'}</td>
              <td>{t.trader ? <AddressLink value={t.trader} /> : <span className="td-addr">—</span>}{explorer && <a className="td-tx" href={`${explorer}${t.tx}`} target="_blank" rel="noreferrer" aria-label="View transaction">↗</a>}</td>
              <td className="num">{t.stock < 0.001 ? '<0.001' : fmt(t.stock, 3)}</td>
              <td className="num">{compact(t.meme)}</td>
              <td className="num">{usd(toUsd(t.priceStock))}</td>
              <td className="num">{ago(t.time, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {trades.length > rows.length && <p className="td-table-empty">Showing the latest {rows.length} of {trades.length.toLocaleString('en-US')} trades.</p>}
    </div>
  );
}

function HoldersTable({ holders, coin, loading }) {
  if (loading) return <p className="td-table-empty">Loading holders…</p>;
  if (!holders.length) return <p className="td-table-empty">No holders yet.</p>;
  const labels = {
    [config.poolManager.toLowerCase()]: 'Uniswap v4 pool',
    [coin.vaultAddr.toLowerCase()]: 'Share vault',
    [coin.launcher.toLowerCase()]: 'Creator',
    [config.factory.toLowerCase()]: 'Factory',
  };
  return (
    <div className="td-table-wrap">
      <table className="td-table">
        <thead><tr><th>#</th><th>Holder</th><th className="num">{coin.symbol}</th><th className="num">Share of supply</th></tr></thead>
        <tbody>
          {holders.slice(0, 50).map((h, i) => (
            <tr key={h.address}>
              <td className="td-rank">{i + 1}</td>
              <td><AddressLink value={h.address} />{labels[h.address] && <span className="td-tag">{labels[h.address]}</span>}</td>
              <td className="num">{compact(h.balance)}</td>
              <td className="num">{(h.balance / SUPPLY * 100).toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    <div className="td-rules">
      <p className="td-rules-note">Locked on-chain at launch · trading fee now {pct(coin.feeBps)}, vault share {pct(coin.vaultShareBps)}</p>
      {coin.rules.map(id => (
        <div className="active-rule" key={id}>
          <RuleIcon rule={rules[id]} /><span><strong>{rules[id].name}</strong><small>{rules[id].description}</small></span><span>{effects[id]}</span>
        </div>
      ))}
    </div>
  );
}

const modes = [['buy', 'Buy'], ['sell', 'Sell'], ['redeem', 'Redeem']];

function TradePanel({ coin, position, address, onDone }) {
  const stock = coin.stockInfo;
  const [mode, setMode] = useState('buy');
  const [input, setInput] = useState('');
  const [status, setStatus] = useState({ busy: false, msg: '', tx: '' });
  const isBuy = mode === 'buy';
  // Buy and sell in USDC through the zap when it has a route for this stock; redeem always pays the stock.
  const usdc = coin.usdcTrading && mode !== 'redeem';
  const payUnit = isBuy ? (usdc ? 'USDC' : stock.id) : coin.symbol;
  const outUnit = isBuy ? coin.symbol : usdc ? 'USDC' : stock.id;
  const inDecimals = isBuy ? (usdc ? USDC_DECIMALS : stock.decimals) : 18;
  const outDecimals = isBuy ? 18 : usdc ? USDC_DECIMALS : stock.decimals;
  const balance = position ? (isBuy ? (usdc ? position.usdcBal : position.stockBal) : position.memeBal) : null;
  const fee = position?.feeBps ?? coin.feeBps;
  const amountNum = Number(input) || 0;
  const redeemOpen = coin.chainNow >= coin.redeemOpensAt;

  // USDC trades: live on-chain quote of both legs (fees included). Stock trades and redeem: spot estimate.
  const [quote, setQuote] = useState({ key: '', out: null });
  const quoteKey = `${mode}:${input}`;
  useEffect(() => {
    if (!usdc || !amountNum) return undefined;
    let amount;
    try { amount = parseUnits(input, inDecimals); } catch { return undefined; }
    let stale = false;
    const t = setTimeout(async () => {
      const out = await zapQuote(coin, isBuy, amount, address).catch(() => null);
      if (!stale) setQuote({ key: quoteKey, out });
    }, 350);
    return () => { stale = true; clearTimeout(t); };
  }, [usdc, amountNum, input, inDecimals, isBuy, coin, address, quoteKey]);

  const quoteFailed = usdc && amountNum > 0 && quote.key === quoteKey && quote.out === null;
  const estimate = usdc
    ? (quote.key === quoteKey && quote.out !== null ? Number(formatUnits(quote.out, outDecimals)) : null)
    : isBuy
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
      } else if (usdc) {
        await ensureAllowance(isBuy ? config.usdc : coin.meme, config.zap, amount);
        const quoted = await zapQuote(coin, isBuy, amount, me);
        const minOut = quoted - (quoted * SLIPPAGE_BPS) / 10_000n;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
        receipt = await write({ address: config.zap, abi: abis.zap, functionName: isBuy ? 'buy' : 'sell', args: [coin.key, amount, minOut, me, deadline] });
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

  const setShare = share => setInput(formatUnits((balance * BigInt(share)) / 100n, inDecimals));

  return (
    <section className="td-card td-trade" aria-labelledby="trade-title">
      <h2 id="trade-title" className="sr-only">Trade {coin.symbol}</h2>
      <p className="td-trade-note">{usdc ? `Pay in USDC · swapped to ${stock.id} on Aerodrome, then the Uniswap v4 pool, in one transaction` : 'Trades on the Uniswap v4 pool'}</p>
      <Segmented className="td-trade-tabs" label="Trade action" options={modes} value={mode} onChange={m => { setMode(m); setInput(''); setStatus({ busy: false, msg: '', tx: '' }); }} />
      <form onSubmit={submit}>
        <div className="td-pay">
          <div className="td-pay-top">
            <label htmlFor="trade-amount">{mode === 'buy' ? 'Pay' : mode === 'sell' ? 'Sell' : 'Burn'}</label>
            {balance !== null && <span>Balance {fmt(Number(formatUnits(balance, inDecimals)), 4)}</span>}
          </div>
          <div className="td-pay-input">
            <input type="number" id="trade-amount" min="0" step="any" value={input} inputMode="decimal" placeholder="0" onChange={e => setInput(e.target.value)} />
            <span>{payUnit}</span>
          </div>
          <div className="td-chips">
            {[25, 50, 75, 100].map(share => (
              <button key={share} type="button" disabled={!balance} onClick={() => setShare(share)}>{share === 100 ? 'Max' : `${share}%`}</button>
            ))}
          </div>
        </div>
        <div className="td-receive" aria-live="polite">
          <span>You receive</span>
          <strong>{!amountNum ? '0' : quoteFailed ? '—' : estimate === null ? '…' : `≈ ${fmt(estimate, isBuy ? 0 : usdc ? 2 : 6)}`} <small>{outUnit}</small></strong>
        </div>
        <p className="td-slippage">
          {mode === 'redeem' ? `${pct(position?.payoutBps ?? 10_000)} of the vault floor · burns your coins` : quoteFailed ? (isBuy ? 'No quote for this amount right now.' : 'No quote: not enough in the pool to sell into yet.') : `Slippage ${pct(Number(SLIPPAGE_BPS))} · ${usdc ? 'live quote' : 'spot estimate'}`}
        </p>
        {mode === 'redeem' && !redeemOpen && <p className="td-slippage">Redemption opens {new Date(coin.redeemOpensAt * 1000).toLocaleString()}.</p>}
        <button className={`td-submit ${mode}`} type="submit" disabled={status.busy || (mode === 'redeem' && !redeemOpen)}>
          {status.busy ? 'Working…' : !address ? 'Connect wallet' : mode === 'buy' ? `Buy ${coin.symbol}` : mode === 'sell' ? `Sell ${coin.symbol}` : `Redeem for ${stock.id}`}
        </button>
      </form>
      {status.msg && (
        <p className="td-status" role="status">
          {status.msg}{status.tx && (explorer ? <> <a href={`${explorer}${status.tx}`} target="_blank" rel="noreferrer">View transaction</a></> : <> Tx {status.tx.slice(0, 10)}…</>)}
        </p>
      )}
    </section>
  );
}
