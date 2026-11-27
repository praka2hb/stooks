# stooks merge v3: editable source

v2's merge, then the line "built on base + uniswap", then back to the two words. 8.9 s, 534 frames, 60 fps.

- `merge.js`: timeline (`CFG` at the top, the line is `CFG.text`), motion, and drawing
- `index.html`: double-click to play. Space pauses, the arrow keys step one frame, and the slider scrubs
- `render.mjs`: `node render.mjs` rebuilds `assets.js` and exports `../stooks-merge-v3.mp4` and `.webp`. Needs Chrome, ffmpeg and img2webp
- `node render.mjs --stills 0,160,400 --out some/dir` writes single frames as PNG
- `text/words.json`: glyph outlines for the line, Nunito ExtraBold. To change the words, rebuild it on macOS (the last word must be a single space):
  `clang -o outline text/outline.c -framework CoreText -framework CoreFoundation -framework CoreGraphics`
  `./outline path/to/Nunito.woff2 800 built on base + uniswap " " > text/words.json`
- `assets.js`: generated, do not edit
