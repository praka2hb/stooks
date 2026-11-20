#!/usr/bin/env node
/**
 * Pulls every Coinbase tokenized stock on Base and writes the list for both halves of the project:
 *
 *   app/src/lib/stock-list.json       the launch form's stock picker
 *   contracts/script/stocks.json      the addresses Deploy.s.sol allowlists
 *
 * Source: api.coinbase.com/v1/tokenized-stocks (public, no key). Run it before a deploy and whenever Coinbase adds
 * stocks, then allowlist the new ones with factory.setAllowedStocks. The 13 stocks with Chainlink feeds are marked
 * `feed: true` (the feed addresses themselves live in Deploy.s.sol).
 *
 * Usage: node app/scripts/sync-stocks.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://api.coinbase.com/v1/tokenized-stocks';
// Stocks with a Chainlink feed on Base (Chainlink's Base directory, "Coinbase <TICKER>"). Keep in sync with Deploy.s.sol.
const FEEDS = new Set(['NVDAc', 'TSLAc', 'AAPLc', 'MSFTc', 'GOOGLc', 'AMZNc', 'METAc', 'MSTRc', 'SPCXc', 'SNDKc', 'CRCLc', 'INTCc', 'ANTc']);

const tokens = [];
let token = '';
for (let page = 0; page < 50; page++) {
  const res = await fetch(token ? `${API}?page_token=${encodeURIComponent(token)}` : API, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Coinbase API HTTP ${res.status}`);
  const j = await res.json();
  tokens.push(...j.tokens);
  token = j.next_page_token;
  if (!token) break;
}

const seen = new Set();
const stocks = tokens
  .filter(t => /^0x[0-9a-fA-F]{40}$/.test(t.contract_address) && !seen.has(t.contract_address.toLowerCase()) && seen.add(t.contract_address.toLowerCase()))
  .map(t => ({
    id: t.symbol,
    name: t.name.replace(/,? (Inc|Corp|Corporation|Incorporated|PBC|Ltd|plc|N\.V\.|Co)\.?$/i, '').replace(/,$/, ''),
    address: t.contract_address,
    decimals: t.decimals,
    supply: Number(t.total_supply) || 0,
    feed: FEEDS.has(t.symbol),
    // The logo the token's own on-chain contractURI() points to (its metadata `image`), served from Coinbase.
    icon: t.icon_url || '',
  }))
  // Feed stocks first, then by tokens in circulation, then A-Z.
  .sort((a, b) => b.feed - a.feed || b.supply - a.supply || a.id.localeCompare(b.id));

const missing = [...FEEDS].filter(s => !stocks.some(t => t.id === s));
if (missing.length) throw new Error(`feed stocks missing from Coinbase list: ${missing.join(', ')}`);

writeFileSync(join(root, 'app/src/lib/stock-list.json'), JSON.stringify(stocks, null, 1) + '\n');
writeFileSync(join(root, 'contracts/script/stocks.json'), JSON.stringify({ tokens: stocks.map(s => s.address) }, null, 1) + '\n');
console.log(`${stocks.length} stocks (${stocks.filter(s => s.supply > 0).length} in circulation, ${FEEDS.size} with feeds)`);
