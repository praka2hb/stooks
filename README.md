# StockHooks frontend

The site is in `dist/`. Serve it from this directory with Python 3.

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

Open [the local site](http://127.0.0.1:4173/). The market feed, coin charts, and quotes use sample data. The launch builder saves demo coins in the current browser using local storage.
