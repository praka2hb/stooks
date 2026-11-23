'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

// Floating top bar that morphs into a centred dark pill once you scroll.
//
// Two stacked layers share the same item positions:
//   A: the real, focusable links in ink on a transparent bar.
//   B: an aria-hidden copy in white on a black panel, drawn on top of A.
// At the top of the page B is clipped down to just the CTA, so you see a
// plain bar with a black button. On scroll every item slides to its packed
// position and B's clip-path opens into a pill around them. Positions are
// measured from A, so it fits any label lengths.

const isInternal = href => href.startsWith('/');
const NavLink = ({ href, ...rest }) => (isInternal(href) ? <Link href={href} {...rest} /> : <a href={href} {...rest} />);

// Packed-pill padding (px): left pad, logo→divider, divider→links, links→cta, right pad.
const PAD_L = 16, GAP_LOGO = 14, GAP_SEP = 17, GAP_LINKS = 18, PAD_R = 4;

export function MorphNav({ links, cta }) {
  const header = useRef(null);
  const sizes = useRef('');
  const [wide, setWide] = useState(false);
  const [ready, setReady] = useState(false);

  const measure = useCallback(() => {
    const el = header.current;
    if (!el) return;
    const bar = el.querySelector('.mn-bar');
    const logo = el.querySelector('.mn-a .mn-logo');
    const list = el.querySelector('.mn-a .mn-links');
    const btn = el.querySelector('.mn-a .mn-cta');
    const W = bar.offsetWidth, L = logo.offsetWidth, N = list.offsetWidth, C = btn.offsetWidth;
    const key = `${W}:${L}:${N}:${C}`;
    if (key === sizes.current) return;
    sizes.current = key;
    const pill = PAD_L + L + GAP_LOGO + (N ? GAP_SEP + N + GAP_LINKS : 0) + C + PAD_R;
    const inset = Math.max(0, (W - pill) / 2);
    const logoB = inset + PAD_L;
    const sepB = logoB + L + GAP_LOGO;
    const vars = {
      '--x0a': 0, '--x0b': logoB,
      '--xsa': L + GAP_LOGO, '--xsb': sepB,
      '--x1a': (W - N) / 2, '--x1b': sepB + GAP_SEP,
      '--x2a': W - C, '--x2b': inset + pill - PAD_R - C,
      '--bl': W - C, '--pl': inset,
    };
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, `${v.toFixed(1)}px`);
  }, []);

  // Hysteresis so the bar doesn't flicker around the threshold.
  const onScroll = useCallback(() => {
    const y = window.scrollY;
    setWide(w => (!w && y > 64 ? true : w && y < 16 ? false : w));
  }, []);

  useLayoutEffect(() => {
    measure();
    onScroll();
    // Turn transitions on only after the first layout, so the page doesn't load mid-morph.
    const t = setTimeout(() => setReady(true), 80);
    return () => clearTimeout(t);
  }, [measure, onScroll]);

  useEffect(() => {
    let frame = 0;
    const tick = () => { frame ||= requestAnimationFrame(() => { frame = 0; onScroll(); }); };
    const resize = () => { frame ||= requestAnimationFrame(() => { frame = 0; measure(); onScroll(); }); };
    window.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', resize);
    document.fonts?.ready.then(measure);
    return () => {
      window.removeEventListener('scroll', tick);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(frame);
    };
  }, [measure, onScroll]);

  return (
    <header ref={header} className={`morph-nav${wide ? ' is-wide' : ''}${ready ? ' is-ready' : ''}`}>
      <div className="mn-bar">
        <div className="mn-track">
          <div className="mn-a">
            <Link className="mn-item mn-i0 mn-logo" href="/" aria-label="Stooks home"><span className="mn-logo-in"><i className="brand-mark" aria-hidden="true" />Stooks</span></Link>
            <nav className="mn-item mn-i1 mn-links" aria-label="Main navigation">
              {links.map(l => <NavLink key={l.href} href={l.href}>{l.label}</NavLink>)}
            </nav>
            <NavLink className="mn-item mn-i2 mn-cta" href={cta.href}>{cta.label}</NavLink>
          </div>
          <div className="mn-b-wrap" aria-hidden="true">
            <div className="mn-b">
              <span className="mn-item mn-i0 mn-logo"><span className="mn-logo-in"><i className="brand-mark" />Stooks</span></span>
              <span className="mn-item mn-sep" />
              <span className="mn-item mn-i1 mn-links">{links.map(l => <span key={l.href}>{l.label}</span>)}</span>
              <span className="mn-item mn-i2 mn-cta"><i className="mn-cta-bg" /><span className="mn-cta-text">{cta.label}</span></span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
