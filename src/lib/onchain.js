'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { encodeAbiParameters, formatUnits, keccak256, parseAbiItem } from 'viem';
import { abis, config, getServerWallet, getWallet, knownStocks, publicClient, subscribeWallet } from './chain';
import { dexPrice } from './stock-prices';
import { safeImage } from './coin-image';

const launchedEvent = parseAbiItem(
  'event Launched(bytes32 indexed poolId, address indexed meme, address indexed launcher, address vault, address stock, uint256 startFdvUsd, int24 startTick)'
);
const feeEvent = parseAbiItem('event FeeTaken(bytes32 indexed id, bool isBuy, uint256 amount, uint256 feeBps, uint256 vaultShareBps)');
const swapEvent = parseAbiItem('event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)');
const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

const read = (address, abi, functionName, args = []) => publicClient.readContract({ address, abi, functionName, args });

// ---------------------------------------------------------------- hooks

export function useWallet() {
  return useSyncExternalStore(subscribeWallet, getWallet, getServerWallet);
}

/** Run an async loader, with loading/error state and a `reload`. Polls every `pollMs` if given. */
export function useLoader(loader, deps, pollMs = 0) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const inFlight = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);
  const reload = useCallback(() => {
    if (inFlight.current) return () => {}; // never stack requests on a slow RPC
    inFlight.current = true;
    let cancelled = false;
    run().then(
      data => !cancelled && setState({ data, error: null, loading: false }),
      error => !cancelled && setState(s => ({ data: s.data, error, loading: false }))
    ).finally(() => { inFlight.current = false; });
    return () => { cancelled = true; };
  }, [run]);
  useEffect(() => {
    inFlight.current = false;
    const cancel = reload();
    if (!pollMs) return cancel;
    const t = setInterval(reload, pollMs);
    return () => { cancel(); clearInterval(t); };
  }, [reload, pollMs]);
  return { ...state, reload };
}

// ---------------------------------------------------------------- stocks

const stockCache = new Map();

export async function loadStock(address) {
  const key = address.toLowerCase();
  if (!stockCache.has(key)) {
    const known = knownStocks[key];
    const [symbol, decimals] = await Promise.all([read(address, abis.erc20, 'symbol').catch(() => known?.id ?? '???'), read(address, abis.erc20, 'decimals')]);
    stockCache.set(key, { address, id: known?.id ?? symbol, name: known?.name ?? symbol, color: known?.color ?? '#e2e5e9', decimals: Number(decimals), feed: Boolean(known?.feed) });
  }
  const base = stockCache.get(key);
  const [[px, pxOk], [moveBps, moveOk]] = await Promise.all([
    read(config.oracle, abis.oracle, 'price', [address]),
    read(config.oracle, abis.oracle, 'dailyMove', [address]),
  ]);
  return {
    ...base,
    // No Chainlink feed: fall back to the deepest stablecoin DEX pool, for display only.
    price: pxOk ? Number(formatUnits(px, 18)) : (await dexPrice(address))?.price ?? null,
    move: moveOk ? Number(moveBps) / 100 : 0,
    moveKnown: moveOk,
  };
}

export async function loadMarketOpen() {
  return config.clock ? read(config.clock, abis.clock, 'isOpen') : false;
}

// ---------------------------------------------------------------- coins

/** Current pool price from PoolManager storage (StateLibrary: pools mapping at slot 6, slot0 first). */
async function sqrtPriceX96(poolId) {
  const slot = keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [poolId, 6n]));
  const word = await read(config.poolManager, abis.poolManager, 'extsload', [slot]);
  return BigInt(word) & ((1n << 160n) - 1n);
}

/** Price of one meme in whole stock tokens. */
function memePriceInStock(sqrtP, stockIs0, stockDecimals) {
  if (sqrtP === 0n) return 0;
  const raw = Number(sqrtP) ** 2 / 2 ** 192; // currency1 per currency0, raw units
  const scale = 10 ** (18 - stockDecimals); // meme has 18 decimals
  return stockIs0 ? scale / raw : raw * scale;
}

function rulesFrom(hookRules, vaultInfo) {
  const list = ['floor'];
  if (vaultInfo.diamond) list.push('diamond');
  if (hookRules.shadowPeg) list.push('shadow');
  if (hookRules.bellMode) list.push('bell');
  if (hookRules.redDay) list.push('red');
  if (hookRules.shareholderPass) list.push('pass');
  if (vaultInfo.earnings && vaultInfo.earnings !== '0x0000000000000000000000000000000000000000') list.push('earnings');
  return list;
}

// Public RPCs cap eth_getLogs at a block range (publicnode: 50,000), so query from the deploy block in chunks.
const LOG_CHUNK = 49_999n;
const LOG_PARALLEL = 4;

// Logs already fetched, per filter, so polling only scans new blocks. The last few blocks are re-read to absorb reorgs.
const logCache = new Map();
const REORG_DEPTH = 30n;
const logKey = l => `${l.transactionHash}:${l.logIndex}`;

