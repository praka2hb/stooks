'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { encodeAbiParameters, formatUnits, keccak256, parseAbiItem } from 'viem';
import { abis, config, getWallet, knownStocks, publicClient, subscribeWallet } from './chain';
import { dexPrice } from './stock-prices';

const launchedEvent = parseAbiItem(
  'event Launched(bytes32 indexed poolId, address indexed meme, address indexed launcher, address vault, address stock, uint256 startFdvUsd, int24 startTick)'
);
const feeEvent = parseAbiItem('event FeeTaken(bytes32 indexed id, bool isBuy, uint256 amount, uint256 feeBps, uint256 vaultShareBps)');

const read = (address, abi, functionName, args = []) => publicClient.readContract({ address, abi, functionName, args });

// ---------------------------------------------------------------- hooks

export function useWallet() {
  return useSyncExternalStore(subscribeWallet, getWallet, getWallet);
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

async function feeLogs(poolId) {
  return publicClient.getLogs({ address: config.hook, event: feeEvent, args: { id: poolId }, fromBlock: config.fromBlock, toBlock: 'latest' });
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
  const [stock, name, symbol, hookRules, key, sqrtP, reserve, circulating, diamond, minPayoutBps, fullAfter, earnings, fullPayoutUntil, vLaunchTime, redeemOpenAfter, logs, fee, block] =
    await Promise.all([
      loadStock(stockAddr),
      read(meme, abis.erc20, 'name'),
      read(meme, abis.erc20, 'symbol'),
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
    name, symbol, art: '',
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
  };
}

export async function loadCoins() {
  const logs = await publicClient.getLogs({ address: config.factory, event: launchedEvent, fromBlock: config.fromBlock, toBlock: 'latest' });
  const coins = await Promise.all(logs.map(l => loadCoin(l.args.poolId, l.args).catch(() => null)));
  return coins.filter(Boolean);
}

/** Wallet-specific numbers for a coin. */
export async function loadPosition(coin, address) {
  if (!address) return null;
  const [memeBal, stockBal, payoutBps] = await Promise.all([
    read(coin.meme, abis.erc20, 'balanceOf', [address]),
    read(coin.stockInfo.address, abis.erc20, 'balanceOf', [address]),
    read(coin.vaultAddr, abis.vault, 'payoutBps', [address]),
  ]);
  const [feeBps] = await read(config.hook, abis.hook, 'quoteFee', [coin.id, address]);
  return { memeBal, stockBal, payoutBps: Number(payoutBps), feeBps: Number(feeBps) };
}
