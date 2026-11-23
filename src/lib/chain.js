'use client';

import { createPublicClient, createWalletClient, custom, http, parseAbi } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import stockList from './stock-list.json';

/**
 * Deployment config, inlined at build time from NEXT_PUBLIC_* env vars (see .env.local.example).
 * With no factory address the app runs in demo mode on sample data.
 */
export const config = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || '',
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 8453),
  poolManager: process.env.NEXT_PUBLIC_POOL_MANAGER || '0x498581fF718922c3f8e6A244956aF099B2652b2b',
  factory: process.env.NEXT_PUBLIC_FACTORY || '',
  hook: process.env.NEXT_PUBLIC_HOOK || '',
  router: process.env.NEXT_PUBLIC_ROUTER || '',
  // Buy/sell with USDC in one transaction (StockHooksZap). Empty = trade in the paired stock only.
  zap: process.env.NEXT_PUBLIC_ZAP || '',
  usdc: process.env.NEXT_PUBLIC_USDC || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  oracle: process.env.NEXT_PUBLIC_ORACLE || '',
  clock: process.env.NEXT_PUBLIC_CLOCK || '',
  earnings: process.env.NEXT_PUBLIC_EARNINGS || '',
  fromBlock: BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 0),
  // Local rehearsal only: an anvil test key, used instead of a browser wallet when the RPC is localhost.
  devKey: process.env.NEXT_PUBLIC_DEV_KEY || '',
};

export const isLive = Boolean(config.rpcUrl && config.factory && config.hook && config.router);
const isLocalRpc = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(config.rpcUrl);
export const usesDevKey = isLive && isLocalRpc && /^0x[0-9a-fA-F]{64}$/.test(config.devKey);

export const chain = {
  ...base,
  id: config.chainId,
  rpcUrls: { default: { http: [config.rpcUrl || base.rpcUrls.default.http[0]] } },
};

// Reads are bundled: contract reads go through Multicall3 and the rest as JSON-RPC batches, so a page makes a
// handful of requests instead of dozens (free public RPCs rate-limit bursts).
export const publicClient = isLive
  ? createPublicClient({ chain, batch: { multicall: { wait: 16 } }, transport: http(config.rpcUrl, { batch: { wait: 16 }, retryCount: 4 }) })
  : null;

