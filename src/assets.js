// Runtime-generated fallback textures.
// This deliberately avoids the old Base64 atlas, which was invalid on GitHub Pages.
const W = 192;
const H = 96;
const KEYS = ["00", "02", "11", "13", "20", "22", "31", "33"];

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function diamondPath(ctx) {
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W, H / 2);
  ctx.lineTo(W / 2, H);
  ctx.lineTo(0, H / 2);
  ctx.closePath();
}

function makeTile(kind, seed) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const random = rng(seed);

  diamondPath(ctx);
  ctx.clip();

  if (kind === "grass") {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#8fca57");
    g.addColorStop(1, "#6cab48");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 95; i++) {
      const x = random() * W;
      const y = random() * H;
      const size = 1 + random() * 2.6;
      ctx.strokeStyle = random() > 0.45 ? "rgba(48,112,48,.34)" : "rgba(206,232,105,.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + size);
      ctx.lineTo(x - size * 0.35, y - size);
      ctx.moveTo(x, y + size);
      ctx.lineTo(x + size * 0.55, y - size * 0.8);
      ctx.stroke();
    }
  } else if (kind === "dirt") {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#c79c65");
    g.addColorStop(1, "#a8794b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 75; i++) {
      const x = random() * W;
      const y = random() * H;
      const r = 0.6 + random() * 1.6;
      ctx.fillStyle = random() > 0.5 ? "rgba(104,72,43,.24)" : "rgba(232,197,138,.24)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#58b9d5");
    g.addColorStop(0.5, "#439fc8");
    g.addColorStop(1, "#3b91bb");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 17; i++) {
      const x = random() * W;
      const y = random() * H;
      const len = 6 + random() * 16;
      ctx.strokeStyle = random() > 0.45 ? "rgba(215,247,255,.34)" : "rgba(24,111,158,.24)";
      ctx.lineWidth = 1 + random();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len * .4, y - 2 - random() * 2, x + len, y);
      ctx.stroke();
    }
  }

  ctx.restore?.();
  diamondPath(ctx);
  ctx.strokeStyle = kind === "water" ? "rgba(209,247,255,.22)" : "rgba(41,74,35,.11)";
  ctx.lineWidth = 1;
  ctx.stroke();
  return canvas;
}

function makeEdge(direction, variant) {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const jitter = variant * 0.9;
  const edges = {
    nw: [[0, H / 2], [W / 2, 0]],
    ne: [[W / 2, 0], [W, H / 2]],
    se: [[W, H / 2], [W / 2, H]],
    sw: [[W / 2, H], [0, H / 2]],
  };
  const [[x1, y1], [x2, y2]] = edges[direction];

  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(74,130,48,.92)";
  ctx.lineWidth = 6 + jitter;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(154,205,78,.82)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(x1, y1 - 1);
  ctx.lineTo(x2, y2 - 1);
  ctx.stroke();
  return canvas;
}

export async function loadAssets() {
  const ground = { grass: {}, dirt: {}, water: {} };
  KEYS.forEach((key, index) => {
    ground.grass[key] = makeTile("grass", 1100 + index * 37);
    ground.dirt[key] = makeTile("dirt", 2200 + index * 41);
    ground.water[key] = makeTile("water", 3300 + index * 43);
  });

  const edges = {};
  for (const direction of ["nw", "ne", "se", "sw"]) {
    edges[direction] = [0, 1, 2].map((variant) => makeEdge(direction, variant));
  }
  return { ground, edges };
}
