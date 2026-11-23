'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import stockList from '../lib/stock-list.json';

// "Trading floor" footer: the whole footer is a grid of square cells.
// Content sits in some cells; the empty ones light up under the cursor and
// stock tiles pop in and out of them like quotes on a board. Click a tile to
// pop it, click an empty cell to drop a new one.

const TILE_STOCKS = stockList.filter(s => s.icon).slice(0, 48);
const TILE_COLORS = ['mint', 'blue', 'paper', 'butter', 'rose', 'sky'];

// [column, row, width, height] in each layout. Desktop columns are relative to
// the centred 12-column block; extra columns either side stay free for tiles.
const LAYOUTS = {
  desk: {
    cols: 12, rows: 7,
    cells: {
      logo: [0, 0, 4, 1], status: [9, 0, 3, 1],
      product: [6, 1, 2, 2], learn: [8, 1, 2, 2], chain: [10, 1, 2, 2],
      tag: [0, 4, 5, 2], cta: [5, 5, 2, 1],
      copy: [0, 6, 2, 1], base: [8, 6, 4, 1],
    },
  },
  tab: {
    cols: 9, rows: 9,
    cells: {
      logo: [0, 0, 4, 1], status: [6, 0, 3, 1],
      product: [0, 2, 3, 2], learn: [3, 2, 3, 2], chain: [6, 2, 3, 2],
      tag: [0, 5, 6, 2], cta: [6, 6, 3, 1],
      copy: [0, 8, 3, 1], base: [4, 8, 5, 1],
    },
  },
  mob: {
    cols: 4, rows: 12,
    cells: {
      logo: [0, 0, 4, 1],
      product: [0, 2, 2, 2], learn: [2, 2, 2, 2], chain: [0, 4, 2, 2],
      status: [0, 7, 4, 1], tag: [0, 8, 4, 2], cta: [0, 10, 3, 1],
      base: [0, 11, 4, 1], copy: null,
    },
  },
};

function measureGrid(width) {
  if (width >= 900) {
    // Below 1200px the 12 content columns shrink to fit; above it they stay 100px.
    if (width < 1200) return { mode: 'desk', cols: 12, rows: 7, cell: width / 12, shift: 0, off: 0 };
    const cell = 100;
    const side = Math.max(0, Math.ceil((width - 1200) / 2 / cell));
    const cols = 12 + side * 2;
    // Shift the board so the 12 content columns line up with the page centre.
    const shift = (width - cols * cell) / 2;
    return { mode: 'desk', cols, rows: 7, cell, shift, off: side };
  }
  const mode = width >= 560 ? 'tab' : 'mob';
  const { cols, rows } = LAYOUTS[mode];
  return { mode, cols, rows, cell: width / cols, shift: 0, off: 0 };
}

function etStatus(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: false,
  }).formatToParts(now).map(p => [p.type, p.value]));
  const minutes = (Number(parts.hour) % 24) * 60 + Number(parts.minute);
  const weekend = parts.weekday === 'Sat' || parts.weekday === 'Sun';
  const open = !weekend && minutes >= 570 && minutes < 960;
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(now);
  return { open, label: weekend ? 'Weekend · market closed' : open ? 'Market open' : 'After the bell', time: `${time} ET` };
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];

