import Link from 'next/link';
import { Brand } from '../components/market-ui';

export default function NotFound() {
  return (
    <div className="shell empty-state">
      <Brand />
      <main id="main" tabIndex={-1}>
        <h1>Market unavailable</h1>
        <p>Open Markets to see the demo coins and stocks available in StockHooks.</p>
        <Link className="button button-primary" href="/markets/">Browse markets</Link>
      </main>
    </div>
  );
}