async function getLogsSinceDeploy(filter) {
  const key = JSON.stringify([filter.address, filter.event?.name, filter.args ?? null]);
  const cached = logCache.get(key);
  const latest = await publicClient.getBlockNumber();
  const start = cached ? (cached.to > REORG_DEPTH + config.fromBlock ? cached.to - REORG_DEPTH : config.fromBlock) : config.fromBlock;
  const ranges = [];
  for (let from = start; from <= latest; from += LOG_CHUNK + 1n) {
    const to = from + LOG_CHUNK > latest ? latest : from + LOG_CHUNK;
    ranges.push([from, to]);
  }
  const fresh = [];
  for (let i = 0; i < ranges.length; i += LOG_PARALLEL) {
    const batch = await Promise.all(ranges.slice(i, i + LOG_PARALLEL)
      .map(([fromBlock, toBlock]) => publicClient.getLogs({ ...filter, fromBlock, toBlock })));
    for (const logs of batch) fresh.push(...logs);
  }
  const kept = cached ? cached.logs.filter(l => l.blockNumber < start) : [];
  const seen = new Set(kept.map(logKey));
  const out = [...kept, ...fresh.filter(l => !seen.has(logKey(l)))];
  logCache.set(key, { to: latest, logs: out });
  return out;
}

async function feeLogs(poolId) {
  return getLogsSinceDeploy({ address: config.hook, event: feeEvent, args: { id: poolId } });
}

/** Total traded volume (stock units, gross) and number of trades, from the hook's FeeTaken events. */
function volumeFrom(logs, decimals) {
  let gross = 0;
  for (const { args } of logs) {
    if (args.feeBps > 0n) gross += Number(formatUnits(args.amount * 10_000n / args.feeBps, decimals));
  }
  return { volumeStock: gross, trades: logs.length };
}

export async function loadCoin(poolId, launchedArgs) {
  const [meme, vault, stockAddr, launcher, launchedAt] = launchedArgs
    ? [launchedArgs.meme, launchedArgs.vault, launchedArgs.stock, launchedArgs.launcher, null]
    : await read(config.factory, abis.factory, 'launches', [poolId]);
  const [stock, name, symbol, metadataURI, hookRules, key, sqrtP, reserve, circulating, diamond, minPayoutBps, fullAfter, earnings, fullPayoutUntil, vLaunchTime, redeemOpenAfter, logs, fee, block, usdcRoute] =
    await Promise.all([
      loadStock(stockAddr),
      read(meme, abis.erc20, 'name'),
      read(meme, abis.erc20, 'symbol'),
      read(meme, abis.erc20, 'metadataURI').catch(() => ''),
      read(config.hook, abis.hook, 'rulesOf', [poolId]),
      read(config.hook, abis.hook, 'keyOf', [poolId]),
      sqrtPriceX96(poolId),
      read(vault, abis.vault, 'reserve'),
      read(vault, abis.vault, 'circulating'),
      read(vault, abis.vault, 'diamond'),
      read(vault, abis.vault, 'minPayoutBps'),
      read(vault, abis.vault, 'fullAfter'),
      read(vault, abis.vault, 'earnings'),
      read(vault, abis.vault, 'fullPayoutUntil'),
      read(vault, abis.vault, 'launchTime'),
      read(vault, abis.vault, 'redeemOpenAfter'),
      feeLogs(poolId),
      read(config.hook, abis.hook, 'quoteFee', [poolId, '0x0000000000000000000000000000000000000000']),
      publicClient.getBlock(),
      config.zap ? read(config.zap, abis.zap, 'route', [stockAddr]).catch(() => ZERO) : ZERO,
    ]);
  const chainNow = Number(block.timestamp); // use chain time, not the browser clock

  const priceStock = memePriceInStock(sqrtP, hookRules.stockIs0, stock.decimals);
  const priceUsd = stock.price ? priceStock * stock.price : 0;
  const reserveStock = Number(formatUnits(reserve, stock.decimals));
  const circ = Number(formatUnits(circulating, 18));
  const { volumeStock, trades } = volumeFrom(logs, stock.decimals);
  const launchTime = Number(launchedAt ?? vLaunchTime);
  const vaultInfo = { diamond, earnings };

  return {
    id: poolId,
    live: true,
    meme, vaultAddr: vault, launcher, key,
    name, symbol, art: '', image: safeImage(metadataURI),
    stock: stock.id,
    stockInfo: stock,
    hookRules,
    rules: rulesFrom(hookRules, vaultInfo),
    priceStock, priceUsd,
    cap: priceUsd * 1e9, // FDV
    circulating: circ,
    vault: reserveStock, // stock units, same shape as the sample coins
    vaultStock: reserveStock,
    vaultUsd: stock.price ? reserveStock * stock.price : 0,
    floorStockPerMeme: circ > 0 ? reserveStock / circ : 0,
    volumeStock,
    volume: stock.price ? volumeStock * stock.price : 0,
    trades,
    feeBps: Number(fee[0]),
    vaultShareBps: Number(fee[1]),
    diamond, minPayoutBps: Number(minPayoutBps), fullAfter: Number(fullAfter),
    fullPayoutUntil: Number(fullPayoutUntil),
    launchTime,
    redeemOpensAt: Number(vLaunchTime) + Number(redeemOpenAfter),
    chainNow,
    age: Math.max(0, Math.floor((chainNow - launchTime) / 60)),
    change: 0,
    // USDC trading through the zap, when it has a route for this coin's stock
    usdcTrading: Boolean(config.zap) && usdcRoute !== ZERO,
  };
}

