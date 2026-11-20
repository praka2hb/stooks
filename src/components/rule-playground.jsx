'use client';

import { useState } from 'react';
import { clamp, defaultSettings as d, getFee, getFeeSplit, rules } from '../lib/market-data.mjs';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const signed = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}%`;
const pct = (v, digits = 2) => `${v.toFixed(digits)}%`;
const order = ['floor', 'bell', 'shadow', 'red', 'diamond', 'pass', 'earnings'];
const TICKER = 'NVDA';

// ------------------------------------------------------------------ controls

function Slider({ label, value, onChange, min, max, step, format }) {
  return (
    <label className="pg-slider">
      <span className="pg-control-label">{label}<output>{format(value)}</output></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} />
    </label>
  );
}

function Toggle({ label, options, value, onChange }) {
  return (
    <div className="pg-toggle">
      <span className="pg-control-label">{label}</span>
      <div role="group" aria-label={label}>
        {options.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
      </div>
    </div>
  );
}

function Readout({ items }) {
  return (
    <dl className="pg-readout">
      {items.map(([label, value, tone]) => <div key={label}><dt>{label}</dt><dd className={tone}>{value}</dd></div>)}
    </dl>
  );
}

/** Controls and numbers on the left, the rule's animated picture on the right. */
function Layout({ controls, readout, note, stage, tone = 'blue' }) {
  return (
    <>
      <div className="pg-controls">{controls}</div>
      <div className={`pg-stage stage-${tone}`} aria-hidden="true">{stage}</div>
      <div className="pg-results">{readout}<p className="pg-note">{note}</p></div>
    </>
  );
}

// ------------------------------------------------------------------ rules

function Floor() {
  const [size, setSize] = useState(1000);
  const [trades, setTrades] = useState(500);
  const vault = size * 0.01 * trades;
  // Log scale so small and huge vaults both move the fill visibly.
  const level = clamp(Math.log10(vault + 1) / Math.log10(1_000_001), 0.06, 1);
  const drops = Math.round(clamp(size / 2500, 1, 6));
  return (
    <Layout
      controls={<>
        <Slider label="Trade size" value={size} onChange={setSize} min={50} max={20000} step={50} format={v => usd.format(v)} />
        <Slider label="Trades like it" value={trades} onChange={setTrades} min={1} max={5000} step={1} format={v => v.toLocaleString('en-US')} />
      </>}
      readout={<Readout items={[
        ['Fee on this trade', usd.format(size * 0.015)],
        ['Buys stock for the vault', usd.format(size * 0.01), 'up'],
        ['Vault after these trades', usd.format(vault), 'up'],
      ]} />}
      note={`Two thirds of every fee becomes real ${TICKER} in the coin’s vault. No withdraw function: stock leaves only when holders redeem.`}
      tone="ink"
      stage={
        <div className="vis-vault">
          <div className="vis-drops">{Array.from({ length: drops }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.35}s`, left: `${18 + ((i * 37) % 64)}%` }} />)}</div>
          <div className="vis-jar"><div className="vis-fill" style={{ height: `${level * 100}%` }}><span>{TICKER}</span></div></div>
          <span className="vis-caption">{usd.format(vault)} of stock</span>
        </div>
      }
    />
  );
}

