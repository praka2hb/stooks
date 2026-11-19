'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useDrafts } from '../lib/drafts';
import { CoinMarket } from './coin-market';

export function DraftMarket() {
  const id = useSearchParams().get('id');
  const drafts = useDrafts();
  const coin = drafts.find(entry => entry.id === id);
  if (coin) return <CoinMarket key={coin.id} coin={coin} />;

  return (
    <div className="empty-state">
      <h1>Market unavailable</h1><p>Saved demo launches are available in the browser that created them.</p>
      <Link className="button button-primary" href="/markets/">Browse markets</Link>
    </div>
  );
}
