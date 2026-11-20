export const stocks = [
  { id: 'NVDAc', name: 'NVIDIA', price: 185.42, move: 2.84, color: '#dcecbe' },
  { id: 'TSLAc', name: 'Tesla', price: 418.24, move: -2.15, color: '#f9dbda' },
  { id: 'AAPLc', name: 'Apple', price: 275.62, move: 0.67, color: '#e2e5e9' },
  { id: 'SPCXc', name: 'SpaceX', price: 163.18, move: 4.21, color: '#dfe7ff' },
  { id: 'MSFTc', name: 'Microsoft', price: 488.51, move: 1.08, color: '#e4eee4' },
];

export const originalCoins = [
  { id: 'chips', symbol: 'CHIPS', name: 'Silicon Alley', stock: 'NVDAc', art: 'cat', change: 18.42, cap: 284300, volume: 76300, vault: 142.86, age: 24, rules: ['floor', 'bell', 'diamond'], payout: 100 },
  { id: 'orbit', symbol: 'ORBIT', name: 'Low Earth Orbit', stock: 'SPCXc', art: 'rocket', change: 9.37, cap: 158200, volume: 41800, vault: 65.21, age: 18, rules: ['floor', 'shadow', 'diamond'], payout: 82 },
  { id: 'goose', symbol: 'GOOSE', name: 'Long Goose', stock: 'AAPLc', art: 'goose', change: -3.16, cap: 92400, volume: 22400, vault: 31.44, age: 165, rules: ['floor', 'bell', 'earnings'], payout: 100 },
  { id: 'calls', symbol: 'CALLS', name: 'Call Me Maybe', stock: 'TSLAc', art: 'receipt', change: 12.89, cap: 201100, volume: 58200, vault: 42.79, age: 53, rules: ['floor', 'red', 'diamond'], payout: 68 },
  { id: 'clippy', symbol: 'CLIPPY', name: 'Spreadsheet Enjoyer', stock: 'MSFTc', art: '', change: 2.72, cap: 52300, volume: 9400, vault: 12.12, age: 230, rules: ['floor', 'pass'], payout: 100 },
  { id: 'silicon', symbol: 'SILICON', name: 'Silicon Valley Intern', stock: 'NVDAc', art: '', change: -7.84, cap: 36600, volume: 7200, vault: 0, age: 9, rules: ['floor', 'shadow'], payout: 100 },
  { id: 'road', symbol: 'ROAD', name: 'Roadside Assistance', stock: 'TSLAc', art: '', change: -2.91, cap: 24500, volume: 4600, vault: 4.38, age: 82, rules: ['floor'], payout: 100 },
  { id: 'byte', symbol: 'BYTE', name: 'One More Byte', stock: 'AAPLc', art: '', change: 1.64, cap: 12800, volume: 3100, vault: 0, age: 5, rules: ['floor', 'bell'], payout: 100 },
];

/** Rules as built in the contracts. Share Floor is always on; a coin picks up to 4 of the others. */
export const rules = {
  floor: { name: 'Share Floor', mark: '▤', always: true, description: '1% of every trade buys real stock into the coin’s vault. Holders can burn coins to redeem their share.' },
  diamond: { name: 'Diamond Redeem', mark: '◆', description: 'Redemption pays 50% on day one and grows to 100% the longer you hold.' },
  shadow: { name: 'Shadow Peg', mark: '≈', description: 'The trading fee follows the real stock’s daily move: cheaper on green days, dearer on red days.' },
  bell: { name: 'Bell Mode', mark: '◷', description: 'Different trading fees while the US stock market is open and closed.' },
  red: { name: 'Red Day Boost', mark: '⊞', description: 'When the stock is down for the day, more of each fee goes into the share vault.' },
  pass: { name: 'Shareholder Pass', mark: '✦', description: 'Wallets holding the real stock token pay a lower trading fee.' },
  earnings: { name: 'Earnings Bomb', mark: '✸', description: 'After earnings: stock up 1%+, everyone redeems at 100% for a week. Stock down 1%+, the vault buys back and burns.' },
};

export const optionalRules = ['diamond', 'shadow', 'bell', 'red', 'pass', 'earnings'];
export const MAX_RULES = 4;

export const stockById = Object.fromEntries(stocks.map(stock => [stock.id, stock]));
export const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const compactDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
export const units = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
export const percent = value => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}%`;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Trading fee in %, mirroring StockHooksHook._fee (standard 1.5%, clamped to 0.75–3%). */
export function getFee(settings, stock, session) {
  const isOpen = session === 'open';
  let fee = settings.bell ? (isOpen ? settings.openFee : settings.closeFee) : 1.5;
  if (isOpen && settings.shadow) fee -= clamp(stock.move * settings.sensitivity / 100, -settings.maxShift, settings.maxShift);
  return clamp(fee, 0.75, 3);
}

/** Fee split in %: 2/3 coin vault, 1/3 platform, nothing to the launcher. Red Day Boost moves platform share to the vault. */
export function getFeeSplit(settings, stock, session) {
  const boost = settings.red && stock.move <= -settings.redTrigger ? settings.redBoost : 0;
  const vault = Math.round((66.67 + boost) * 100) / 100;
  return { launcher: 0, vault, platform: Math.round((100 - vault) * 100) / 100 };
}

export const defaultSettings = {
  floor: true, diamond: true, bell: true, shadow: false, red: false, pass: false, earnings: false,
  openFee: 1, closeFee: 1.75, sensitivity: 20, maxShift: 1, redTrigger: 2, redBoost: 25,
  minPayout: 50, payoutDays: 30, minShares: 1, passDiscount: 50, beatDays: 7, missBurn: 15,
};

export const sessionOptions = [['open', 'Open'], ['closed', 'Closed']];
