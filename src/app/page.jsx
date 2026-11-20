import Link from 'next/link';
import { Avatar, Brand, Delta } from '../components/market-ui';
import { MarketChart } from '../components/market-graphics';
import { MarketStatus, TickerTape } from '../components/market-chrome';
import { RulePlayground } from '../components/rule-playground';
import { compactDollars, originalCoins, units } from '../lib/market-data.mjs';
import { coinPath } from '../lib/routes.mjs';
import stockList from '../lib/stock-list.json';

const movers = [...originalCoins].sort((a, b) => Math.abs(b.change) - Math.abs(a.change)).slice(0, 6);

// Rising candles behind the hero headline. Fixed numbers so server and client render the same SVG.
const candles = Array.from({ length: 20 }, (_, i) => {
  const body = 90 + i * 22 + Math.round(Math.sin(i * 1.7) * 38);
  const wick = 24 + Math.round(Math.abs(Math.cos(i * 2.3)) * 30);
  return { i, x: 20 + i * 44, body, wick, tone: i === 16 ? 'mint' : i % 4 === 1 ? 'light' : 'deep' };
});
const fills = { deep: '#0a2a9e', light: '#3a69ff', mint: '#6dffc4' };

function HeroBars() {
  return (
    <svg className="hero-bars" viewBox="0 0 900 700" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
      {candles.map(c => (
        <g key={c.x} className={c.tone} fill={fills[c.tone]} opacity={c.tone === 'mint' ? 1 : 0.9} style={{ animationDelay: `${c.i * 45}ms` }}>
          <rect x={c.x + 13} y={700 - c.body - c.wick} width="4" height={c.body + c.wick} />
          <rect x={c.x} y={700 - c.body} width="30" height={c.body} rx="3" />
        </g>
      ))}
    </svg>
  );
}

const stats = [
  { value: stockList.length, text: 'Tokenized stocks a coin can pair with on Base', icon: 'grid' },
  { value: '1%', text: 'Of every trade buys real stock into the coin’s vault', icon: 'vault' },
  { value: '7', text: 'Rules that react to the stock market', icon: 'rules' },
  { value: '100%', text: 'Of supply goes into the pool at launch. No presale', icon: 'pool' },
];

const versus = [
  ['What the stock does', 'Sits in the pool as the pair', 'Runs the coin’s rules, live'],
  ['Opening bell', 'Nothing happens', 'Fees switch between market hours and after close'],
  ['Red day', 'Nothing happens', 'The vault takes a bigger cut and buys the dip'],
  ['Earnings', 'Just news', 'Beat: 100% payouts for a week. Miss: buyback and burn'],
  ['Holding longer', 'Same as selling day one', 'Diamond Redeem pays up to your full share'],
  ['When the hype dies', 'Your coin can go to zero', 'Your coins still redeem for real stock'],
  ['When you want out', 'Sell into the pool', 'Sell, or redeem your share of the vault’s stock'],
];

