import { Geist_Mono, Nunito } from 'next/font/google';
import './globals.css';
import { LegacyLinks } from '../components/legacy-links';

// Self-hosted at build time by next/font; no requests go to Google from the browser.
// Same stack as Pons: SF Pro Rounded on Apple devices, Nunito (variable weight) everywhere else.
const sans = Nunito({ subsets: ['latin'], variable: '--font-sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata = {
  title: { default: 'Stooks — The stock sets the rules', template: '%s — Stooks' },
  description: 'Launch a coin wired to a tokenized stock on Base. Market hours, red days and earnings change its fees, payouts and buybacks automatically.',
  icons: { icon: '/assets/favicon.png' },
};

export const viewport = { themeColor: '#f2f2f0' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <LegacyLinks />
        <a className="skip-link" href="#main">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