function Bell() {
  const [hour, setHour] = useState(11);
  const open = hour >= 9.5 && hour < 16;
  const fee = getFee({ ...d, bell: true, shadow: false }, { move: 0 }, open ? 'open' : 'closed');
  const time = h => `${String(Math.floor(h)).padStart(2, '0')}:${h % 1 ? '30' : '00'} NY`;
  // 24h dial: 0h at the top, clockwise.
  const angle = (hour / 24) * 360;
  const arc = (from, to, r) => {
    const p = h => [100 + r * Math.sin((h / 24) * 2 * Math.PI), 100 - r * Math.cos((h / 24) * 2 * Math.PI)];
    const [x1, y1] = p(from); const [x2, y2] = p(to);
    return `M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  return (
    <Layout
      controls={<Slider label="Time on a weekday" value={hour} onChange={setHour} min={0} max={23.5} step={0.5} format={time} />}
      readout={<Readout items={[
        ['Stock market', open ? 'Open' : 'Closed', open ? 'up' : 'amber'],
        ['Trading fee now', pct(fee)],
        ['Fee on a $1,000 trade', usd.format(fee * 10)],
      ]} />}
      note={`The launcher picks both fees. Here: ${pct(d.openFee)} while Wall Street trades, ${pct(d.closeFee)} after the bell.`}
      tone={open ? 'mint' : 'ink'}
      stage={
        <div className="vis-clock">
          <svg viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="84" className="dial" />
            <path d={arc(9.5, 16, 84)} className="dial-open" />
            {[0, 6, 12, 18].map(h => <text key={h} x={100 + 66 * Math.sin(h / 24 * 2 * Math.PI)} y={104 - 66 * Math.cos(h / 24 * 2 * Math.PI)}>{h}</text>)}
            <line x1="100" y1="100" x2="100" y2="34" className="hand" style={{ transform: `rotate(${angle}deg)` }} />
            <circle cx="100" cy="100" r="6" className="hub" />
          </svg>
          <div className={`vis-bell${open ? ' ringing' : ''}`}><BellIcon /><strong>{pct(fee)}</strong></div>
        </div>
      }
    />
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 48 48" className="bell-icon">
      <path d="M24 6c-8 0-13 6-13 14v9l-4 6h34l-4-6v-9c0-8-5-14-13-14z" />
      <circle cx="24" cy="40" r="4" />
    </svg>
  );
}

function Shadow() {
  const [move, setMove] = useState(2);
  const [session, setSession] = useState('open');
  const fee = getFee({ ...d, bell: false, shadow: true }, { move }, session);
  const tilt = session === 'closed' ? 0 : clamp(move * 3.2, -16, 16);
  return (
    <Layout
      controls={<>
        <Slider label={`${TICKER} today`} value={move} onChange={setMove} min={-6} max={6} step={0.1} format={signed} />
        <Toggle label="Stock market" options={[['open', 'Open'], ['closed', 'Closed']]} value={session} onChange={setSession} />
      </>}
      readout={<Readout items={[
        ['Trading fee now', pct(fee), fee < 1.5 ? 'up' : fee > 1.5 ? 'down' : ''],
        ['vs normal 1.50%', fee === 1.5 ? 'Same' : `${fee < 1.5 ? '−' : '+'}${Math.abs(fee - 1.5).toFixed(2)}`],
      ]} />}
      note={session === 'closed' ? 'Paused after hours: the fee sits at its normal level until the next open.' : `Green days make the coin cheaper to trade, red days make it pricier. Capped at ±${d.maxShift}%.`}
      tone={session === 'closed' ? 'ink' : move >= 0 ? 'mint' : 'red'}
      stage={
        <div className="vis-seesaw">
          <div className="beam" style={{ transform: `rotate(${-tilt}deg)` }}>
            <span className="end stock">{TICKER}<b>{signed(move)}</b></span>
            <span className="end fee">FEE<b>{pct(fee)}</b></span>
          </div>
          <div className="pivot" />
        </div>
      }
    />
  );
}

function Red() {
  const [move, setMove] = useState(-3);
  const split = getFeeSplit({ ...d, red: true }, { move }, 'open');
  const on = move <= -d.redTrigger;
  const candle = clamp(Math.abs(move) * 14, 8, 112);
  const C = 2 * Math.PI * 42;
  return (
    <Layout
      controls={<Slider label={`${TICKER} today`} value={move} onChange={setMove} min={-8} max={3} step={0.1} format={signed} />}
      readout={<Readout items={[
        ['Boost', on ? 'On' : `Off till −${d.redTrigger}%`, on ? 'up' : ''],
        ['Fees to the vault', pct(split.vault, 1), on ? 'up' : ''],
        ['Stock bought per $1K traded', usd.format(15 * split.vault / 100)],
      ]} />}
      note="When the stock sells off, the vault takes a bigger cut and buys more of it. Buying the dip, automatically."
      tone={on ? 'red' : 'ink'}
      stage={
        <div className="vis-red">
          <div className={`vis-candle ${move < 0 ? 'down' : 'up'}`}><i style={{ height: candle }} /><span>{signed(move)}</span></div>
          <div className={`vis-arrow${on ? ' on' : ''}`}>→</div>
          <svg viewBox="0 0 100 100" className="vis-donut">
            <circle cx="50" cy="50" r="42" className="track" />
            <circle cx="50" cy="50" r="42" className="value" strokeDasharray={`${(split.vault / 100) * C} ${C}`} />
            <text x="50" y="50">{Math.round(split.vault)}%</text>
            <text x="50" y="66" className="small">to vault</text>
          </svg>
        </div>
      }
    />
  );
}

function Diamond() {
  const [days, setDays] = useState(10);
  const payout = days >= d.payoutDays ? 100 : d.minPayout + (100 - d.minPayout) * days / d.payoutDays;
  return (
    <Layout
      controls={<Slider label="You’ve held for" value={days} onChange={setDays} min={0} max={40} step={1} format={v => `${v} day${v === 1 ? '' : 's'}`} />}
      readout={<Readout items={[
        ['Redeem payout', pct(payout, 0), payout === 100 ? 'up' : ''],
        ['Share of 1 NVDA you get', `${(payout / 100).toFixed(2)}`],
        ['Left for holders who stay', `${(1 - payout / 100).toFixed(2)}`],
      ]} />}
      note="Leave early and part of your share stays in the vault, raising the floor for everyone who stayed."
      tone={payout === 100 ? 'mint' : 'blue'}
      stage={
        <div className={`vis-diamond${payout === 100 ? ' full' : ''}`}>
          <svg viewBox="0 0 160 150">
            <defs><clipPath id="gem"><path d="M40 10h80l30 38-70 92-70-92z" /></clipPath></defs>
            <path d="M40 10h80l30 38-70 92-70-92z" className="gem-outline" />
            <rect x="0" y={150 - (payout / 100) * 140} width="160" height="150" clipPath="url(#gem)" className="gem-fill" />
            <path d="M10 48h140M40 10l20 38 20-38 20 38 20-38M60 48l20 92 20-92" className="gem-facets" />
          </svg>
          <strong>{Math.round(payout)}%</strong>
          {payout === 100 && <span className="sparkles"><i /><i /><i /></span>}
        </div>
      }
    />
  );
}

function Pass() {
  const [holds, setHolds] = useState('yes');
  const yes = holds === 'yes';
  const fee = yes ? 1.5 * (1 - d.passDiscount / 100) : 1.5;
  return (
    <Layout
      controls={<Toggle label={`Wallet holds ${d.minShares}+ ${TICKER} token`} options={[['yes', 'Yes'], ['no', 'No']]} value={holds} onChange={setHolds} />}
      readout={<Readout items={[
        ['Your trading fee', pct(fee), yes ? 'up' : ''],
        ['On a $1,000 trade', usd.format(fee * 10)],
        ['You save', yes ? usd.format((1.5 - fee) * 10) : '—'],
      ]} />}
      note="Real shareholders trade the meme at a discount. Checked on-chain at the moment of the trade."
      tone={yes ? 'mint' : 'ink'}
      stage={
        <div className={`vis-pass${yes ? ' valid' : ''}`}>
          <div className="ticket">
            <span className="ticket-top">Shareholder pass</span>
            <strong>{TICKER}</strong>
            <span className="ticket-fee">Fee {pct(fee)}</span>
            <span className="stamp">{yes ? 'Verified' : 'No shares'}</span>
          </div>
        </div>
      }
    />
  );
}

function Earnings() {
  const [move, setMove] = useState(4);
  const result = move >= 1 ? 'beat' : move <= -1 ? 'miss' : 'flat';
  return (
    <Layout
      controls={<>
        <Slider label={`${TICKER} after the report`} value={move} onChange={setMove} min={-10} max={10} step={0.5} format={signed} />
        <div className="pg-zones">
          <span className={result === 'miss' ? 'on down' : ''}>Miss ≤ −1%</span>
          <span className={result === 'flat' ? 'on' : ''}>Flat</span>
          <span className={result === 'beat' ? 'on up' : ''}>Beat ≥ +1%</span>
        </div>
      </>}
      readout={<Readout items={result === 'beat'
        ? [['Result', 'Beat', 'up'], ['Redeem payout', '100%', 'up'], ['For everyone, for', `${d.beatDays} days`]]
        : result === 'miss'
          ? [['Result', 'Miss', 'down'], ['Vault spends on buyback', `${d.missBurn}%`], ['Coins bought back', 'Burned']]
          : [['Result', 'Flat'], ['What happens', 'Nothing']]} />}
      note={result === 'beat' ? 'The waiting period is lifted: every holder can cash out at their full share.' : result === 'miss' ? 'The vault buys coins from the pool over 24 hours and burns them. Fewer coins, same backing.' : 'Moves under 1% either way are treated as noise.'}
      tone={result === 'beat' ? 'mint' : result === 'miss' ? 'red' : 'ink'}
      stage={
        <div className={`vis-bomb ${result}`} key={result}>
          <svg viewBox="0 0 160 160">
            <path d="M104 44c10-14 22-18 34-12" className="fuse" />
            <circle cx="70" cy="96" r="44" className="bomb-body" />
            <rect x="88" y="44" width="24" height="18" rx="4" transform="rotate(35 100 53)" className="bomb-cap" />
            <circle cx="140" cy="31" r="5" className="spark" />
          </svg>
          {result === 'beat' && <span className="burst">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ transform: `rotate(${i * 30}deg)` }} />)}</span>}
          {result === 'miss' && <span className="flames"><i /><i /><i /></span>}
          <strong>{result === 'beat' ? '100% PAYOUT' : result === 'miss' ? 'BUYBACK + BURN' : 'NO EFFECT'}</strong>
        </div>
      }
    />
  );
}

const panels = { floor: Floor, bell: Bell, shadow: Shadow, red: Red, diamond: Diamond, pass: Pass, earnings: Earnings };

export function RulePlayground() {
  const [active, setActive] = useState('floor');
  const Panel = panels[active];
  const rule = rules[active];
  return (
    <div className="playground">
      <div className="pg-list" role="tablist" aria-label="Rules">
        {order.map(id => (
          <button
            key={id} type="button" role="tab" id={`pg-tab-${id}`} aria-selected={active === id} aria-controls="pg-panel"
            onClick={() => setActive(id)}
          >
            <span>{rules[id].name}</span>
            {rules[id].always && <small>Always on</small>}
          </button>
        ))}
      </div>
      <div className="pg-panel" role="tabpanel" id="pg-panel" aria-labelledby={`pg-tab-${active}`}>
        <h3>{rule.name}</h3>
        <p className="pg-desc">{rule.description}</p>
        <div className="pg-body" key={active}><Panel /></div>
      </div>
    </div>
  );
}
