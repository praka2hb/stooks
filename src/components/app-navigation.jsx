'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AppNavigation() {
  const isLaunch = usePathname().startsWith('/launch');
  return (
    <nav aria-label="App navigation">
      <Link href="/markets/" aria-current={!isLaunch ? 'page' : undefined}>Markets</Link>
      <Link href="/launch/" aria-current={isLaunch ? 'page' : undefined}>Create</Link>
    </nav>
  );
}