function StatIcon({ kind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 };
  return (
    <svg viewBox="0 0 92 92" aria-hidden="true">
      <rect x="6" y="6" width="80" height="80" rx="18" {...common} />
      {kind === 'grid' && [0, 1, 2].flatMap(r => [0, 1, 2].map(c => <rect key={`${r}${c}`} x={24 + c * 16} y={24 + r * 16} width="10" height="10" rx="2" fill={r === 1 && c === 1 ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />))}
      {kind === 'vault' && <><rect x="26" y="30" width="40" height="36" rx="4" {...common} /><circle cx="46" cy="48" r="7" {...common} /><path d="M46 41v-6M46 61v-6" {...common} /></>}
      {kind === 'rules' && [0, 1, 2].map(r => <g key={r}><path d={`M24 ${32 + r * 14}h44`} {...common} /><circle cx={r === 1 ? 56 : 34} cy={32 + r * 14} r="4" fill="currentColor" /></g>)}
      {kind === 'pool' && <><path d="M22 56c8-8 16-8 24 0s16 8 24 0" {...common} /><path d="M22 44c8-8 16-8 24 0s16 8 24 0" {...common} /><path d="M46 22v14" {...common} /></>}
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="home">
      <header className="site-header">
        <div className="nav-inner">
          <Brand />
          <nav aria-label="Main navigation">
            <Link href="/markets/">Markets</Link>
            <a href="#how">How it works</a>
            <a href="#rules">Rules</a>
            <Link href="/launch/">Launch</Link>
          </nav>
          <div className="nav-end">
            <MarketStatus />
            <Link className="button button-primary" href="/launch/">Launch a coin</Link>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className="hero hero-panel" aria-labelledby="hero-title">
          <HeroBars />
          <div className="hero-inner">
            <div className="hero-copy">
            <h1 id="hero-title">The stock<br />sets the<span>rules</span></h1>
            <p className="hero-description">
              Launch a coin wired to NVDA, TSLA or any of {stockList.length} tokenized stocks on Base. Market hours, red days and earnings change its fees, payouts and buybacks, automatically.
            </p>
            <div className="actions">
              <Link className="button button-primary button-large" href="/launch/">Launch a coin</Link>
              <Link className="button button-outline button-large" href="/markets/">Explore markets</Link>
            </div>
            <p className="hero-proof"><i aria-hidden="true">✓</i>Your coin can’t go to zero. It always redeems for real stock.</p>
            </div>
            <figure className="hero-art">
              <img src="/assets/art/bull.webp" width="1254" height="1254" alt="Stooks mascot: a navy ceramic bull wearing a gold chain, standing on a stack of mint stock certificates" fetchPriority="high" />
            </figure>
          </div>
        </section>
        <TickerTape />

        <section id="how" className="shell home-section" aria-labelledby="how-title">
          <div className="section-head">
            <span className="kicker">How it works</span>
            <h2 id="how-title">Pick a ticker. Set the rules. Let the market do the rest.</h2>
          </div>
          <div className="feature-cards">
            <article className="feature-card">
              <div className="feature-art blue" aria-hidden="true">
                <div className="art-tickers">{['NVDAc', 'TSLAc', 'AAPLc', 'SPCXc', 'MSFTc', 'METAc'].map((t, i) => <span key={t} className={i === 0 ? 'on' : ''}>{t}</span>)}</div>
              </div>
              <div className="feature-body">
                <h3>Pick a stock</h3>
                <p>Your coin trades against the stock token itself, not ETH. {stockList.length} to choose from.</p>
              </div>
            </article>
            <article className="feature-card">
              <div className="feature-art photo" aria-hidden="true">
                <img src="/assets/art/bomb.webp" width="1254" height="1254" alt="" loading="lazy" />
              </div>
              <div className="feature-body">
                <h3>Set the rules</h3>
                <p>Market hours, red days, earnings. Pick up to 4. They lock on-chain at launch, so nobody can change them later, including us.</p>
              </div>
            </article>
            <article className="feature-card">
              <div className="feature-art photo" aria-hidden="true">
                <img src="/assets/art/vault.webp" width="1254" height="1254" alt="" loading="lazy" />
              </div>
              <div className="feature-body">
                <h3>Fill the vault</h3>
                <p>1% of every trade buys real stock. Hype can fade, the floor stays: holders can always burn coins for their share of it.</p>
              </div>
            </article>
          </div>
        </section>

        <section className="shell home-section" aria-labelledby="vs-title">
          <div className="section-head">
            <span className="kicker">Why Stooks</span>
            <h2 id="vs-title">Other launchpads pair coins with stocks. Stooks wires them to the market.</h2>
          </div>
          <div className="versus" role="table" aria-label="Other stock launchpads compared with Stooks">
            <div className="versus-row versus-head" role="row">
              <span role="columnheader" />
              <span role="columnheader" className="them">Other stock launchpads</span>
              <span role="columnheader" className="us">Stooks</span>
            </div>
            {versus.map(([topic, them, us]) => (
              <div className="versus-row" role="row" key={topic}>
                <span role="rowheader">{topic}</span>
                <span role="cell" className="them"><i aria-hidden="true">✕</i>{them}</span>
                <span role="cell" className="us"><i aria-hidden="true">✓</i>{us}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="shell home-section" aria-label="Stooks in numbers">
          <div className="stats">
            {stats.map(s => (
              <div key={s.icon}>
                <StatIcon kind={s.icon} />
                <strong>{s.value}</strong>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="shell home-section" aria-labelledby="board-title">
          <div className="section-head">
            <span className="kicker">Markets</span>
            <h2 id="board-title">Top movers</h2>
          </div>
          <div className="board-card">
            <div className="board" role="table" aria-label="Top moving coins, sample data">
              <div className="board-head" role="row">
                <span role="columnheader">Coin</span><span role="columnheader">Stock</span><span role="columnheader">24h</span>
                <span role="columnheader" className="board-chart-col">Trend</span><span role="columnheader">Vault</span><span role="columnheader">Mkt cap</span>
              </div>
              {movers.map(coin => (
                <Link key={coin.id} href={coinPath(coin.id)} className="board-row" role="row">
                  <span className="coin-identity" role="cell"><Avatar coin={coin} /><span><strong>{coin.symbol}</strong><small>{coin.name}</small></span></span>
                  <span className="paired-stock" role="cell">{coin.stock}</span>
                  <span role="cell"><Delta value={coin.change} /></span>
                  <span className="board-chart-col board-spark" role="cell"><MarketChart coin={coin} /></span>
                  <span className="monospace" role="cell">{coin.vault ? `${units.format(coin.vault)} ${coin.stock}` : '—'}</span>
                  <span className="monospace" role="cell">{compactDollars.format(coin.cap)}</span>
                </Link>
              ))}
            </div>
          </div>
          <p className="board-note">Sample data. Live coins show here once launched on Base.</p>
          <div className="board-foot"><Link className="text-link" href="/markets/">View all markets</Link></div>
        </section>

        <section id="rules" className="shell home-section" aria-labelledby="rules-title">
          <div className="section-head">
            <span className="kicker">The rules</span>
            <h2 id="rules-title">Move the market. Watch the coin react.</h2>
            <p className="section-lede">Pick a rule and move the market. Examples use NVIDIA and the default settings.</p>
          </div>
          <RulePlayground />
        </section>

        <section className="shell home-cta" aria-labelledby="cta-title">
          <div className="cta-copy">
            <span className="kicker">Launch in one transaction</span>
            <h2 id="cta-title">The market closes at 4pm. Your coin doesn’t.</h2>
            <p>Pick a stock, pick your rules, and the whole supply goes into the pool. No presale, no team allocation.</p>
            <Link className="button button-primary button-large" href="/launch/">Launch a coin</Link>
          </div>
          <figure className="cta-art">
            <img src="/assets/art/surfer.webp" width="1024" height="1536" alt="A grinning meme coin in sunglasses surfing up a rising candlestick chart" loading="lazy" />
          </figure>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell footer-inner">
          <div>
            <Brand />
            <p>Coins wired to the stock market, on Base.</p>
          </div>
          <div className="footer-col"><h3>Product</h3><Link href="/markets/">Markets</Link><Link href="/launch/">Launch a coin</Link></div>
          <div className="footer-col"><h3>Learn</h3><a href="#how">How it works</a><a href="#rules">Rules</a></div>
          <div className="footer-col"><h3>US market</h3><span className="footer-net"><MarketStatus compact /></span></div>
        </div>
        <div className="shell footer-base"><span>Stooks</span><span>Tokenized stocks on Base · Uniswap v4</span></div>
      </footer>
    </div>
  );
}
