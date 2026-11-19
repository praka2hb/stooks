# StockHooks frontend

StockHooks uses the Next.js App Router. Install dependencies and start the development server from this directory.

```sh
npm ci
npm run dev
```

Open [the local app](http://localhost:3000/). Explore `/markets/`, inspect a coin at `/coin/chips/`, or configure a demo launch at `/launch/`.

Run `npm run build` to generate the production export in `out/`. Run `npm run preview` to serve that export locally with Python 3.

The market feed, coin charts, and quotes use sample data. The launch builder saves demo coins in the current browser using local storage.
