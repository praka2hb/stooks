import { stocks, originalCoins, rules, stockById, dollars, compactDollars, units, percent, getFee, getFeeSplit } from './market-data.mjs';
import { drawBell, makeSeries, drawSeries } from './graphics.mjs';

const site = document.querySelector('#site');
const app = document.querySelector('#application');
const draftKey = 'stockhooks-preview-v1';
const baseline = { floor: true, bell: true, shadow: false, red: false, diamond: false, openFee: 0.8, closeFee: 1.5, vaultShare: 30, sensitivity: 20, redTrigger: 2, payoutDays: 30, snipeFee: 25, snipeMinutes: 5 };
const view = { stock: 'all', search: '', order: 'volume' };
let session = 'open';
let resizeCharts = () => {};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function readDrafts() {
  try {
    const data = JSON.parse(localStorage.getItem(draftKey) || '[]');
    return Array.isArray(data) ? data.filter(coin => coin && typeof coin.id === 'string' && stockById[coin.stock] && Array.isArray(coin.rules)) : [];
  } catch {
    return [];
  }
}

let drafts = readDrafts();
const allCoins = () => [...drafts, ...originalCoins];

function avatar(coin, size = '') {
  const art = ['cat', 'rocket', 'goose', 'receipt'].includes(coin.art) ? coin.art : 'initial';
  const letters = art === 'initial' ? escapeHtml(coin.symbol.slice(0, 2)) : '';
  return `<span class="avatar avatar-${art} ${size}" aria-hidden="true">${letters}</span>`;
}

function stockAvatar(stock) {
  return `<span class="stock-avatar" style="--stock-color: ${stock.color}" aria-hidden="true">${stock.id.slice(0, 1)}</span>`;
}

function delta(value) {
  return `<span class="delta ${value < 0 ? 'negative' : value > 0 ? 'positive' : ''}">${percent(value)}</span>`;
}

