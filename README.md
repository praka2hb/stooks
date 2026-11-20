# StockHooks frontend

StockHooks uses the Next.js App Router. Install dependencies and start the development server from this directory.

```sh
npm ci
npm run dev
```

Open [the local app](http://localhost:3000/). Explore `/markets/`, inspect a coin at `/coin/chips/`, or configure a demo launch at `/launch/`.

Run `npm run build` to generate the production export in `out/`. Run `npm run preview` to serve that export locally with Python 3.

The market feed, coin charts, and quotes use sample data. The launch builder saves demo coins in the current browser using local storage.

## Live mode (on-chain)

Copy `.env.local.example` to `.env.local` and fill in the addresses printed by `contracts/script/Deploy.s.sol`.
With a factory address set, the app switches from sample data to the contracts on Base:

- **Markets** lists every coin from the factory's `Launched` events, with live price, FDV, vault and rules.
- **Launch** sends `StockHooksFactory.launch` (Share Floor always on, up to 4 more rules) and opens the new coin.
- **Coin page** (`/coin/live/?id=<poolId>`) reads the pool price, vault, floor and your payout rate, and lets you
  buy and sell through `StockHooksRouter` (quoted by simulation, 2% max slippage) and redeem from the vault.

Leave `NEXT_PUBLIC_FACTORY` empty to stay in demo mode. `NEXT_PUBLIC_DEV_KEY` is for local anvil rehearsals only
and is ignored unless the RPC is localhost. Price charts need an indexer and are not built yet.
