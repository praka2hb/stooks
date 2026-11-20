import Link from 'next/link';
import { Brand } from '../../components/market-ui';
import { AppNavigation } from '../../components/app-navigation';
import { WalletButton } from '../../components/wallet-button';
import { AppTape, MarketStatus } from '../../components/market-chrome';

export default function MarketLayout({ children }) {
  return (
    <div className="application-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Brand />
          <AppNavigation />
          <div className="app-header-end">
            <MarketStatus compact />
            <span className="chain-label"><span className="base-mark" aria-hidden="true" /> Base</span>
            <WalletButton />
          </div>
        </div>
      </header>
      <AppTape />
      <main id="main" className="app-main" tabIndex={-1}>{children}</main>
      <footer className="app-footer"><span>Stooks · the stock sets the rules</span><Link href="/#rules">How it works</Link></footer>
    </div>
  );
}
