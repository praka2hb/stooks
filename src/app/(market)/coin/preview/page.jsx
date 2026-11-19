import { Suspense } from 'react';
import { DraftMarket } from '../../../../components/draft-market';

export const metadata = { title: 'Demo coin' };

export default function CoinPreviewPage() {
  return (
    <Suspense fallback={<p className="empty-state" role="status">Loading demo market…</p>}>
      <DraftMarket />
    </Suspense>
  );
}
