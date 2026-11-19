import { notFound } from 'next/navigation';
import { Markets } from '../../../../components/markets';
import { stocks } from '../../../../lib/market-data.mjs';

export function generateStaticParams() {
  return stocks.map(({ id }) => ({ stock: id }));
}

export async function generateMetadata({ params }) {
  const { stock } = await params;
  return { title: `${stock} Markets` };
}

export default async function StockMarketsPage({ params }) {
  const { stock } = await params;
  if (!stocks.some(entry => entry.id === stock)) notFound();
  return <Markets stockFilter={stock} />;
}
