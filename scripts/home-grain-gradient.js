const COLOR_STOPS = [
  [0x73, 0x00, 0xff],
  [0xeb, 0xa8, 0xff],
  [0x00, 0xbf, 0xff],
  [0x2a, 0x00, 0xff],
];

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const smoothstep = (edge0, edge1, value) => {
  const x = clamp((value - edge0) / (edge1 - edge0));
  return x * x * (3 - 2 * x);
};

const hash2 = (x, y, seed = 0) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123;
  return value - Math.floor(value);
};

const ellipse = (x, y, cx, cy, rx, ry, rotation = 0) => {
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = x - cx;
  const dy = y - cy;
  const px = cos * dx + sin * dy;
  const py = -sin * dx + cos * dy;
  const dist = (px * px) / (rx * rx) + (py * py) / (ry * ry);
  return Math.exp(-dist * 1.58);
};

function drawGrainGradient(canvas, phase = 0) {
  const parent = canvas.parentElement;
  const rect = parent?.getBoundingClientRect();
  if (!rect || rect.width < 2 || rect.height < 2) return;

  const maxPixels = 950000;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, Math.sqrt(maxPixels / (rect.width * rect.height)));
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  const image = context.createImageData(width, height);
  const data = image.data;
  const driftX = Math.sin(phase * 0.55) * 0.018;
  const driftY = Math.cos(phase * 0.42) * 0.015;
  const aspect = width / height;

  for (let y = 0; y < height; y += 1) {
    const ny = y / Math.max(1, height - 1);
    for (let x = 0; x < width; x += 1) {
      const nx = x / Math.max(1, width - 1);
      const sx = (nx - 0.5) * aspect + 0.5;
      const seed = hash2(x, y, 0);
      const seed2 = hash2(x + 19.2, y - 8.4, 1.7);

      const purple =
        ellipse(sx, ny, 0.0 + driftX, 0.48 + driftY, 0.42, 0.24, -0.08) * 0.84 +
        ellipse(sx, ny, 0.12 - driftX, 0.82, 0.48, 0.3, 0.1) * 0.7;
      const pink =
        ellipse(sx, ny, 0.12 + driftX, 0.58 - driftY, 0.38, 0.2, 0.18) * 1.08 +
        ellipse(sx, ny, 0.72 - driftX, 0.3 + driftY, 0.26, 0.23, -0.38) * 1.04;
      const cyan =
        ellipse(sx, ny, 0.03 - driftX, 0.78, 0.44, 0.34, 0.04) * 1.18 +
        ellipse(sx, ny, 0.86 + driftX, 0.18 - driftY, 0.34, 0.38, -0.26) * 1.2;
      const blue =
        ellipse(sx, ny, 0.07, 0.94, 0.48, 0.28, -0.02) * 1.0 +
        ellipse(sx, ny, 0.96, 0.19, 0.44, 0.42, 0.12) * 1.12;

      const centerVoid =
        ellipse(sx, ny, 0.46, 0.55, 0.33, 0.43, 0.04) * 0.9 +
        ellipse(sx, ny, 0.55, 0.77, 0.44, 0.2, -0.1) * 0.52;
      const topVoid = ellipse(sx, ny, 0.34, 0.13, 0.42, 0.24, 0.05) * 0.46;
      const blackPush = centerVoid + topVoid;
      const field = clamp(purple * 0.58 + pink * 0.72 + cyan * 0.74 + blue * 0.6 - blackPush);

      const fineNoise = (seed - 0.5) * 0.78 + (hash2(x * 0.43, y * 0.43, 2.9) - 0.5) * 0.34;
      const coverage = clamp(smoothstep(0.04, 0.78, field + fineNoise) * 0.98 + field * 0.08);
      const sparseColor = seed2 < field * 0.065;
      const colored = seed < coverage || sparseColor;
      const index = (y * width + x) * 4;

      if (!colored) {
        const blackLift = Math.round(2 + field * 9 + hash2(x, y, 9.1) * 5);
        data[index] = blackLift;
        data[index + 1] = Math.max(0, blackLift - 2);
        data[index + 2] = Math.round(blackLift + field * 16);
        data[index + 3] = 255;
        continue;
      }

      const weights = [
        Math.max(0, purple + seed * 0.08),
        Math.max(0, pink + seed2 * 0.08),
        Math.max(0, cyan + hash2(x - 7, y + 11, 4.2) * 0.08),
        Math.max(0, blue + hash2(x + 5, y - 3, 8.6) * 0.08),
      ];
      const totalWeight = weights.reduce((total, value) => total + value, 0) || 1;
      let picker = hash2(x - 31, y + 17, 5.4) * totalWeight;
      let colorIndex = 0;
      for (let i = 0; i < weights.length; i += 1) {
        picker -= weights[i];
        if (picker <= 0) {
          colorIndex = i;
          break;
        }
      }

      const color = COLOR_STOPS[colorIndex];
      const brightness = clamp(0.58 + field * 0.62 + hash2(x + 4, y - 9, 6.2) * 0.34, 0.35, 1.3);
      const blackMix = clamp((0.22 - field) * 1.2, 0, 0.24);
      data[index] = Math.round(color[0] * brightness * (1 - blackMix));
      data[index + 1] = Math.round(color[1] * brightness * (1 - blackMix));
      data[index + 2] = Math.round(color[2] * brightness * (1 - blackMix));
      data[index + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
}

function mountHomeGrain(canvas, options = {}) {
  const force = Boolean(options.force);
  if (!force && document.documentElement.classList.contains("paper-grain-ready")) return;
  if (canvas.dataset.homeGrainReady === "running") return;

  let animationFrame = 0;
  let lastDraw = 0;
  const startedAt = performance.now();
  let stopped = false;
  canvas.dataset.homeGrainReady = "running";

  const stop = (state = "stopped") => {
    if (stopped) return;
    stopped = true;
    window.cancelAnimationFrame(animationFrame);
    canvas.dataset.homeGrainReady = state;
  };

  const render = (time) => {
    if (!force && document.documentElement.classList.contains("paper-grain-ready")) {
      stop();
      return;
    }

    if (time - lastDraw > 160) {
      drawGrainGradient(canvas, (time - startedAt) / 1000);
      lastDraw = time;
    }
    animationFrame = window.requestAnimationFrame(render);
  };

  const resizeObserver = new ResizeObserver(() => drawGrainGradient(canvas));
  if (canvas.parentElement) resizeObserver.observe(canvas.parentElement);
  drawGrainGradient(canvas);
  animationFrame = window.requestAnimationFrame(render);

  window.addEventListener(
    "pagehide",
    () => {
      stop("disposed");
      resizeObserver.disconnect();
    },
    { once: true },
  );
}

function initHomeGrain(options = {}) {
  const force = Boolean(options.force);
  if (!force && document.documentElement.classList.contains("paper-grain-ready")) return;

  document.querySelectorAll("[data-home-grain-canvas]").forEach((canvas) => {
    if (canvas instanceof HTMLCanvasElement) {
      mountHomeGrain(canvas, { force });
    }
  });
}

window.__pinwaiHomeGrainInit = initHomeGrain;
window.addEventListener("pinwai:home-grain-fallback", () => initHomeGrain({ force: true }));
window.addEventListener("pageshow", () => initHomeGrain());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) initHomeGrain();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHomeGrain, { once: true });
} else {
  initHomeGrain();
}
