import * as THREE from "three";

const DAY = 24;
const TAU = Math.PI * 2;
const DAYLIGHT = Object.freeze({
  zenith: 0x78c9f4,
  horizon: 0xecfaff,
  lower: 0xc9edf9,
  sun: 0xfff0cf,
  hemiSky: 0xfff8e8,
  hemiGround: 0x557455,
});

function lerpColor(a, b, t) {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

function segment(hour, start, end) {
  if (hour < start || hour > end) return null;
  return (hour - start) / (end - start);
}

const PRESET_HOURS = [6.5, 12, 18.25, 22];

/**
 * Owns the time of day and the palette that comes with it. It used to build
 * its own floating clock button with inline styles, which is why that button
 * never matched the rest of the UI and stayed on screen in build mode. The
 * label now goes out through onLabelChange and the HUD owns the markup.
 */
export function createDayNight({ scene, sky, lighting, world = null, config, onLabelChange = () => {} }) {
  let hour = config.startHour;
  let paused = false;
  let presetIndex = 0;
  let lastLabel = "";

  /**
   * Sun-to-hemisphere ratio, per hour.
   *
   * These used to sit near 1:1 (2.5 sun against 2.2 hemi), which is why the
   * island read as flat no matter how the colours were tuned — omnidirectional
   * light of that strength lights the shadow side of a form almost as brightly
   * as the lit side. The palette now runs closer to 1:2.5, and lighting.js
   * exposes sunScale/hemiScale on top so the ratio is tunable from the panel.
   */
  function paletteForTime(h) {
    let zenith = DAYLIGHT.zenith;
    let horizon = DAYLIGHT.horizon;
    let lower = DAYLIGHT.lower;
    let sunColor = DAYLIGHT.sun;
    let sunIntensity = 3.0;
    let hemiSky = DAYLIGHT.hemiSky;
    let hemiGround = DAYLIGHT.hemiGround;
    let hemiIntensity = 1.18;
    let fogColor = DAYLIGHT.horizon;
    let stars = 0;

    let t = segment(h, 5, 7.5);
    if (t !== null) {
      zenith = lerpColor(0x152b5a, DAYLIGHT.zenith, t);
      horizon = lerpColor(0xf29b78, DAYLIGHT.horizon, t);
      lower = lerpColor(0x5a6b91, DAYLIGHT.lower, t);
      sunColor = lerpColor(0xffb066, DAYLIGHT.sun, t);
      sunIntensity = THREE.MathUtils.lerp(0.3, 3.0, t);
      hemiSky = lerpColor(0x6f84b5, DAYLIGHT.hemiSky, t);
      hemiGround = lerpColor(0x24364b, DAYLIGHT.hemiGround, t);
      hemiIntensity = THREE.MathUtils.lerp(0.5, 1.18, t);
      fogColor = horizon;
      stars = 1 - t;
      return { zenith, horizon, lower, sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity, fogColor, stars };
    }

    t = segment(h, 16.5, 19.5);
    if (t !== null) {
      zenith = lerpColor(DAYLIGHT.zenith, 0x182b5d, t);
      horizon = t < 0.55
        ? lerpColor(DAYLIGHT.horizon, 0xf18f68, t / 0.55)
        : lerpColor(0xf18f68, 0x6a5578, (t - 0.55) / 0.45);
      lower = lerpColor(DAYLIGHT.lower, 0x394866, t);
      sunColor = lerpColor(DAYLIGHT.sun, 0xff955f, t);
      sunIntensity = THREE.MathUtils.lerp(3.0, 0.22, t);
      hemiSky = lerpColor(DAYLIGHT.hemiSky, 0x7182ad, t);
      hemiGround = lerpColor(DAYLIGHT.hemiGround, 0x243348, t);
      hemiIntensity = THREE.MathUtils.lerp(1.18, 0.45, t);
      fogColor = horizon;
      stars = THREE.MathUtils.smoothstep(t, 0.65, 1);
      return { zenith, horizon, lower, sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity, fogColor, stars };
    }

    if (h >= 19.5 || h < 5) {
      return {
        zenith: new THREE.Color(0x081735),
        horizon: new THREE.Color(0x26385f),
        lower: new THREE.Color(0x101d35),
        sunColor: new THREE.Color(0xaac8ff),
        sunIntensity: 0.16,
        hemiSky: new THREE.Color(0x4c66a1),
        hemiGround: new THREE.Color(0x162033),
        hemiIntensity: 0.4,
        fogColor: new THREE.Color(0x26385f),
        stars: 1,
      };
    }

    return {
      zenith: new THREE.Color(zenith), horizon: new THREE.Color(horizon), lower: new THREE.Color(lower),
      sunColor: new THREE.Color(sunColor), sunIntensity, hemiSky: new THREE.Color(hemiSky),
      hemiGround: new THREE.Color(hemiGround), hemiIntensity, fogColor: new THREE.Color(fogColor), stars,
    };
  }

  function apply() {
    const p = paletteForTime(hour);
    const sunPhase = ((hour - 6) / DAY) * TAU;
    const elevation = Math.sin(sunPhase);
    const azimuth = sunPhase * 0.72 - 0.8;

    sky.setColors(p.zenith, p.horizon, p.lower);
    sky.setStars(p.stars);
    lighting.setAtmosphere({
      sunColor: p.sunColor,
      sunIntensity: p.sunIntensity,
      hemiSky: p.hemiSky,
      hemiGround: p.hemiGround,
      hemiIntensity: p.hemiIntensity,
      sunDirection: new THREE.Vector3(
        Math.cos(azimuth) * Math.max(0.28, Math.abs(elevation)),
        Math.max(0.22, Math.abs(elevation)),
        Math.sin(azimuth) * Math.max(0.28, Math.abs(elevation))
      ).normalize(),
    });

    scene.background.copy(p.horizon);
    if (scene.fog) scene.fog.color.copy(p.fogColor);
    // The far ground fades into the same colour the sky is showing right now.
    // Without this the outer world stays a fixed daytime beige and glows
    // against a purple sunset or a navy night sky.
    world?.setAtmosphere?.(p.horizon);

    const hh = Math.floor(hour) % 24;
    const mm = Math.floor((hour - Math.floor(hour)) * 60);
    const phase =
      hour >= 5 && hour < 8 ? "เช้า" : hour < 17 ? "กลางวัน" : hour < 20 ? "เย็น" : "กลางคืน";
    const label = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} • ${phase}`;
    if (label !== lastLabel) {
      lastLabel = label;
      onLabelChange(label);
    }
  }

  apply();

  return {
    update(delta) {
      if (!paused) {
        hour = (hour + delta * (DAY / config.realSecondsPerDay)) % DAY;
      }
      apply();
    },
    /** Cycles morning -> noon -> sunset -> night, for skipping the dark. */
    nextPreset() {
      hour = PRESET_HOURS[presetIndex];
      presetIndex = (presetIndex + 1) % PRESET_HOURS.length;
      apply();
      return hour;
    },
    setHour(value) { hour = ((value % DAY) + DAY) % DAY; apply(); },
    getHour() { return hour; },
    setPaused(value) { paused = Boolean(value); },
  };
}
