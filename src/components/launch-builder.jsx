'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveDraft } from '../lib/drafts';
import { defaultSettings, dollars, getFee, getFeeSplit, rules, sessionOptions, stocks, stockById } from '../lib/market-data.mjs';
import { coinPath } from '../lib/routes.mjs';
import { RuleIcon, Segmented, StockAvatar } from './market-ui';

const editableRules = ['floor', 'bell', 'shadow', 'red'];

function NumberParameter({ name, label, settings, update, min, max, step = 1, disabled }) {
  return (
    <label>
      {label}
      <input
        type="number" name={name} defaultValue={settings[name]} min={min} max={max} step={step}
        disabled={disabled} required
        onChange={event => {
          const { value, valueAsNumber, validity } = event.target;
          update(name, value !== '' && validity.valid ? valueAsNumber : defaultSettings[name]);
        }}
      />
    </label>
  );
}

function RuleParameters({ id, settings, update, disabled }) {
  function number(name, label, min, max, step, disabledByOption) {
    return <NumberParameter name={name} label={label} settings={settings} update={update} min={min} max={max} step={step} disabled={disabled || disabledByOption} />;
  }

  return (
    <div className="rule-parameters" hidden={disabled}>
      {id === 'bell' && <>{number('openFee', 'Open fee (%)', 0.5, 2, 0.01)}{number('closeFee', 'Closed fee (%)', 0.5, 3, 0.01)}</>}
      {id === 'floor' && (
        <>
          {number('vaultShare', 'Vault share of fee (%)', 20, 70)}
          <label className="diamond-option">
            <input type="checkbox" name="diamond" checked={settings.diamond} disabled={disabled} onChange={event => update('diamond', event.target.checked)} /> Diamond Redeem
          </label>
          {number('payoutDays', 'Days to full payout', 1, 90, 1, !settings.diamond)}
        </>
      )}
      {id === 'shadow' && number('sensitivity', 'Fee adjustment (bps per 1% move)', 5, 50)}
      {id === 'red' && number('redTrigger', 'Stock drop threshold (%)', 1, 10, 0.1)}
      {id === 'snipe' && <>{number('snipeFee', 'Starting fee (%)', 10, 50, 0.1)}{number('snipeMinutes', 'Decay window (minutes)', 0.5, 30, 0.5)}</>}
    </div>
  );
}

function LaunchPreview({ name, symbol, stock, cap, session, setSession, settings, feedback }) {
  const feeSplit = getFeeSplit(settings, stock, session);
  const split = [
    { label: 'Share vault', value: feeSplit.vault, color: 'blue' },
    { label: 'Creator', value: feeSplit.launcher, color: 'steel' },
    { label: 'Platform / ops', value: feeSplit.platform, color: 'mist' },
  ];

  return (
    <aside className="launch-preview">
      <section className="preview-panel" aria-labelledby="preview-title">
        <div className="preview-panel-header"><span className="experience-dot" /><h2 id="preview-title">Launch preview</h2></div>
        <div className="preview-coin">
          <div className="preview-avatar">{symbol.slice(0, 2) || name.slice(0, 1).toUpperCase() || '?'}</div>
          <div><strong>{symbol || name || 'Your coin'}</strong><span>Paired with {stock.id}</span></div>
        </div>
        <div className="preview-line"><span>Opening market cap</span><strong>{cap ? dollars.format(Number(cap)) : '—'}</strong></div>
        <div className="preview-session">
          <span>Market session</span><Segmented label="Market session" options={sessionOptions} value={session} onChange={setSession} />
        </div>
        <div className="preview-fees">
          <span>Trading fee after launch window</span><strong id="preview-fee" aria-live="polite">{getFee(settings, stock, session).toFixed(2)}%</strong>
          <small>Snipe Tax starts at {settings.snipeFee}% and decays over {settings.snipeMinutes}m.</small>
        </div>
        <section className="split-section">
          <h3>Swap fee split</h3>
          <div className="split-bar" aria-hidden="true">{split.map(({ color, value }) => <span key={color} className={`split-${color}`} style={{ width: `${value}%` }} />)}</div>
          <dl className="split-legend">
            {split.map(({ label, color, value }) => <div key={label}><dt><i className={`split-${color}`} />{label}</dt><dd>{value}%</dd></div>)}
          </dl>
        </section>
        <button className="button button-primary full-button" type="submit">Save demo launch</button>
        <p className="preview-note">Saves in this browser. No wallet signature required.</p>
        <p id="launch-feedback" role="status">{feedback}</p>
      </section>
    </aside>
  );
}

