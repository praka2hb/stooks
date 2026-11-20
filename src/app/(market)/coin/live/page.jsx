import { Suspense } from 'react';
import { LiveMarket } from '../../../../components/live-coin';

export const metadata = { title: 'Live coin' };

export default function LiveCoinPage() {
  return (
    <Suspense fallback={<p className="empty-state" role="status">Loading market…</p>}>
      <LiveMarket />
    </Suspense>
  );
}
