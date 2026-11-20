'use client';

/**
 * Market price for stocks with no Chainlink feed, from their deepest USD-stablecoin DEX pool on Base (DexScreener,
 * which allows browser requests). Used to set a no-feed coin's starting price and to show dollar values.
 * Stocks with a feed are priced on-chain by OracleAdapter instead.
 */
const STABLES = new Set(['USDC', 'USDbC', 'USDT', 'DAI', 'USDS']);
const MIN_LIQUIDITY_USD = 1_000; // ignore dust pools whose price can be anything
const TTL_MS = 60_000;
const cache = new Map(); // address -> { at, value }

/** @returns {Promise<{ price: number, liquidityUsd: number, dex: string } | null>} null when no usable pool exists. */
export async function dexPrice(address) {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value = null;
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const { pairs } = await res.json();
      const best = (pairs || [])
        .filter(p => p.chainId === 'base' && p.baseToken?.address?.toLowerCase() === key && STABLES.has(p.quoteToken?.symbol))
        .filter(p => Number(p.liquidity?.usd) >= MIN_LIQUIDITY_USD && Number(p.priceUsd) > 0)
        .sort((a, b) => Number(b.liquidity.usd) - Number(a.liquidity.usd))[0];
      if (best) value = { price: Number(best.priceUsd), liquidityUsd: Number(best.liquidity.usd), dex: best.dexId };
    }
  } catch {
    value = null;
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}
