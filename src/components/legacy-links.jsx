'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { coinPath, marketPath } from '../lib/routes.mjs';

export function LegacyLinks() {
  const router = useRouter();

  useEffect(() => {
    function redirect() {
      if (window.location.pathname !== '/' || !window.location.hash.startsWith('#/')) return;
      const [route, id] = window.location.hash.slice(2).split('/');
      if (route === 'markets') router.replace(marketPath(id));
      if (route === 'launch') router.replace('/launch/');
      if (route === 'coin' && id) router.replace(coinPath(id));
    }
    redirect();
    window.addEventListener('hashchange', redirect);
    return () => window.removeEventListener('hashchange', redirect);
  }, [router]);

  return null;
}