export async function loadCoins() {
  const logs = await getLogsSinceDeploy({ address: config.factory, event: launchedEvent });
  const coins = await Promise.all(logs.map(l => loadCoin(l.args.poolId, l.args).catch(() => null)));
  return coins.filter(Boolean);
}

/** Wallet-specific numbers for a coin. */
export async function loadPosition(coin, address) {
  if (!address) return null;
  const [memeBal, stockBal, payoutBps, usdcBal] = await Promise.all([
    read(coin.meme, abis.erc20, 'balanceOf', [address]),
    read(coin.stockInfo.address, abis.erc20, 'balanceOf', [address]),
    read(coin.vaultAddr, abis.vault, 'payoutBps', [address]),
    coin.usdcTrading ? read(config.usdc, abis.erc20, 'balanceOf', [address]) : 0n,
  ]);
  const [feeBps] = await read(config.hook, abis.hook, 'quoteFee', [coin.id, address]);
  return { memeBal, stockBal, usdcBal, payoutBps: Number(payoutBps), feeBps: Number(feeBps) };
}

// ---------------------------------------------------------------- activity

const BASE_BLOCK_SECONDS = 2; // Base produces a block every 2s, so block numbers convert to time without fetching blocks
const TRADER_LOOKUPS = 50;    // only the newest trades get their sender resolved (one RPC call each)
const ZERO = '0x0000000000000000000000000000000000000000';
const abs = v => (v < 0n ? -v : v);

/**
 * Trades, holders and per-trade prices for one coin, read from Uniswap v4 Swap events,
 * the hook's FeeTaken events (which say buy or sell) and the token's Transfer events.
 */
export async function loadActivity(coin) {
  const stock = coin.stockInfo;
  const stockIs0 = coin.hookRules.stockIs0;
  const [swaps, fees, transfers, head] = await Promise.all([
    getLogsSinceDeploy({ address: config.poolManager, event: swapEvent, args: { id: coin.id } }),
    feeLogs(coin.id),
    getLogsSinceDeploy({ address: coin.meme, event: transferEvent }),
    publicClient.getBlock(),
  ]);
  const headBlock = head.number;
  const headTime = Number(head.timestamp);
  const timeOf = block => headTime - Number(headBlock - block) * BASE_BLOCK_SECONDS;
  const sideByTx = new Map(fees.map(f => [f.transactionHash, f.args.isBuy]));

  const trades = swaps
    .map(({ args, blockNumber, transactionHash, logIndex }) => {
      const memeDelta = stockIs0 ? args.amount1 : args.amount0;
      const stockDelta = stockIs0 ? args.amount0 : args.amount1;
      // v4 deltas are from the swapper's side: a positive meme delta means the swapper received meme.
      const isBuy = sideByTx.get(transactionHash) ?? memeDelta > 0n;
      return {
        key: `${transactionHash}:${logIndex}`,
        tx: transactionHash,
        isBuy,
        meme: Number(formatUnits(abs(memeDelta), 18)),
        stock: Number(formatUnits(abs(stockDelta), stock.decimals)),
        priceStock: memePriceInStock(args.sqrtPriceX96, stockIs0, stock.decimals),
        time: timeOf(blockNumber),
        trader: null,
      };
    })
    .sort((a, b) => a.time - b.time);

  const recent = trades.slice(-TRADER_LOOKUPS);
  const senders = await Promise.all(recent.map(t => traderOf(t.tx)));
  recent.forEach((t, i) => { t.trader = senders[i]; });

  const balances = new Map();
  const add = (who, v) => balances.set(who, (balances.get(who) ?? 0n) + v);
  for (const { args } of transfers) {
    if (args.from !== ZERO) add(args.from.toLowerCase(), -args.value);
    if (args.to !== ZERO) add(args.to.toLowerCase(), args.value);
  }
  const holders = [...balances]
    .filter(([, v]) => v > 0n)
    .map(([address, v]) => ({ address, balance: Number(formatUnits(v, 18)) }))
    .sort((a, b) => b.balance - a.balance);

  return { trades, holders, now: headTime };
}

const traderCache = new Map();
async function traderOf(hash) {
  if (!traderCache.has(hash)) {
    traderCache.set(hash, publicClient.getTransaction({ hash }).then(t => t.from, () => { traderCache.delete(hash); return null; }));
  }
  return traderCache.get(hash);
}