function ageLabel(minutes) {
  if (!minutes) return 'Just now';
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

function ruleLabels(coin) {
  return coin.rules.filter(key => key !== 'snipe' && rules[key]).slice(0, 2).map(key => `<span class="rule-tag">${rules[key].name}</span>`).join(' ');
}

function paintHome() {
  document.querySelector('#stock-tape').innerHTML = '<span class="tape-label">DEMO QUOTES</span>' + stocks.map(stock =>
    `<a href="#/markets/${stock.id}" class="tape-item"><strong>${stock.id}</strong><span>${dollars.format(stock.price)}</span>${delta(stock.move)}</a>`
  ).join('');

  document.querySelector('#featured-markets').innerHTML = originalCoins.slice(0, 4).map(coin =>
    `<a class="featured-coin" href="#/coin/${coin.id}">
      <div class="feature-identity">${avatar(coin)}<div><strong>${coin.symbol}</strong><span>${coin.stock} pair</span></div></div>
      <canvas data-feature="${coin.id}" aria-hidden="true"></canvas>
      <div class="feature-metrics"><span>${compactDollars.format(coin.volume)} <small>24h volume</small></span>${delta(coin.change)}</div>
    </a>`
  ).join('');

  document.querySelector('#rule-examples').innerHTML = Object.entries(rules).map(([key, rule], index) =>
    `<details class="rule-example" ${index === 0 ? 'open' : ''}>
      <summary><span class="rule-icon" aria-hidden="true">${rule.mark}</span><span>${rule.name}</span><span class="detail-toggle" aria-hidden="true"></span></summary>
      <p>${rule.description}</p>
    </details>`
  ).join('');

  site.addEventListener('click', event => {
    const button = event.target.closest('button[data-session]');
    if (!button) return;
    session = button.dataset.session;
    site.querySelectorAll('[data-session]').forEach(toggle => toggle.setAttribute('aria-pressed', String(toggle === button)));
    site.querySelector('.figure-state').textContent = session === 'open' ? 'MARKET OPEN' : 'MARKET CLOSED';
    site.querySelector('#hero-fee').innerHTML = `${session === 'open' ? '0.80' : '1.50'}<span>%</span>`;
    site.querySelector('#hero-announcement').textContent = session === 'open' ? 'Market open · 0.80% trading fee' : 'Market closed · 1.50% trading fee';
    drawBell(site.querySelector('#bell-art'), session === 'closed');
  });

  const figures = new ResizeObserver(() => {
    if (site.hidden) return;
    drawBell(site.querySelector('#bell-art'), session === 'closed');
    site.querySelectorAll('[data-feature]').forEach(canvas => {
      const coin = originalCoins.find(item => item.id === canvas.dataset.feature);
      drawSeries(canvas, makeSeries(coin), { color: coin.change < 0 ? '#AF3C4E' : '#2452F5' });
    });
  });
  figures.observe(site.querySelector('.hero-figure'));
  figures.observe(site.querySelector('.featured-markets'));
}

function appFrame(active, content) {
  return `<header class="app-header">
    <div class="app-header-inner">
      <a class="wordmark" href="#/" aria-label="StockHooks home"><i class="brand-mark" aria-hidden="true"></i>StockHooks</a>
      <nav aria-label="App navigation">
        <a href="#/markets" ${active === 'markets' ? 'aria-current="page"' : ''}>Markets</a>
        <a href="#/launch" ${active === 'launch' ? 'aria-current="page"' : ''}>Create</a>
      </nav>
      <div class="app-header-end"><span class="chain-label"><span class="base-mark"></span> Base</span><span class="demo-label">Demo</span></div>
    </div>
  </header>
  <main class="app-main" id="main-app" tabindex="-1">${content}</main>
  <footer class="app-footer"><span>StockHooks on Base</span><a href="#rules">How it works</a></footer>`;
}

function showMarkets(stockFilter) {
  view.stock = stockById[stockFilter] ? stockFilter : 'all';
  app.innerHTML = appFrame('markets', `
    <div class="app-heading">
      <div><h1>Markets</h1><p>Discover memes by the stock they trade against.</p></div>
      <a href="#/launch" class="button button-primary">Launch a coin</a>
    </div>
    <nav class="stock-rail" aria-label="Filter markets by stock">
      <a class="stock-tile" href="#/markets" ${view.stock === 'all' ? 'aria-current="true"' : ''}>
        <span class="stock-avatar stock-all" aria-hidden="true">▦</span><span><strong>All stocks</strong><small>${allCoins().length} markets</small></span>
      </a>
      ${stocks.map(stock => `<a class="stock-tile" href="#/markets/${stock.id}" ${view.stock === stock.id ? 'aria-current="true"' : ''}>
        ${stockAvatar(stock)}<span><strong>${stock.id}</strong><small>${stock.name}</small></span>${delta(stock.move)}
      </a>`).join('')}
    </nav>
    <section class="table-panel" aria-labelledby="market-table-title">
      <div class="table-tools">
        <div><h2 id="market-table-title">${view.stock === 'all' ? 'All markets' : `${view.stock} markets`}</h2><span class="table-note">Sample data</span></div>
        <div class="table-controls">
          <label class="search-field"><span aria-hidden="true"></span><input id="search-markets" type="search" placeholder="Search coins" aria-label="Search coins" value="${escapeHtml(view.search)}"></label>
          <label class="sort-field"><span class="sr-only">Sort markets</span><select id="sort-markets"><option value="volume">24h volume</option><option value="new">Newest</option><option value="change">24h change</option><option value="cap">Market cap</option></select></label>
        </div>
      </div>
      <div class="markets-table" id="market-rows"></div>
    </section>
  `);

  const search = app.querySelector('#search-markets');
  const sort = app.querySelector('#sort-markets');
  sort.value = view.order;
  function renderRows() {
    const query = view.search.trim().toLowerCase();
    const coins = allCoins().filter(coin =>
      (view.stock === 'all' || view.stock === coin.stock) &&
      [coin.name, coin.symbol, coin.stock].some(field => field.toLowerCase().includes(query))
    );
    coins.sort((a, b) => view.order === 'new' ? a.age - b.age : b[view.order] - a[view.order]);
    const rows = app.querySelector('#market-rows');
    if (!coins.length) {
      rows.innerHTML = '<p class="empty-state">No coins match your search.</p>';
      return;
    }
    rows.innerHTML = `<div class="market-table-head" aria-hidden="true"><span>Coin</span><span>Paired stock</span><span>24h change</span><span>Market cap</span><span>24h volume</span><span>Rules</span></div>
      ${coins.map(coin => `<a class="market-table-row" href="#/coin/${encodeURIComponent(coin.id)}">
        <span class="coin-identity">${avatar(coin)}<span><strong>${escapeHtml(coin.symbol)}</strong><small>${escapeHtml(coin.name)} · ${ageLabel(coin.age)}</small></span></span>
        <span class="paired-stock"><span class="pair-dot"></span>${coin.stock}</span>
        <span>${delta(coin.change)}</span><span class="monospace metric-cap">${compactDollars.format(coin.cap)}</span>
        <span class="monospace metric-volume">${compactDollars.format(coin.volume)}</span><span class="row-rules">${ruleLabels(coin) || '—'}</span>
      </a>`).join('')}`;
  }
  search.addEventListener('input', () => { view.search = search.value; renderRows(); });
  sort.addEventListener('change', () => { view.order = sort.value; renderRows(); });
  renderRows();
}

function showLaunch() {
  const settings = { ...baseline };
  let stock = stocks[0];
  let simulation = 'open';
  app.innerHTML = appFrame('launch', `
    <div class="app-heading">
      <div><a class="back-link" href="#/markets">Markets</a><h1>Launch a coin</h1><p>Choose a stock, then decide how it changes your market.</p></div>
      <span class="demo-label">Demo builder</span>
    </div>
    <form id="launch-form" class="launch-layout">
      <div class="launch-fields">
        <fieldset class="form-panel">
          <legend class="sr-only">Paired stock</legend>
          <h2>Paired stock</h2><p>The token your coin trades against.</p>
          <div class="stock-options">
            ${stocks.map((entry, index) => `<label class="stock-option">
              <input type="radio" name="stock" value="${entry.id}" ${index === 0 ? 'checked' : ''}>
              ${stockAvatar(entry)}<span><strong>${entry.id}</strong><small>${entry.name}</small></span>
            </label>`).join('')}
          </div>
        </fieldset>
        <fieldset class="form-panel">
          <legend class="sr-only">Coin identity</legend>
          <h2>Coin identity</h2>
          <div class="field-grid">
            <label>Coin name<input name="name" maxlength="36" required placeholder="Silicon Alley"></label>
            <label>Ticker<input name="symbol" maxlength="10" required pattern="[A-Za-z0-9]{2,10}" title="Use 2 to 10 letters or numbers" placeholder="CHIPS"></label>
          </div>
          <label class="form-field">Opening market cap <div class="field-unit"><input name="cap" type="number" min="5000" max="50000" step="100" value="10000" required><span>USD</span></div></label>
        </fieldset>
        <fieldset class="form-panel rules-form">
          <legend class="sr-only">Trading rules</legend>
          <h2>Trading rules</h2><p>Rule settings lock when a real launch goes onchain.</p>
          ${Object.entries(rules).map(([key, rule]) => `<div class="builder-rule">
            <label class="builder-rule-header" for="rule-${key}">
              <span class="rule-icon" aria-hidden="true">${rule.mark}</span>
              <span><strong>${rule.name}</strong><small>${rule.description}</small></span>
              ${key === 'snipe'
                ? '<span class="rule-tag included">Included</span><input class="sr-only" id="rule-snipe" type="checkbox" checked disabled>'
                : `<input id="rule-${key}" class="switch" type="checkbox" name="${key}" ${settings[key] ? 'checked' : ''}>`}
            </label>
            <div class="rule-parameters" data-parameters="${key}">${ruleInputs(key)}</div>
          </div>`).join('')}
        </fieldset>
      </div>
      <aside class="launch-preview">
        <section class="preview-panel" aria-labelledby="preview-title">
          <div class="preview-panel-header"><span class="experience-dot"></span><h2 id="preview-title">Launch preview</h2></div>
          <div class="preview-coin"><div class="preview-avatar" id="preview-avatar">?</div><div><strong id="preview-symbol">Your coin</strong><span id="preview-pair">Paired with NVDAc</span></div></div>
          <div class="preview-line"><span>Opening market cap</span><strong id="preview-cap">$10,000.00</strong></div>
          <div class="preview-session"><span>Market session</span><div class="segmented" aria-label="Market session"><button type="button" data-sim="open" aria-pressed="true">Open</button><button type="button" data-sim="closed" aria-pressed="false">Closed</button></div></div>
          <div class="preview-fees"><span>Trading fee after launch window</span><strong id="preview-fee" aria-live="polite">0.80%</strong><small id="preview-snipe"></small></div>
          <div class="split-section"><h3>Swap fee split</h3><div id="split-bar" class="split-bar" aria-hidden="true"></div><dl id="split-legend" class="split-legend"></dl></div>
          <button class="button button-primary full-button" type="submit">Save demo launch</button>
          <p class="preview-note">Saves in this browser. No wallet signature required.</p>
          <p id="launch-feedback" role="status"></p>
        </section>
      </aside>
    </form>
  `);

  const form = app.querySelector('#launch-form');
  const fields = form.elements;

  function updatePreview() {
    stock = stockById[fields.stock.value];
    for (const key of ['floor', 'bell', 'shadow', 'red', 'diamond']) settings[key] = fields[key].checked;
    if (!settings.floor) {
      settings.red = false;
      settings.diamond = false;
      fields.red.checked = false;
      fields.diamond.checked = false;
    }
    fields.red.disabled = !settings.floor;
    fields.diamond.disabled = !settings.floor;
    form.querySelectorAll('[data-parameters]').forEach(parameters => {
      const key = parameters.dataset.parameters;
      const enabled = key === 'snipe' || settings[key];
      parameters.hidden = !enabled;
      parameters.querySelectorAll('input[type="number"]').forEach(input => { input.disabled = !enabled || (input.name === 'payoutDays' && !settings.diamond); });
    });

    for (const key of ['openFee', 'closeFee', 'vaultShare', 'sensitivity', 'redTrigger', 'payoutDays', 'snipeFee', 'snipeMinutes']) {
      settings[key] = fields[key].validity.valid && fields[key].value !== '' ? Number(fields[key].value) : baseline[key];
    }

    const name = fields.name.value.trim();
    const symbol = fields.symbol.value.trim().toUpperCase();
    app.querySelector('#preview-symbol').textContent = symbol || name || 'Your coin';
    app.querySelector('#preview-avatar').textContent = symbol.slice(0, 2) || name.slice(0, 1).toUpperCase() || '?';
    app.querySelector('#preview-pair').textContent = `Paired with ${stock.id}`;
    app.querySelector('#preview-cap').textContent = fields.cap.value ? dollars.format(Number(fields.cap.value)) : '—';
    app.querySelector('#preview-fee').textContent = `${getFee(settings, stock, simulation).toFixed(2)}%`;
    app.querySelector('#preview-snipe').textContent = `Snipe Tax starts at ${settings.snipeFee}% and decays over ${settings.snipeMinutes}m.`;
    const feeSplit = getFeeSplit(settings, stock, simulation);
    const labels = [
      { label: 'Share vault', value: feeSplit.vault, color: 'blue' },
      { label: 'Creator', value: feeSplit.launcher, color: 'steel' },
      { label: 'Platform / ops', value: feeSplit.platform, color: 'mist' },
    ];
    app.querySelector('#split-bar').innerHTML = labels.map(item => `<span class="split-${item.color}" style="width: ${item.value}%"></span>`).join('');
    app.querySelector('#split-legend').innerHTML = labels.map(item => `<div><dt><i class="split-${item.color}"></i>${item.label}</dt><dd>${item.value}%</dd></div>`).join('');
  }

  form.addEventListener('input', updatePreview);
  form.addEventListener('change', updatePreview);
  form.addEventListener('click', event => {
    const button = event.target.closest('[data-sim]');
    if (!button) return;
    simulation = button.dataset.sim;
    form.querySelectorAll('[data-sim]').forEach(toggle => toggle.setAttribute('aria-pressed', String(toggle === button)));
    updatePreview();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const name = fields.name.value.trim();
    if (!name) {
      fields.name.setCustomValidity('Enter a coin name.');
      fields.name.reportValidity();
      fields.name.addEventListener('input', () => fields.name.setCustomValidity(''), { once: true });
      return;
    }
    const symbol = fields.symbol.value.trim().toUpperCase();
    const id = `demo-${crypto.randomUUID()}`;
    const coin = { id, name, symbol, stock: stock.id, art: '', age: 0, cap: Number(fields.cap.value), volume: 0, change: 0, vault: 0, payout: settings.diamond ? 50 : 100, rules: ['snipe', ...['floor', 'bell', 'shadow', 'red'].filter(key => settings[key])], settings: { ...settings }, draft: true };
    const nextDrafts = [coin, ...drafts];
    try {
      localStorage.setItem(draftKey, JSON.stringify(nextDrafts));
    } catch {
      form.querySelector('#launch-feedback').textContent = 'This browser could not save your demo. You can still adjust the preview.';
      return;
    }
    drafts = nextDrafts;
    view.search = '';
    location.hash = `/coin/${id}`;
  });
  updatePreview();
}

function ruleInputs(key) {
  const number = (name, label, value, min, max, step = 1) => `<label>${label}<input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`;
  if (key === 'bell') return number('openFee', 'Open fee (%)', 0.8, 0.5, 2, 0.01) + number('closeFee', 'Closed fee (%)', 1.5, 0.5, 3, 0.01);
  if (key === 'floor') return number('vaultShare', 'Vault share of fee (%)', 30, 20, 70) + '<label class="diamond-option"><input type="checkbox" name="diamond"> Diamond Redeem</label>' + number('payoutDays', 'Days to full payout', 30, 1, 90);
  if (key === 'shadow') return number('sensitivity', 'Fee adjustment (bps per 1% move)', 20, 5, 50);
  if (key === 'red') return number('redTrigger', 'Stock drop threshold (%)', 2, 1, 10, 0.1);
  return number('snipeFee', 'Starting fee (%)', 25, 10, 50, 0.1) + number('snipeMinutes', 'Decay window (minutes)', 5, 0.5, 30, 0.5);
}

function showCoin(id) {
  const coin = allCoins().find(item => item.id === id);
  if (!coin) {
    app.innerHTML = appFrame('markets', '<div class="empty-state"><h1>Market unavailable</h1><p>Saved demo launches are available in the browser that created them.</p><a class="button button-primary" href="#/markets">Browse markets</a></div>');
    return;
  }

  const stock = stockById[coin.stock];
  const settings = coin.settings || { ...baseline, bell: coin.rules.includes('bell'), shadow: coin.rules.includes('shadow'), floor: coin.rules.includes('floor'), red: coin.rules.includes('red') };
  const ruleList = coin.rules.filter(key => rules[key]);
  const hasVault = coin.rules.includes('floor');
  const price = coin.cap / 1e9;
  const floor = coin.vault / 2.7e8;
  let range = '24h';
  let mode = 'sell';
  let selectedSession = 'open';
  const priceLabel = value => value ? '$' + value.toFixed(6) : '—';

  app.innerHTML = appFrame('markets', `
    <a class="back-link" href="#/markets/${stock.id}">${stock.id} markets</a>
    <div class="coin-page-title">
      ${avatar(coin, 'large-avatar')}
      <div><h1>${escapeHtml(coin.symbol)} <span>/ ${stock.id}</span></h1><p>${escapeHtml(coin.name)} · ${stock.name} pair</p></div>
      <span class="demo-label">${coin.draft ? 'Demo launch saved' : 'Sample market'}</span>
    </div>
    <div class="coin-layout">
      <div class="coin-main">
        <section class="chart-panel" aria-labelledby="price-heading">
          <div class="chart-top">
            <div><h2 id="price-heading">Meme price</h2><div class="coin-price">${priceLabel(price)} ${delta(coin.change)}</div></div>
            <div class="segmented chart-ranges" aria-label="Chart range">${['1h', '24h', '7d'].map(option => `<button type="button" data-range="${option}" aria-pressed="${option === range}">${option}</button>`).join('')}</div>
          </div>
          ${coin.draft ? '<div class="chart-empty">Your demo market has no trades yet.</div>' : '<canvas id="coin-chart" role="img" aria-label="Illustrative normalized price trend for the meme and its paired stock"></canvas>'}
          <div class="chart-bottom"><span><i class="legend-meme"></i>${escapeHtml(coin.symbol)}</span><span><i class="legend-stock"></i>${stock.id}</span><span class="chart-caption">Illustrative trend · normalized</span></div>
        </section>
        <section class="fee-panel" aria-labelledby="active-rule-title">
          <div class="fee-heading">
            <div><h2 id="active-rule-title">Active rules</h2><p>Configured at launch</p></div>
            <div class="segmented coin-sessions" aria-label="Market session"><button type="button" data-market-session="open" aria-pressed="true">Market open</button><button type="button" data-market-session="closed" aria-pressed="false">Market closed</button></div>
          </div>
          ${ruleList.map(key => `<div class="active-rule"><span class="rule-icon" aria-hidden="true">${rules[key].mark}</span><span><strong>${rules[key].name}</strong><small>${rules[key].description}</small></span><span data-effect="${key}"></span></div>`).join('')}
        </section>
      </div>
      <aside class="coin-aside">
        <section class="trade-panel" aria-labelledby="trade-title">
          <div class="trade-heading"><h2 id="trade-title">Trade preview</h2><span class="demo-label">Demo</span></div>
          <div class="segmented trade-tabs" aria-label="Trade action">
            <button type="button" data-mode="buy" aria-pressed="false">Buy</button><button type="button" data-mode="sell" aria-pressed="true">Sell</button>
            ${hasVault ? '<button type="button" data-mode="redeem" aria-pressed="false">Redeem</button>' : ''}
          </div>
          <label class="form-field" for="trade-amount">You pay</label>
          <div class="field-unit"><input type="number" id="trade-amount" min="0" step="any" value="100000" inputmode="decimal"><span id="trade-unit">${escapeHtml(coin.symbol)}</span></div>
          <div class="quote-summary" aria-live="polite"><span>Estimated output</span><strong id="quote-out"></strong><small id="quote-fee"></small></div>
          ${hasVault ? '<div id="quote-compare" class="quote-comparison"></div>' : ''}
          <p class="preview-note trade-note">Example quotes using sample prices. Price impact and network fees are excluded.</p>
        </section>
        ${hasVault ? `<section class="vault-panel" aria-labelledby="vault-title"><h2 id="vault-title">Share vault</h2><div class="vault-value">${units.format(coin.vault)} <span>${stock.id}</span></div>
          <dl class="vault-metrics"><div><dt>Floor per 1M ${escapeHtml(coin.symbol)}</dt><dd>${units.format(floor * 1e6)} ${stock.id}</dd></div><div><dt>Sample payout rate</dt><dd>${coin.payout}%</dd></div></dl></section>` : ''}
        <section class="market-stats" aria-label="Coin statistics"><dl>
          <div><dt>Market cap</dt><dd>${compactDollars.format(coin.cap)}</dd></div><div><dt>24h volume</dt><dd>${compactDollars.format(coin.volume)}</dd></div><div><dt>Stock move</dt><dd>${delta(stock.move)}</dd></div>
        </dl></section>
      </aside>
    </div>
  `);

  const chart = app.querySelector('#coin-chart');
  resizeCharts = () => {
    if (!chart) return;
    drawSeries(chart, makeSeries(coin, range), { grid: true, fill: true, benchmark: makeSeries(coin, range, true) });
  };

  function updateQuotes() {
    const fee = getFee(settings, stock, selectedSession);
    const amount = Math.max(0, Number(app.querySelector('#trade-amount').value) || 0);
    const sold = amount * price / stock.price * (1 - fee / 100);
    const redeemed = amount * floor * coin.payout / 100;
    const bought = amount * stock.price / price * (1 - fee / 100);
    const isBuying = mode === 'buy';
    const output = isBuying ? bought : mode === 'redeem' ? redeemed : sold;

    app.querySelector('#trade-unit').textContent = isBuying ? stock.id : coin.symbol;
    app.querySelector('#quote-out').textContent = `${units.format(output)} ${isBuying ? coin.symbol : stock.id}`;
    app.querySelector('#quote-fee').textContent = mode === 'redeem' ? `${coin.payout}% of vault floor · Burns the meme` : `${fee.toFixed(2)}% example swap fee`;
    const compare = app.querySelector('#quote-compare');
    if (compare) {
      compare.hidden = isBuying;
      compare.innerHTML = `<div><span>Sell</span><strong>${units.format(sold)} ${stock.id}</strong></div><div><span>Redeem</span><strong>${units.format(redeemed)} ${stock.id}</strong></div>`;
    }

    const effects = {
      bell: `${fee.toFixed(2)}% current fee`,
      floor: `${units.format(coin.vault)} ${stock.id}`,
      red: selectedSession === 'open' && stock.move <= -settings.redTrigger ? 'Boost active' : 'Boost inactive',
      shadow: selectedSession === 'closed' ? 'Paused after hours' : `${percent(stock.move)} stock move`,
      snipe: coin.draft ? `${settings.snipeFee}% at launch` : 'Launch window ended',
    };
    app.querySelectorAll('[data-effect]').forEach(element => { element.textContent = effects[element.dataset.effect]; });
  }

  app.querySelector('#trade-amount').addEventListener('input', updateQuotes);
  app.onclick = event => {
    const button = event.target.closest('[data-range], [data-mode], [data-market-session]');
    if (!button) return;
    if (button.dataset.range) {
      range = button.dataset.range;
      resizeCharts();
    } else if (button.dataset.mode) {
      if ((mode === 'buy') !== (button.dataset.mode === 'buy')) app.querySelector('#trade-amount').value = button.dataset.mode === 'buy' ? '0.1' : '100000';
      mode = button.dataset.mode;
      updateQuotes();
    } else {
      selectedSession = button.dataset.marketSession;
      updateQuotes();
    }
    button.parentElement.querySelectorAll('button').forEach(toggle => toggle.setAttribute('aria-pressed', String(toggle === button)));
  };
  updateQuotes();
  resizeCharts();
}

function route(initial = false) {
  const hash = location.hash;
  const path = hash.startsWith('#/') ? hash.slice(2).split('/') : [];
  const isApp = ['markets', 'launch', 'coin'].includes(path[0]);
  site.hidden = isApp;
  app.hidden = !isApp;
  document.body.classList.toggle('in-app', isApp);
  resizeCharts = () => {};
  app.onclick = null;
  document.querySelector('.skip-link').href = isApp ? '#main-app' : '#main';

  if (isApp) {
    if (path[0] === 'launch') showLaunch();
    else if (path[0] === 'coin') showCoin(path[1]);
    else showMarkets(path[1]);
    document.title = `${app.querySelector('h1')?.textContent || 'Markets'} — StockHooks`;
    window.scrollTo(0, 0);
    if (!initial) app.querySelector('main').focus({ preventScroll: true });
    return;
  }

  document.title = 'StockHooks — The stock sets the rules.';
  if (hash === '#rules') document.querySelector('#rules').scrollIntoView();
  else if (hash === '#main') document.querySelector('#main').focus();
  else if (!initial) window.scrollTo(0, 0);
}

document.querySelector('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  document.querySelector(app.hidden ? '#main' : '#main-app').focus();
});
window.addEventListener('hashchange', () => route());
window.addEventListener('resize', () => resizeCharts());
paintHome();
route(true);
