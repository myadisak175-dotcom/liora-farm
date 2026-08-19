export const PATH_BACKDROP_RELEASE = "path24";

export function applyDistantPathBackdrop(config) {
  const bands = config?.paintedBackdrop?.bands;
  if (!Array.isArray(bands)) throw new Error("painted backdrop bands are unavailable");

  let band = bands.find((entry) => entry.name === "PaintedPath");
  if (!band) {
    band = {
      name: "PaintedPath",
      texture: "./assets/textures/backdrop-path.webp",
      radius: 424,
      height: 20,
      y: 0,
      repeat: 2,
      tint: 0xf7f0e3,
      haze: 0.06,
      renderOrder: -27,
    };
    bands.push(band);
  }

  return band;
}
