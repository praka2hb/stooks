import Link from 'next/link';
import { Avatar, Brand, Delta, RuleIcon } from '../components/market-ui';
import { BellFigure, MarketChart } from '../components/market-graphics';
import { compactDollars, dollars, originalCoins, rules, stocks } from '../lib/market-data.mjs';
import { coinPath, marketPath } from '../lib/routes.mjs';

export default function HomePage() {
  return (
    <>
      <header className="site-header">
        <div className="shell nav-inner">
          <Brand />
          <nav aria-label="Main navigation"><Link href="/markets/">Markets</Link><a href="#rules">How it works</a></nav>
          <Link className="button button-primary header-launch" href="/launch/">Launch a coin</Link>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <section className="hero" aria-labelledby="hero-title">
          <div className="shell hero-grid">
            <div className="hero-copy">
              <p className="eyebrow"><span className="base-mark" aria-hidden="true" /> A launchpad on Base</p>
              <h1 id="hero-title">The stock sets<br />the rules.</h1>
              <p className="hero-description">Launch a meme on a tokenized stock. Pick rules that react to the market, and put trading fees to work in a share vault.</p>
              <div className="actions">
                <Link className="button button-primary" href="/launch/">Launch a coin</Link>
                <Link className="button button-outline" href="/markets/">Explore markets</Link>
              </div>
            </div>
            <BellFigure />
          </div>
        </section>
        <section className="tape" aria-label="Sample stock quotes">
          <div className="shell tape-inner">
            <span className="tape-label">DEMO QUOTES</span>
            {stocks.map(stock => (
              <Link key={stock.id} href={marketPath(stock.id)} className="tape-item">
                <strong>{stock.id}</strong><span>{dollars.format(stock.price)}</span><Delta value={stock.move} />
              </Link>
            ))}
          </div>
        </section>
        <section className="shell market-preview" aria-labelledby="market-title">
          <div className="section-head">
            <div><p className="eyebrow light-eyebrow">DISCOVER</p><h2 id="market-title">Start with a stock.</h2></div>
            <Link className="button button-light" href="/markets/">View all markets</Link>
          </div>
          <div className="featured-markets">
            {originalCoins.slice(0, 4).map(coin => (
              <Link className="featured-coin" key={coin.id} href={coinPath(coin.id)}>
                <div className="feature-identity"><Avatar coin={coin} /><div><strong>{coin.symbol}</strong><span>{coin.stock} pair</span></div></div>
                <MarketChart coin={coin} />
                <div className="feature-metrics"><span>{compactDollars.format(coin.volume)} <small>24h volume</small></span><Delta value={coin.change} /></div>
              </Link>
            ))}
          </div>
        </section>
        <section id="rules" className="rules-section">
          <div className="shell rules-layout">
            <div className="rules-intro">
              <p className="eyebrow light-eyebrow">HOW IT WORKS</p>
              <h2>Pick how your<br />coin trades.</h2>
              <p className="body-copy">Choose a stock and configure the trading rules at launch. Once the pool is live, those settings are locked onchain.</p>
              <Link className="button button-primary" href="/launch/">Try the launch builder</Link>
            </div>
            <div>
              {Object.entries(rules).map(([key, rule]) => (
                <details key={key} className="rule-example" open={key === 'bell' || undefined}>
                  <summary><RuleIcon rule={rule} /><span>{rule.name}</span><span className="detail-toggle" aria-hidden="true" /></summary>
                  <p>{rule.description}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="shell footer-inner">
          <Brand /><span>Stock-paired markets on Base</span><Link href="/markets/">Explore markets</Link>
        </div>
      </footer>
    </>
  );
}
