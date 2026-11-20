'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { dollars, originalCoins, percent, stocks } from '../lib/market-data.mjs';
import { coinPath, marketPath } from '../lib/routes.mjs';

/** NYSE regular session in New York time (weekends only; holidays are handled on-chain by MarketClock). */
function nyseStatus(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' })
      .formatToParts(now).map(p => [p.type, p.value]),
  );
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  const weekday = !['Sat', 'Sun'].includes(parts.weekday);
  const open = weekday && minutes >= 570 && minutes < 960;
  const left = open ? 960 - minutes : null;
  return { open, left: left === null ? '' : `${Math.floor(left / 60)}h ${left % 60}m` };
}

export function MarketStatus({ compact = false }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    const tick = () => setStatus(nyseStatus());
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  if (!status) return <span className="market-status" aria-hidden="true"><i />NYSE</span>;
  return (
    <span className={`market-status ${status.open ? 'is-open' : 'is-closed'}`} title="US stock market regular hours, New York time">
      <i aria-hidden="true" />
      NYSE {status.open ? 'open' : 'closed'}
      {!compact && status.open && <span className="market-status-left"> · closes in {status.left}</span>}
    </span>
  );
}

const tapeItems = [
  ...stocks.map(s => ({ key: s.id, href: marketPath(s.id), label: s.id, value: dollars.format(s.price), move: s.move })),
  ...originalCoins.slice(0, 6).map(c => ({ key: c.id, href: coinPath(c.id), label: `$${c.symbol}`, value: c.stock, move: c.change })),
];

/** Scrolling quote tape. The list is rendered twice so the loop is seamless; the copy is hidden from screen readers. */
export function TickerTape() {
  const row = hidden => tapeItems.map(item => (
    <Link key={`${item.key}${hidden ? '-copy' : ''}`} href={item.href} className="tape-item" tabIndex={hidden ? -1 : undefined}>
      <strong>{item.label}</strong>
      <span>{item.value}</span>
      <span className={item.move < 0 ? 'down' : 'up'}>{item.move < 0 ? '▼' : '▲'} {percent(item.move).slice(1)}</span>
    </Link>
  ));
  return (
    <div className="tape" aria-label="Sample quotes">
      <span className="tape-label">Sample quotes</span>
      <div className="tape-track">
        <div className="tape-run">{row(false)}</div>
        <div className="tape-run" aria-hidden="true">{row(true)}</div>
      </div>
    </div>
  );
}

/** The quote tape for app pages, left off Markets where the trending rail already shows prices. */
export function AppTape() {
  return usePathname().startsWith('/markets') ? null : <TickerTape />;
}
