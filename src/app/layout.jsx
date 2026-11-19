import './globals.css';
import { LegacyLinks } from '../components/legacy-links';

export const metadata = {
  title: { default: 'StockHooks — The stock sets the rules.', template: '%s — StockHooks' },
  description: 'A launchpad for memes paired with tokenized stocks. Explore markets and preview rules before you launch.',
  icons: { icon: '/assets/favicon.png' },
};

export const viewport = { themeColor: '#0b1224' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <LegacyLinks />
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
