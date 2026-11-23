/**
 * Coin pictures live on-chain: the launch stores a small data: URI in MemeToken.metadataURI.
 * No upload service, no API key, and the picture lasts as long as the token.
 */

/** Longest picture we send. About 6 KB adds ~4.4M gas to a launch (a few cents on Base). */
export const MAX_IMAGE_CHARS = 8_000;

// Only raster pictures inlined as base64. Anything else in metadataURI (links, SVG) is ignored, so a coin can't
// make visitors' browsers fetch a third-party URL.
const SAFE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

export function safeImage(uri) {
  return typeof uri === 'string' && uri.length <= MAX_IMAGE_CHARS * 2 && SAFE.test(uri) ? uri : '';
}

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a picture this browser can read.')); };
    img.src = url;
  });
}

/** Centre-crop to a square and shrink until the data URI fits MAX_IMAGE_CHARS. WebP when the browser can make it. */
export async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Pick a picture file (PNG, JPG, WebP or GIF).');
  const img = await loadBitmap(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
  for (const size of [160, 128, 96, 72]) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const webp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    if (!webp) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size); } // JPEG has no transparency
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    for (const q of [0.9, 0.8, 0.7, 0.6, 0.5, 0.4]) {
      const uri = canvas.toDataURL(webp ? 'image/webp' : 'image/jpeg', q);
      if (uri.length <= MAX_IMAGE_CHARS) return uri;
    }
  }
  throw new Error('That picture is too detailed to fit on-chain. Try a simpler one.');
}
