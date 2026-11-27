# stooks merge: editable source

- `merge.js`: timeline (`CFG` at the top), motion, and drawing
- `index.html`: double-click to play. Space pauses, the arrow keys step one frame, and the slider scrubs
- `render.mjs`: `node render.mjs` rebuilds `assets.js` from the kit SVGs/PNG and exports the MP4 and WebP. Needs Chrome, ffmpeg and img2webp
- `node render.mjs --stills 0,160,300 --out some/dir` writes single frames as PNG
- `assets.js`: generated, do not edit
