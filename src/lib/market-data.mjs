export const stocks = [
  { id: 'NVDAc', name: 'NVIDIA', price: 185.42, move: 2.84, color: '#dcecbe' },
  { id: 'TSLAc', name: 'Tesla', price: 418.24, move: -2.15, color: '#f9dbda' },
  { id: 'AAPLc', name: 'Apple', price: 275.62, move: 0.67, color: '#e2e5e9' },
  { id: 'SPCXc', name: 'SpaceX', price: 163.18, move: 4.21, color: '#dfe7ff' },
  { id: 'MSFTc', name: 'Microsoft', price: 488.51, move: 1.08, color: '#e4eee4' },
];

export const originalCoins = [
  { id: 'chips', symbol: 'CHIPS', name: 'Silicon Alley', stock: 'NVDAc', art: 'cat', change: 18.42, cap: 284300, volume: 76300, vault: 142.86, age: 24, rules: ['bell', 'floor', 'snipe'], payout: 100 },
  { id: 'orbit', symbol: 'ORBIT', name: 'Low Earth Orbit', stock: 'SPCXc', art: 'rocket', change: 9.37, cap: 158200, volume: 41800, vault: 65.21, age: 18, rules: ['floor', 'shadow', 'snipe'], payout: 82 },
  { id: 'goose', symbol: 'GOOSE', name: 'Long Goose', stock: 'AAPLc', art: 'goose', change: -3.16, cap: 92400, volume: 22400, vault: 31.44, age: 165, rules: ['floor', 'bell', 'snipe'], payout: 100 },
  { id: 'calls', symbol: 'CALLS', name: 'Call Me Maybe', stock: 'TSLAc', art: 'receipt', change: 12.89, cap: 201100, volume: 58200, vault: 42.79, age: 53, rules: ['floor', 'red', 'snipe'], payout: 68 },
  { id: 'clippy', symbol: 'CLIPPY', name: 'Spreadsheet Enjoyer', stock: 'MSFTc', art: '', change: 2.72, cap: 52300, volume: 9400, vault: 12.12, age: 230, rules: ['floor', 'snipe'], payout: 100 },
  { id: 'silicon', symbol: 'SILICON', name: 'Silicon Valley Intern', stock: 'NVDAc', art: '', change: -7.84, cap: 36600, volume: 7200, vault: 0, age: 9, rules: ['shadow', 'snipe'], payout: 100 },
  { id: 'road', symbol: 'ROAD', name: 'Roadside Assistance', stock: 'TSLAc', art: '', change: -2.91, cap: 24500, volume: 4600, vault: 4.38, age: 82, rules: ['floor', 'snipe'], payout: 100 },
  { id: 'byte', symbol: 'BYTE', name: 'One More Byte', stock: 'AAPLc', art: '', change: 1.64, cap: 12800, volume: 3100, vault: 0, age: 5, rules: ['bell', 'snipe'], payout: 100 },
];

export const rules = {
  bell: { name: 'Bell Mode', mark: '◷', description: 'Set different trading fees for when the stock market is open or closed.' },
  floor: { name: 'Share Floor', mark: '▤', description: 'Route a share of each fee into a reserve of stock tokens that holders can redeem.' },
  shadow: { name: 'Shadow Peg', mark: '≈', description: 'Adjust the trading fee based on the underlying stock’s daily move.' },
  snipe: { name: 'Snipe Tax', mark: '↘', description: 'Start with a higher fee that decays during the first minutes after launch.' },
  red: { name: 'Red Day Boost', mark: '⊞', description: 'Route more of the fee to the share vault when the stock falls below your threshold.' },
};

export const stockById = Object.fromEntries(stocks.map(stock => [stock.id, stock]));
export const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const compactDollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 });
export const units = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });
export const percent = value => `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}%`;
export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function getFee(settings, stock, session) {
  const isOpen = session === 'open';
  const baseFee = settings.bell ? (isOpen ? settings.openFee : settings.closeFee) : 1;
  const shift = isOpen && settings.shadow ? clamp(stock.move * settings.sensitivity / 100, -1, 1) : 0;
  return clamp(baseFee - shift, 0.5, 3);
}

export function getFeeSplit(settings, stock, session) {
  const vaultShare = settings.floor ? settings.vaultShare : 0;
  const redBoost = session === 'open' && settings.red && stock.move <= -settings.redTrigger ? 25 : 0;
  return { launcher: 70 - vaultShare, vault: vaultShare + redBoost, platform: 30 - redBoost };
}

export const defaultSettings = {
  floor: true, bell: true, shadow: false, red: false, diamond: false,
  openFee: 0.8, closeFee: 1.5, vaultShare: 30, sensitivity: 20, redTrigger: 2,
  payoutDays: 30, snipeFee: 25, snipeMinutes: 5,
};

export const sessionOptions = [['open', 'Open'], ['closed', 'Closed']];
