# stooks merge v2: editable source

Uses the lettering drawn in `../lettering` instead of the kit SVGs.

- `merge.js`: timeline (`CFG` at the top), motion, and drawing
- `index.html`: double-click to play. Space pauses, the arrow keys step one frame, and the slider scrubs
- `render.mjs`: `node render.mjs` rebuilds `assets.js` from `../lettering/lettering.mjs` and exports `../stooks-merge-v2.mp4` and `.webp`. Needs Chrome, ffmpeg and img2webp
- `node render.mjs --stills 0,160,300 --out some/dir` writes single frames as PNG
- `assets.js`: generated, do not edit
- To change a letter or colour, edit `../lettering/lettering.mjs`, run it, then run `render.mjs`
