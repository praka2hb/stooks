const chartSteps = [0.16, 0.2, 0.18, 0.25, 0.24, 0.35, 0.29, 0.38, 0.37, 0.31, 0.43, 0.4, 0.49, 0.54, 0.45, 0.6, 0.54, 0.66, 0.58, 0.7, 0.67, 0.78, 0.74, 0.84, 0.79, 0.9, 0.87, 0.96];

function setupCanvas(canvas) {
  const { width, height } = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);
  return { context, width, height };
}

export function drawBell(canvas, closed) {
  const { context, width, height } = setupCanvas(canvas);
  if (!width || !height) return;
  const step = width < 430 ? 6 : 8;
  const edge = Math.floor(width * 0.61);
  const columns = Math.ceil(width / step);
  const rows = Math.ceil(height / step);
  const colorShift = closed ? 21 : 0;

  for (let column = 0; column < columns; column++) {
    const x = column * step;
    const progress = x / width;
    const stepIndex = Math.min(chartSteps.length - 1, Math.floor(progress * chartSteps.length));
    const variation = Math.sin(column * 1.7) * 0.025;
    const highest = height * (0.91 - (chartSteps[stepIndex] + variation) * 0.75);
    for (let row = 0; row < rows; row++) {
      const y = row * step;
      const distance = (y - highest) / height;
      const hash = ((column * 5017 + row * 719 + column * row * 419) % 101) / 101;
      const depth = Math.min(1, Math.max(0, distance * 1.9));
      const opacity = distance > 0
        ? (0.37 + 0.54 * hash) * (0.74 + progress * 0.24) * (1 - depth * 0.57)
        : distance > -0.13 && hash > 0.78 ? (0.15 + distance) * 2 : 0.12;
      const intensity = Math.max(0, Math.min(1, 1 - Math.abs(distance) * 11));
      const postBell = x >= edge;
      const tone = postBell ? (closed ? 30 : 0) : (closed ? 0 : 27);
      const red = Math.round(22 + intensity * 63 + colorShift + tone * 0.55);
      const green = Math.round(78 + intensity * 70 + tone * 1.35);
      const blue = Math.round(238 + intensity * 17);
      context.fillStyle = `rgba(${red}, ${green}, ${blue}, ${opacity})`;
      const size = distance < -0.13 ? 1.1 : step - 1.6;
      context.fillRect(x, y, size, size);
    }
  }

  context.strokeStyle = 'rgba(155, 185, 255, 0.52)';
  context.setLineDash([3, 5]);
  context.beginPath();
  context.moveTo(edge + 0.5, 0);
  context.lineTo(edge + 0.5, height);
  context.stroke();
  context.setLineDash([]);

  context.fillStyle = '#b6cbff';
  context.font = '10px monospace';
  context.fillText('CLOSING BELL', Math.max(4, edge - 74), 16);
}

export function makeSeries(coin, range = '24h', benchmark = false) {
  const count = 45;
  const seed = [...coin.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const start = range === '1h' ? 0.62 : range === '7d' ? 0.39 : 0.48;
  const trend = benchmark ? 0.255 : coin.change >= 0 ? 0.42 : -0.36;
  return Array.from({ length: count }, (_, index) => {
    const progress = index / (count - 1);
    const swing = Math.sin(progress * (range === '1h' ? 11 : 8) + seed) * 0.09;
    const noise = Math.sin((index + seed) * 7.1) * 0.037 + Math.cos(index * 2.51 + seed) * 0.027;
    return Math.max(0.08, Math.min(0.92, start + progress * trend + swing + noise));
  });
}

export function drawSeries(canvas, series, options = {}) {
  const { context, width, height } = setupCanvas(canvas);
  if (!width || !height) return;
  const { color = '#2452F5', fill = false, grid = false, benchmark } = options;
  const inset = grid ? 14 : 2;
  const plotHeight = height - inset * 2;
  const plotWidth = width - inset * 2;

  if (grid) {
    context.strokeStyle = '#edf0f5';
    for (let row = 0; row <= 4; row++) {
      const y = Math.round(inset + row * plotHeight / 4) + 0.5;
      context.beginPath();
      context.moveTo(inset, y);
      context.lineTo(width - inset, y);
      context.stroke();
    }
  }

  function trace(points) {
    context.beginPath();
    points.forEach((point, index) => {
      const x = inset + plotWidth * index / (points.length - 1);
      const y = inset + (1 - point) * plotHeight;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
  }

  if (fill) {
    trace(series);
    context.lineTo(width - inset, height - inset);
    context.lineTo(inset, height - inset);
    context.closePath();
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(36, 82, 245, .19)');
    gradient.addColorStop(1, 'rgba(36, 82, 245, 0)');
    context.fillStyle = gradient;
    context.fill();
  }

  if (benchmark) {
    trace(benchmark);
    context.lineWidth = 1.6;
    context.strokeStyle = '#758197';
    context.setLineDash([6, 4]);
    context.stroke();
    context.setLineDash([]);
  }

  trace(series);
  context.lineWidth = grid ? 2.5 : 1.7;
  context.strokeStyle = color;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
}
