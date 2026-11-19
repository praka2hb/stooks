import Link from 'next/link';
import { Brand } from '../../components/market-ui';
import { AppNavigation } from '../../components/app-navigation';

export default function MarketLayout({ children }) {
  return (
    <div className="application-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Brand />
          <AppNavigation />
          <div className="app-header-end"><span className="chain-label"><span className="base-mark" aria-hidden="true" /> Base</span><span className="demo-label">Demo</span></div>
        </div>
      </header>
      <main id="main" className="app-main" tabIndex={-1}>{children}</main>
      <footer className="app-footer"><span>StockHooks on Base</span><Link href="/#rules">How it works</Link></footer>
    </div>
  );
}
