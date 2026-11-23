'use client';

import { useMemo, useState } from 'react';
import { Segmented } from './market-ui';

export const intervals = [['60', '1m'], ['300', '5m'], ['900', '15m'], ['3600', '1h'], ['14400', '4h'], ['86400', '1D']];
const styles = [['line', 'Line'], ['candles', 'Candles']];
const MAX_CANDLES = 60;

const W = 760;
const H = 320;
const PAD = { top: 14, right: 96, bottom: 26, left: 8 };
const VOLUME_SHARE = 0.18; // bottom slice of the plot used for volume bars

/** Small prices need more digits: $0.000009870 rather than $0.00. */
export function usd(n) {
  if (!Number.isFinite(n) || n === 0) return '$0';
  if (Math.abs(n) >= 1) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
  return `$${n.toPrecision(4)}`;
}

/** Bucket trades into OHLC candles; each candle opens at the previous close so the series has no gaps in price. */
function toCandles(trades, interval, toUsd) {
  const buckets = new Map();
  let prevClose = null;
  for (const t of trades) {
    const start = Math.floor(t.time / interval) * interval;
    const price = toUsd(t.priceStock);
    let c = buckets.get(start);
    if (!c) {
      const open = prevClose ?? price;
      c = { start, open, high: Math.max(open, price), low: Math.min(open, price), close: price, volume: 0 };
      buckets.set(start, c);
    }
    c.high = Math.max(c.high, price);
    c.low = Math.min(c.low, price);
    c.close = price;
    c.volume += toUsd(t.priceStock) * t.meme;
    prevClose = price;
  }
  return [...buckets.values()].slice(-MAX_CANDLES);
}

const dateLabel = (seconds, interval) => {
  const d = new Date(seconds * 1000);
  return interval >= 86400
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : interval >= 3600
      ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric' })
      : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

export function ChartToolbar({ style, setStyle, interval, setInterval }) {
  return (
    <div className="td-chart-tools">
      <Segmented label="Chart style" options={styles} value={style} onChange={setStyle} />
      <Segmented label="Candle interval" options={intervals} value={interval} onChange={setInterval} />
    </div>
  );
}

export function PriceChart({ trades, toUsd, style, interval, symbol }) {
  const [hover, setHover] = useState(null);
  const step = Number(interval);
  const candles = useMemo(() => toCandles(trades, step, toUsd), [trades, step, toUsd]);

  if (!candles.length) {
    return <div className="td-chart-empty">No trades yet. The chart starts with the first buy or sell of {symbol}.</div>;
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const priceH = plotH * (1 - VOLUME_SHARE) - 8;
  let lo = Math.min(...candles.map(c => c.low));
  let hi = Math.max(...candles.map(c => c.high));
  if (hi === lo) { hi *= 1.05; lo *= 0.95; }
  const pad = (hi - lo) * 0.08;
  lo -= pad; hi += pad;
  const maxVol = Math.max(...candles.map(c => c.volume), 1e-12);
  const slot = plotW / Math.max(candles.length, 20); // keep candles thin when there are only a few
  const x = i => PAD.left + slot * (i + 0.5);
  const y = p => PAD.top + (hi - p) / (hi - lo) * priceH;
  const volTop = PAD.top + plotH * (1 - VOLUME_SHARE);
  const vy = v => volTop + (1 - v / maxVol) * (plotH * VOLUME_SHARE);
  const body = Math.max(2, slot * 0.62);
  const ticks = Array.from({ length: 5 }, (_, i) => lo + (hi - lo) * (i + 0.5) / 5);
  const labelEvery = Math.max(1, Math.ceil((step >= 3600 ? 120 : 90) / slot)); // keep time labels from overlapping
  const last = candles[candles.length - 1];
  const shown = hover ?? last;
  const linePath = candles.map((c, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(c.close).toFixed(1)}`).join(' ');

  function onMove(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - box.left) / box.width * W;
    const i = Math.round((px - PAD.left) / slot - 0.5);
    setHover(candles[Math.min(candles.length - 1, Math.max(0, i))]);
  }

  return (
    <div className="td-chart">
      <div className="td-ohlc" aria-live="off">
        <span>{dateLabel(shown.start, step)}</span>
        <span>O <b>{usd(shown.open)}</b></span><span>H <b>{usd(shown.high)}</b></span>
        <span>L <b>{usd(shown.low)}</b></span><span>C <b className={shown.close >= shown.open ? 'up' : 'down'}>{usd(shown.close)}</b></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${symbol} price, ${candles.length} candles`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {ticks.map(t => (
          <g key={t}>
            <line className="td-grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="td-axis" x={W - PAD.right + 8} y={y(t) + 4}>{usd(t)}</text>
          </g>
        ))}
        {candles.map((c, i) => (
          <rect key={`v${c.start}`} className={c.close >= c.open ? 'td-vol up' : 'td-vol down'} x={x(i) - body / 2} width={body} y={vy(c.volume)} height={Math.max(1, volTop + plotH * VOLUME_SHARE - vy(c.volume))} />
        ))}
        {style === 'line'
          ? <path className="td-line" d={linePath} />
          : candles.map((c, i) => {
            const up = c.close >= c.open;
            const top = y(Math.max(c.open, c.close));
            return (
              <g key={c.start} className={up ? 'td-candle up' : 'td-candle down'}>
                <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} />
                <rect x={x(i) - body / 2} width={body} y={top} height={Math.max(1.5, y(Math.min(c.open, c.close)) - top)} />
              </g>
            );
          })}
        {hover && <line className="td-cross" x1={x(candles.indexOf(hover))} x2={x(candles.indexOf(hover))} y1={PAD.top} y2={H - PAD.bottom} />}
        <g className={last.close >= last.open ? 'td-last up' : 'td-last down'}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(last.close)} y2={y(last.close)} />
          <rect x={W - PAD.right + 2} y={y(last.close) - 10} width={PAD.right - 4} height={20} rx={4} />
          <text x={W - PAD.right + 8} y={y(last.close) + 4}>{usd(last.close)}</text>
        </g>
        {candles.map((c, i) => (i % labelEvery === 0
          ? <text key={`t${c.start}`} className="td-axis" x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : "middle"}>{dateLabel(c.start, step)}</text>
          : null))}
      </svg>
    </div>
  );
}
