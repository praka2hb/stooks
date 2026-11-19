'use client';

import { useEffect, useRef, useState } from 'react';
import { drawBell, drawSeries, makeSeries } from '../lib/graphics.mjs';

export function BellFigure() {
  const [session, setSession] = useState('open');
  const canvasRef = useRef(null);
  const isOpen = session === 'open';
  const fee = isOpen ? '0.80' : '1.50';

  useEffect(() => {
    const canvas = canvasRef.current;
    const paint = () => drawBell(canvas, !isOpen);
    const resize = new ResizeObserver(paint);
    resize.observe(canvas);
    paint();
    return () => resize.disconnect();
  }, [isOpen]);

  return (
    <figure className="hero-figure" aria-label="Interactive Bell Mode example">
      <div className="figure-top"><span><span className="figure-square" /> BELL MODE</span><span>SIMULATION</span></div>
      <canvas ref={canvasRef} id="bell-art" width="720" height="400" aria-hidden="true" />
      <div className="figure-callout">
        <span className="figure-state">MARKET {session.toUpperCase()}</span>
        <strong id="hero-fee">{fee}<span>%</span></strong>
        <span>TRADING FEE</span>
      </div>
      <div className="figure-bottom">
        <div className="session-switch" role="group" aria-label="Simulate stock market session">
          <button type="button" aria-pressed={isOpen} onClick={() => setSession('open')}>Open</button>
          <button type="button" aria-pressed={!isOpen} onClick={() => setSession('closed')}>Closed</button>
        </div>
        <span className="figure-hint" aria-live="polite">Market {session} · {fee}% example fee</span>
      </div>
    </figure>
  );
}

export function MarketChart({ coin, range = '24h', expanded = false }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const series = makeSeries(coin, range);
    const options = expanded
      ? { grid: true, fill: true, benchmark: makeSeries(coin, range, true) }
      : { color: coin.change < 0 ? '#AF3C4E' : '#2452F5' };
    const paint = () => drawSeries(canvas, series, options);
    const resize = new ResizeObserver(paint);
    resize.observe(canvas);
    paint();
    return () => resize.disconnect();
  }, [coin, range, expanded]);

  return expanded
    ? <canvas ref={canvasRef} id="coin-chart" role="img" aria-label="Illustrative normalized price trend for the meme and its paired stock" />
    : <canvas ref={canvasRef} aria-hidden="true" />;
}