export function LaunchBuilder() {
  const router = useRouter();
  const [stockId, setStockId] = useState(stocks[0].id);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [cap, setCap] = useState('10000');
  const [settings, setSettings] = useState(defaultSettings);
  const [session, setSession] = useState('open');
  const [feedback, setFeedback] = useState('');
  const stock = stockById[stockId];

  function updateSetting(key, value) {
    setSettings(current => {
      if (key === 'floor' && !value) return { ...current, floor: false, diamond: false, red: false };
      return { ...current, [key]: value };
    });
  }

  function onSubmit(event) {
    event.preventDefault();
    if (!name.trim()) {
      setFeedback('Enter a coin name.');
      event.currentTarget.elements.namedItem('name').focus();
      return;
    }

    const coin = {
      id: `demo-${crypto.randomUUID()}`, name: name.trim(), symbol: symbol.toUpperCase(), stock: stock.id,
      art: '', age: 0, cap: Number(cap), volume: 0, change: 0, vault: 0,
      payout: settings.diamond ? 50 : 100,
      rules: ['snipe', ...editableRules.filter(key => settings[key])], settings, draft: true,
    };
    try {
      saveDraft(coin);
    } catch {
      setFeedback('This browser could not save your demo.');
      return;
    }
    router.push(coinPath(coin.id));
  }

  return (
    <>
      <div className="app-heading">
        <div><Link className="back-link" href="/markets/">Markets</Link><h1>Launch a coin</h1><p>Choose a stock, then decide how it changes your market.</p></div>
        <span className="demo-label">Demo builder</span>
      </div>
      <form className="launch-layout" onSubmit={onSubmit}>
        <div className="launch-fields">
          <fieldset className="form-panel">
            <legend className="sr-only">Paired stock</legend>
            <h2>Paired stock</h2><p>The token your coin trades against.</p>
            <div className="stock-options">
              {stocks.map(entry => (
                <label className="stock-option" key={entry.id}>
                  <input type="radio" name="stock" value={entry.id} checked={stockId === entry.id} onChange={() => setStockId(entry.id)} />
                  <StockAvatar stock={entry} /><span><strong>{entry.id}</strong><small>{entry.name}</small></span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="form-panel">
            <legend className="sr-only">Coin identity</legend>
            <h2>Coin identity</h2>
            <div className="field-grid">
              <label>Coin name<input name="name" maxLength={36} required placeholder="Silicon Alley" value={name} onChange={event => { setName(event.target.value); setFeedback(''); }} /></label>
              <label>Ticker<input name="symbol" maxLength={10} required pattern="[A-Za-z0-9]{2,10}" title="Use 2 to 10 letters or numbers" placeholder="CHIPS" value={symbol} onChange={event => setSymbol(event.target.value)} /></label>
            </div>
            <label className="form-field">
              Opening market cap <span className="field-unit"><input name="cap" type="number" min="5000" max="50000" step="100" value={cap} required onChange={event => setCap(event.target.value)} /><span>USD</span></span>
            </label>
          </fieldset>
          <fieldset className="form-panel rules-form">
            <legend className="sr-only">Trading rules</legend>
            <h2>Trading rules</h2><p>Rule settings lock when a real launch goes onchain.</p>
            {Object.entries(rules).map(([id, rule]) => (
              <div className="builder-rule" key={id}>
                <label className="builder-rule-header">
                  <RuleIcon rule={rule} />
                  <span><strong>{rule.name}</strong><small>{rule.description}</small></span>
                  {id === 'snipe'
                    ? <span className="rule-tag included">Included</span>
                    : <input className="switch" type="checkbox" name={id} checked={settings[id]} disabled={id === 'red' && !settings.floor} onChange={event => updateSetting(id, event.target.checked)} />}
                </label>
                <RuleParameters id={id} settings={settings} update={updateSetting} disabled={id !== 'snipe' && !settings[id]} />
              </div>
            ))}
          </fieldset>
        </div>
        <LaunchPreview name={name.trim()} symbol={symbol.toUpperCase()} stock={stock} cap={cap} session={session} setSession={setSession} settings={settings} feedback={feedback} />
      </form>
    </>
  );
}
