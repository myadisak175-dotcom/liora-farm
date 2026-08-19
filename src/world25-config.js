export const PATH_BACKDROP_RELEASE = "path25";

export function applyDistantPathBackdrop(config) {
  const bands = config?.paintedBackdrop?.bands;
  if (!Array.isArray(bands)) throw new Error("painted backdrop bands are unavailable");

  let band = bands.find((entry) => entry.name === "PaintedPath");
  if (!band) {
    band = {
      name: "PaintedPath",
      // Use the newly uploaded full-resolution PNG directly. The previous
      // 1024x34 WebP was over-compressed and made the road/fence artwork mushy.
      texture: "./assets/textures/backdrop_path.png",
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