const STOCK_COLORS = { NVDAc: '#dcecbe', TSLAc: '#f9dbda', AAPLc: '#e2e5e9', MSFTc: '#e4eee4', GOOGLc: '#e1ebfb', AMZNc: '#fbe8cf', METAc: '#dbe6fb', MSTRc: '#fde3cc', SPCXc: '#dfe7ff', SNDKc: '#f6dcdc', CRCLc: '#dcebf5', INTCc: '#d9e9f7', ANTc: '#f3e3d3' };
/** Soft pastel from the ticker, so every stock gets a stable color. */
function pastel(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 55% 90%)`;
}

/**
 * Every Coinbase tokenized stock, all allowlisted at deploy (contracts/script/Deploy.s.sol). Regenerate with
 * `node scripts/sync-stocks.mjs`. `feed`: has a Chainlink feed, so every rule works; the others can't use the rules
 * that read an on-chain price, and launch at a DEX-priced start. Keys are lowercase.
 */
export const knownStocks = Object.fromEntries(
  stockList.map(s => [s.address.toLowerCase(), { ...s, color: STOCK_COLORS[s.id] ?? pastel(s.id) }])
);

export const abis = {
  factory: parseAbi([
    'struct RuleParams { uint32 redeemOpenAfter; bool diamond; uint16 minPayoutBps; uint32 fullAfter; bool shadowPeg; uint16 sensitivity; uint16 maxShift; bool bellMode; uint16 openFeeBps; uint16 closedFeeBps; uint16 bellBonusBps; bool redDay; uint16 triggerBps; uint16 boostBps; bool shareholderPass; uint128 minShares; uint16 discountBps; bool earnings; uint16 beatPayoutDays; uint16 missBurnBps; bool earningsRepeat; }',
    'struct LaunchParams { string name; string symbol; string metadataURI; address stock; uint256 startFdvUsd; uint256 startFdvStock; RuleParams rules; uint256 devBuyStock; uint256 minDevBuyOut; }',
    'function launch(LaunchParams p) returns (bytes32 id, address meme, address vault)',
    'function launches(bytes32) view returns (address meme, address vault, address stock, address launcher, uint64 launchedAt)',
    'function allowedStock(address) view returns (bool)',
    'event Launched(bytes32 indexed poolId, address indexed meme, address indexed launcher, address vault, address stock, uint256 startFdvUsd, int24 startTick)',
  ]),
  hook: parseAbi([
    'struct Rules { address vault; bool stockIs0; uint64 launchTime; bool shadowPeg; uint16 sensitivity; uint16 maxShift; bool bellMode; uint16 openFeeBps; uint16 closedFeeBps; uint16 bellBonusBps; bool redDay; uint16 triggerBps; uint16 boostBps; bool shareholderPass; uint128 minShares; uint16 discountBps; }',
    'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
    'function rulesOf(bytes32 id) view returns (Rules)',
    'function keyOf(bytes32 id) view returns (PoolKey)',
    'function quoteFee(bytes32 id, address trader) view returns (uint256 feeBps, uint256 vaultShareBps)',
    'function pendingVault(bytes32 id) view returns (uint256)',
    'event FeeTaken(bytes32 indexed id, bool isBuy, uint256 amount, uint256 feeBps, uint256 vaultShareBps)',
  ]),
  router: parseAbi([
    'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
    'function swapExactIn(PoolKey key, bool zeroForOne, uint256 amountIn, uint256 minOut, address recipient, uint256 deadline) returns (uint256 amountOut)',
  ]),
  zap: parseAbi([
    'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
    'function route(address stock) view returns (address)',
    'function buy(PoolKey key, uint256 usdcIn, uint256 minOut, address recipient, uint256 deadline) returns (uint256)',
    'function sell(PoolKey key, uint256 coinIn, uint256 minOut, address recipient, uint256 deadline) returns (uint256)',
    'function quoteBuy(PoolKey key, uint256 usdcIn, address trader) returns (uint256)',
    'function quoteSell(PoolKey key, uint256 coinIn, address trader) returns (uint256)',
  ]),
  vault: parseAbi([
    'function reserve() view returns (uint256)',
    'function circulating() view returns (uint256)',
    'function floorPerMeme() view returns (uint256)',
    'function payoutBps(address) view returns (uint256)',
    'function quoteRedeem(address holder, uint256 amount) view returns (uint256 out, uint256 pBps)',
    'function redeem(uint256 amount, uint256 minOut) returns (uint256)',
    'function diamond() view returns (bool)',
    'function minPayoutBps() view returns (uint16)',
    'function fullAfter() view returns (uint32)',
    'function earnings() view returns (address)',
    'function fullPayoutUntil() view returns (uint64)',
    'function launchTime() view returns (uint64)',
    'function redeemOpenAfter() view returns (uint32)',
  ]),
  erc20: parseAbi([
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function totalSupply() view returns (uint256)',
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address, address) view returns (uint256)',
    'function approve(address, uint256) returns (bool)',
    'function metadataURI() view returns (string)', // MemeToken only: the coin's picture as a data: URI
  ]),
  oracle: parseAbi([
    'function price(address stock) view returns (uint256 px, bool ok)',
    'function dailyMove(address stock) view returns (int256 moveBps, bool ok)',
  ]),
  clock: parseAbi(['function isOpen() view returns (bool)']),
  earnings: parseAbi([
    'struct Report { uint64 armAt; uint64 fireAt; }',
    'function currentReport(bytes32 id) view returns (Report r, uint256 idx, bool ok)',
    'function pools(bytes32) view returns (address vault, address stock, uint16 beatDays, uint16 missBps, bool repeat, bool done, bool armed, uint32 nextIdx, uint128 refPx)',
  ]),
  poolManager: parseAbi(['function extsload(bytes32 slot) view returns (bytes32)']),
};

// ---------------------------------------------------------------- wallet
//
// Wallets are found with EIP-6963: every installed wallet announces itself, so the user picks one and no extension
// can hijack the connection by owning window.ethereum (Phantom does this). window.ethereum is only a fallback for
// wallets too old to announce.

const REMEMBER = 'stooks-wallet';
const empty = { address: null, client: null, info: null, provider: null, wallets: [], picker: false, error: '' };
let wallet = empty;
const listeners = new Set();
const set = patch => { wallet = { ...wallet, ...patch }; listeners.forEach(fn => fn()); };

export function subscribeWallet(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const getWallet = () => wallet;
export const getServerWallet = () => empty;

const found = new Map(); // rdns -> { info: { name, icon, rdns, uuid }, provider }

function addWallet(detail) {
  if (!detail?.info?.rdns || !detail.provider || found.has(detail.info.rdns)) return;
  found.set(detail.info.rdns, detail);
  set({ wallets: [...found.values()] });
}

let discovering = false;
/** Start listening for wallets (idempotent). Also tries a silent reconnect to the wallet used last time. */
export function discoverWallets() {
  if (discovering || typeof window === 'undefined' || !isLive) return;
  discovering = true;
  window.addEventListener('eip6963:announceProvider', e => addWallet(e.detail));
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // Old wallets that don't announce: offer window.ethereum once announcements have had a moment to arrive.
  setTimeout(() => {
    if (!found.size && window.ethereum) addWallet({ info: { name: 'Browser wallet', icon: '', rdns: 'injected', uuid: 'injected' }, provider: window.ethereum });
    reconnect();
  }, 300);
}

function remembered() {
  try { return window.localStorage.getItem(REMEMBER); } catch { return null; }
}
function remember(rdns) {
  try { rdns ? window.localStorage.setItem(REMEMBER, rdns) : window.localStorage.removeItem(REMEMBER); } catch { /* private mode */ }
}

/** Reconnect without a popup if the wallet used last time still has this site authorised. */
async function reconnect() {
  const detail = found.get(remembered() ?? '');
  if (!detail || wallet.address) return;
  try {
    const [address] = await detail.provider.request({ method: 'eth_accounts' });
    if (address) attach(detail, address);
  } catch { /* wallet locked or gone: stay disconnected */ }
}

let detach = () => {};
function attach(detail, address) {
  detach();
  const { provider } = detail;
  const onAccounts = accounts => (accounts?.length ? attach(detail, accounts[0]) : disconnectWallet());
  provider.on?.('accountsChanged', onAccounts);
  detach = () => provider.removeListener?.('accountsChanged', onAccounts);
  remember(detail.info.rdns);
  set({
    address, info: detail.info, provider, picker: false, error: '',
    client: createWalletClient({ account: address, chain, transport: custom(provider) }),
  });
}

export const openWalletPicker = () => { discoverWallets(); set({ picker: true, error: '' }); };
export const closeWalletPicker = () => set({ picker: false, error: '' });

export function disconnectWallet() {
  detach();
  detach = () => {};
  remember(null);
  set({ address: null, client: null, info: null, provider: null });
}

/** Make sure the wallet is on Base, adding the network to it if it has never seen it. */
async function ensureChain(provider) {
  const want = `0x${chain.id.toString(16)}`;
  if ((await provider.request({ method: 'eth_chainId' })) === want) return;
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: want }] });
  } catch (e) {
    if (e?.code !== 4902 && e?.data?.originalError?.code !== 4902) throw new Error(`Switch your wallet to ${chain.name} to continue.`);
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId: want, chainName: chain.name, nativeCurrency: chain.nativeCurrency, rpcUrls: [config.rpcUrl], blockExplorerUrls: [chain.blockExplorers?.default.url].filter(Boolean) }],
    });
  }
}

/**
 * Connect a wallet. With `detail` (from the picker) it connects that wallet; without, it reuses the connected one
 * or opens the picker and throws, so a write started while disconnected asks the user to pick first.
 */
export async function connectWallet(detail) {
  if (!isLive) throw new Error('No deployment configured.');
  if (usesDevKey) {
    const account = privateKeyToAccount(config.devKey);
    set({ address: account.address, info: { name: 'Test wallet' }, client: createWalletClient({ account, chain, transport: http(config.rpcUrl) }) });
    return wallet;
  }
  if (!detail) {
    if (wallet.client) return wallet;
    openWalletPicker();
    throw new Error('Connect a wallet to continue.');
  }
  try {
    const [address] = await detail.provider.request({ method: 'eth_requestAccounts' });
    if (!address) throw new Error('The wallet returned no account.');
    await ensureChain(detail.provider);
    attach(detail, address);
    return wallet;
  } catch (e) {
    const message = e?.code === 4001 ? 'Request rejected in the wallet.' : e?.shortMessage || e?.message || 'Could not connect.';
    set({ error: message });
    throw new Error(message);
  }
}

/** Send a contract write and wait for it to be mined. Returns the receipt. */
export async function write(request) {
  const { client, provider } = wallet.client ? wallet : await connectWallet();
  if (provider) await ensureChain(provider); // the user may have switched networks since connecting
  // Wallet gas estimates run too tight for swaps through the hook (nested token calls hit the 63/64 gas rule
  // and the whole trade reverts out of gas), so estimate here and add a 50% margin. Unused gas is not charged.
  const account = client.account?.address || (await client.getAddresses())[0];
  const estimate = await publicClient.estimateContractGas({ ...request, account });
  const hash = await client.writeContract({ chain, ...request, gas: (estimate * 3n) / 2n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('Transaction reverted.');
  return receipt;
}

/** Approve `spender` for `amount` of `token` if the current allowance is lower. */
export async function ensureAllowance(token, spender, amount) {
  const owner = (wallet.address ? wallet : await connectWallet()).address;
  const current = await publicClient.readContract({ address: token, abi: abis.erc20, functionName: 'allowance', args: [owner, spender] });
  if (current >= amount) return;
  await write({ address: token, abi: abis.erc20, functionName: 'approve', args: [spender, amount] });
}
