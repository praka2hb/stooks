import { notFound } from 'next/navigation';
import { CoinMarket } from '../../../../components/coin-market';
import { originalCoins } from '../../../../lib/market-data.mjs';

export function generateStaticParams() {
  return originalCoins.map(({ id }) => ({ id }));
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const coin = originalCoins.find(entry => entry.id === id);
  return { title: coin ? `${coin.symbol} / ${coin.stock}` : 'Market unavailable' };
}

export default async function CoinPage({ params }) {
  const { id } = await params;
  const coin = originalCoins.find(entry => entry.id === id);
  if (!coin) notFound();
  return <CoinMarket coin={coin} />;
}