export function GridFooter() {
  const wrap = useRef(null);
  const board = useRef(null);
  // Server render assumes a desktop width so the links are in the static HTML.
  const [grid, setGrid] = useState(() => measureGrid(1200));
  const [tiles, setTiles] = useState([]);
  const [bursts, setBursts] = useState([]);
  const [status, setStatus] = useState(null);
  const [shown, setShown] = useState(false);
  const state = useRef({ tiles: [], free: new Set(), visible: false, timer: 0, still: false, seq: 0 });

  // Layout: re-measure on resize.
  useEffect(() => {
    const el = wrap.current;
    const update = () => setGrid(g => {
      const next = measureGrid(el.clientWidth);
      return g && g.mode === next.mode && g.cols === next.cols && Math.abs(g.cell - next.cell) < 0.5 && g.shift === next.shift ? g : next;
    });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Which cells are free for tiles in the current layout.
  const layout = grid ? LAYOUTS[grid.mode] : null;
  const placed = {};
  if (grid) {
    const free = new Set();
    for (let i = 0; i < grid.cols * grid.rows; i++) free.add(i);
    for (const [key, spot] of Object.entries(layout.cells)) {
      if (!spot) continue;
      const [x, y, w, h] = spot;
      const col = x + grid.off;
      placed[key] = { gridColumn: `${col + 1} / span ${w}`, gridRow: `${y + 1} / span ${h}` };
      for (let r = y; r < y + h; r++) for (let c = col; c < col + w; c++) free.delete(r * grid.cols + c);
    }
    // On desktop keep the half-visible edge columns empty.
    if (grid.mode === 'desk' && grid.shift < -grid.cell * 0.25) {
      for (let r = 0; r < grid.rows; r++) { free.delete(r * grid.cols); free.delete(r * grid.cols + grid.cols - 1); }
    }
    state.current.free = free;
  }

  const commit = useCallback(next => { state.current.tiles = next; setTiles(next); }, []);

  const spawn = useCallback((at, life) => {
    const s = state.current;
    const taken = new Set(s.tiles.filter(t => t.phase !== 'out').map(t => t.idx));
    let idx = at;
    if (idx == null) {
      const options = [...s.free].filter(i => !taken.has(i));
      if (!options.length) return;
      idx = pick(options);
    }
    if (!s.free.has(idx) || taken.has(idx)) return;
    const used = new Set(s.tiles.map(t => t.stock.id));
    const stock = pick(TILE_STOCKS.filter(t => !used.has(t.id)).length ? TILE_STOCKS.filter(t => !used.has(t.id)) : TILE_STOCKS);
    const tile = { id: ++s.seq, idx, stock, color: pick(TILE_COLORS), rot: rand(-7, 7).toFixed(1), phase: 'in', born: performance.now() };
    commit([...s.tiles, tile]);
    requestAnimationFrame(() => requestAnimationFrame(() => commit(state.current.tiles.map(t => (t.id === tile.id ? { ...t, phase: 'on' } : t)))));
    if (life && !s.still) setTimeout(() => retire(tile.id, 'out'), life);
  }, [commit]); // eslint-disable-line react-hooks/exhaustive-deps

  const retire = useCallback((id, how) => {
    const s = state.current;
    if (!s.tiles.some(t => t.id === id && t.phase !== 'out' && t.phase !== 'bang')) return;
    commit(s.tiles.map(t => (t.id === id ? { ...t, phase: how } : t)));
    setTimeout(() => commit(state.current.tiles.filter(t => t.id !== id)), 420);
  }, [commit]);

  // Reset tiles when the grid shape changes.
  useEffect(() => { commit([]); }, [grid?.mode, grid?.cols, commit]);

  // Auto-play the board while it is on screen.
  useEffect(() => {
    if (!grid) return;
    const s = state.current;
    s.still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let target = grid.mode === 'desk' ? 6 : 4;
    const loop = () => {
      clearTimeout(s.timer);
      if (!s.visible || s.still) return;
      const live = s.tiles.filter(t => t.phase !== 'out' && t.phase !== 'bang').length;
      const short = live < target;
      if (short) spawn(null, rand(3200, 6400));
      if (Math.random() < 0.1) target = grid.mode === 'desk' ? 5 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 3);
      s.timer = setTimeout(loop, short ? rand(90, 220) : rand(500, 1100));
    };
    const io = new IntersectionObserver(entries => {
      const e = entries[entries.length - 1];
      s.visible = e.isIntersecting;
      if (e.intersectionRatio >= 0.35 || (e.isIntersecting && e.boundingClientRect.bottom <= e.rootBounds.bottom + 1)) setShown(true);
      if (s.visible) {
        if (s.still && !s.tiles.length) for (let i = 0; i < target; i++) spawn(null, 0);
        else s.timer = setTimeout(loop, 300);
      } else clearTimeout(s.timer);
    }, { threshold: [0, 0.02, 0.35, 1] });
    io.observe(wrap.current);
    return () => { io.disconnect(); clearTimeout(s.timer); };
  }, [grid, spawn]);

  // Live NYSE clock (regular hours, weekdays; doesn't know about holidays).
  useEffect(() => {
    const tick = () => setStatus(etStatus(new Date()));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const cellAt = e => {
    if (!grid) return -1;
    const r = board.current.getBoundingClientRect();
    const c = Math.floor((e.clientX - r.left) / grid.cell), row = Math.floor((e.clientY - r.top) / grid.cell);
    return c < 0 || row < 0 || c >= grid.cols || row >= grid.rows ? -1 : row * grid.cols + c;
  };

  // Light up the cell under the cursor; it fades back on its own via CSS.
  const lastLit = useRef(-1);
  const flash = idx => {
    if (idx < 0 || !state.current.free.has(idx)) return;
    const el = board.current.children[idx];
    if (!el) return;
    el.classList.add('is-lit');
    void el.offsetWidth;
    el.classList.remove('is-lit');
  };
  const onMove = e => {
    const idx = cellAt(e);
    if (idx !== lastLit.current) { lastLit.current = idx; flash(idx); }
  };

  const onClick = e => {
    const idx = cellAt(e);
    if (idx < 0 || !state.current.free.has(idx)) return;
    const hit = state.current.tiles.find(t => t.idx === idx && t.phase === 'on');
    if (hit) {
      retire(hit.id, 'bang');
      const bb = board.current.getBoundingClientRect(), wb = wrap.current.getBoundingClientRect();
      const x = bb.left - wb.left + (idx % grid.cols + 0.5) * grid.cell;
      const y = bb.top - wb.top + (Math.floor(idx / grid.cols) + 0.5) * grid.cell;
      const id = `${hit.id}-b`;
      const bits = Array.from({ length: 9 }, (_, i) => {
        const angle = (i / 9) * Math.PI * 2 + rand(-0.3, 0.3);
        const dist = grid.cell * rand(0.55, 0.95);
        return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, glyph: pick(['$', '▲', '●', '◆', hit.stock.id.replace(/c$/, '')[0]]), color: pick(TILE_COLORS) };
      });
      setBursts(b => [...b, { id, x, y, bits }]);
      setTimeout(() => setBursts(b => b.filter(x => x.id !== id)), 900);
      setTimeout(() => spawn(null, rand(3200, 6400)), 500);
    } else {
      flash(idx);
      spawn(idx, rand(3600, 7000));
    }
  };

  const style = grid ? { '--cell': `${grid.cell}px`, '--cols': grid.cols, '--rows': grid.rows, '--shift': `${grid.shift}px` } : undefined;
  const cell = key => (placed[key] ? { ...placed[key] } : { display: 'none' });

  return (
    <footer className={`grid-footer${shown ? ' is-shown' : ''}`} style={style}>
      <div className="gf-wrap" ref={wrap}>
        {grid && (
          <div className="gf-board">
            <div className="gf-grid" ref={board} aria-hidden="true" onPointerMove={onMove} onClick={onClick}>
              {Array.from({ length: grid.cols * grid.rows }, (_, i) => (
                <div key={i} className={`gf-c${i % grid.cols === grid.cols - 1 ? ' gf-end' : ''}${state.current.free.has(i) ? ' gf-free' : ''}`} />
              ))}
            </div>

            <div className="gf-tiles" aria-hidden="true">
              {tiles.map(t => (
                <span key={t.id} className={`gf-tile gf-${t.color} is-${t.phase}`} style={{ gridColumn: (t.idx % grid.cols) + 1, gridRow: Math.floor(t.idx / grid.cols) + 1, '--r': `${t.rot}deg` }}>
                  <img src={t.stock.icon} alt="" loading="lazy" decoding="async" />
                  <b>{t.stock.id.replace(/c$/, '')}</b>
                  <small>{t.stock.name}</small>
                </span>
              ))}
            </div>

            <div className="gf-lay">
              <div className="gf-cell gf-logo" style={{ ...cell('logo'), '--d': '.05s' }}>
                <Link href="/" className="wordmark" aria-label="Stooks home"><i className="brand-mark" aria-hidden="true" />Stooks</Link>
              </div>
              <div className="gf-cell gf-status" style={{ ...cell('status'), '--d': '.1s' }}>
                {status && <><b className={status.open ? 'is-open' : ''}><i aria-hidden="true" />{status.label}</b><span>{status.time}</span></>}
              </div>
              <div className="gf-cell gf-col" style={{ ...cell('product'), '--d': '.16s' }}>
                <p className="gf-h">Product</p>
                <ul><li><Link href="/markets/">Markets</Link></li><li><Link href="/launch/">Launch a coin</Link></li></ul>
              </div>
              <div className="gf-cell gf-col" style={{ ...cell('learn'), '--d': '.22s' }}>
                <p className="gf-h">Learn</p>
                <ul><li><Link href="/#how">How it works</Link></li><li><Link href="/#rules">Rules</Link></li></ul>
              </div>
              <div className="gf-cell gf-col" style={{ ...cell('chain'), '--d': '.28s' }}>
                <p className="gf-h">Built on</p>
                <ul><li><span>Base</span></li><li><span>Uniswap v4</span></li></ul>
              </div>
              <div className="gf-cell gf-tag" style={{ ...cell('tag'), '--d': '.2s' }}>
                <p>The stock<br />sets the <span>rules.</span></p>
              </div>
              <div className="gf-cell gf-cta" style={{ ...cell('cta'), '--d': '.3s' }}>
                <Link className="button gf-btn" href="/launch/">Launch a coin</Link>
              </div>
              <div className="gf-cell gf-copy" style={{ ...cell('copy'), '--d': '.34s' }}>© {new Date().getFullYear()} Stooks</div>
              <div className="gf-cell gf-base" style={{ ...cell('base'), '--d': '.38s' }}>
                <span>Tokenized stocks on Base. Click a tile.</span>
                {grid.mode === 'mob' && <small>© {new Date().getFullYear()} Stooks</small>}
              </div>
            </div>
          </div>
        )}
        {bursts.map(b => (
          <span key={b.id} className="gf-burst" style={{ left: b.x, top: b.y }} aria-hidden="true">
            {b.bits.map((bit, i) => <i key={i} className={`gf-${bit.color}`} style={{ '--dx': `${bit.dx}px`, '--dy': `${bit.dy}px`, '--i': i }}>{bit.glyph}</i>)}
          </span>
        ))}
      </div>
    </footer>
  );
}
