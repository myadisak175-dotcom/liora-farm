import {
  HORIZON_DIALS,
  HORIZON_TOGGLES,
  HORIZON_STORAGE_KEY,
  horizonDefaults,
  sanitizeHorizon,
  resolveHorizon,
  checkHorizonRules,
  horizonSnippet,
  horizonForMap,
} from "../systems/horizon-settings.js";
import { WORLD_PRESETS, applyWorldPreset } from "../systems/world-presets.js";

const GROUP_OF = new Map(HORIZON_DIALS.map((dial) => [dial.key, dial.group]));
const REBUILD_FOR = {
  // Exposure is a one-line renderer change; the seam dials rebuild the outer
  // ground mesh, same as the other "พื้น" dials do.
  "ภาพรวม": "render",
  "รอยต่อ": "ground",
  "กล้อง": "camera",
  "หมอก": "fog",
  "พื้น": "ground",
  "เนินเขา": "ridges",
  "ภูเขากลาง": "ridges",
  "ยอดไกล": "range",
};
const TOGGLE_REBUILD = {
  mountainsEnabled: "ridges",
  peaksEnabled: "range",
  hazeEnabled: "range",
  islandsEnabled: "range",
};

function readStored(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? "null"); }
  catch { return null; }
}

function writeStored(key, settings) {
  try { localStorage.setItem(key, JSON.stringify(settings)); }
  catch { /* session-only tuning in private mode */ }
}

export function createHorizonControls({
  config,
  scene,
  sky,
  world,
  renderer = null,
  lighting = null,
  cameraController,
  // Scenery hung in the sky. Optional: the GLB may still be loading, or absent
  // entirely, and the panel must open either way.
  floatingIslandBackdrop = null,
  container,
  surface,
  storageKey = HORIZON_STORAGE_KEY,
  mapScope = null,
  onToast = () => {},
}) {
  if (!container) {
    return {
      apply() {}, render() {}, settings: null, actions: [],
      setAuthored() {}, toMap: () => ({}),
    };
  }

  const root = document.querySelector("#build-panel");
  const actions = document.querySelector("#build-actions");
  const hint = document.querySelector("#build-hint");
  const moreButton = document.querySelector("#build-more");
  const collapseButton = document.querySelector("#build-collapse");
  const tabHorizon = document.querySelector("#tab-horizon");
  const normalTabs = ["#tab-place", "#tab-paint", "#tab-sculpt"]
    .map((selector) => document.querySelector(selector))
    .filter(Boolean);

  // The horizon the current map file authored. Filled in by the layout runtime
  // once the map has loaded, which is after this panel is built.
  let authored = null;
  const stored = readStored(storageKey);
  // A player who has never touched the panel for this map must follow the map,
  // not a snapshot of it taken at boot.
  let untouched = !stored;
  let settings = sanitizeHorizon(stored, config, authored);
  let frame = 0;
  let horizonActive = false;
  let panPointer = null;
  let panX = 0;
  let panY = 0;
  const dirty = new Set();

  const rulesBox = document.createElement("div");
  rulesBox.className = "horizon-rules";
  const dialsBox = document.createElement("div");
  dialsBox.className = "horizon-dials";
  let actionButtons = [];

  function apply(targets) {
    const resolved = resolveHorizon(settings, config, authored);
    if (!targets || targets.has("render")) {
      if (renderer) renderer.toneMappingExposure = resolved.exposure;
      lighting?.setBalance?.(resolved.lighting);
      world?.cloudShadows?.setStrength?.(resolved.cloudShadowStrength);
    }
    if (!targets || targets.has("camera")) cameraController.setMinPitch(resolved.cameraMinPitch);
    if (!targets || targets.has("fog")) {
      if (scene.fog) {
        scene.fog.near = resolved.fog.near;
        scene.fog.far = resolved.fog.far;
      }
    }
    if (!targets || targets.has("ground") || targets.has("ridges")) {
      world.rebuildHorizon({
        outerWorld: !targets || targets.has("ground") ? resolved.outerWorld : null,
        mountainBackdrop: !targets || targets.has("ridges") ? resolved.mountainBackdrop : null,
      });
    }
    if (!targets || targets.has("range")) {
      sky.rebuildDistantRange(resolved.distantRange);
      // The authored GLB cluster lives outside `sky`, so rebuilding the
      // distant range alone left the "เกาะลอยฟ้า" toggle doing nothing to it.
      if (floatingIslandBackdrop?.group) {
        floatingIslandBackdrop.group.visible =
          resolved.distantRange?.floatingIslandBackdrop?.enabled !== false;
      }
    }
    return resolved;
  }

  function schedule(target) {
    if (target) dirty.add(target);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const targets = new Set(dirty);
      dirty.clear();
      apply(targets);
      untouched = false;
      writeStored(storageKey, settings);
      renderRules();
    });
  }

  function ruleRow({ pass, label, fix, detail }) {
    const row = document.createElement("div");
    row.className = `horizon-rule ${pass ? "pass" : "fail"}`;
    if (detail) row.title = detail;
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = pass ? "✓" : "✕";
    const text = document.createElement("span");
    const title = document.createElement("b");
    title.textContent = label;
    text.append(title);
    if (fix) {
      const small = document.createElement("small");
      small.textContent = fix;
      text.append(small);
    }
    row.append(mark, text);
    return row;
  }

  function renderRules() {
    const rules = checkHorizonRules(resolveHorizon(settings, config, authored), config);
    const failed = rules.filter((rule) => !rule.pass);
    rulesBox.classList.toggle("has-failure", failed.length > 0);
    rulesBox.replaceChildren(
      ...(failed.length === 0
        ? [ruleRow({ pass: true, label: `ผ่านกฎขอบฟ้าครบ ${rules.length} ข้อ` })]
        : failed.map((rule) => ruleRow({
            pass: false,
            label: rule.label,
            fix: rule.fix,
            detail: rule.detail,
          })))
    );
  }

  function dialRow(dial) {
    const row = document.createElement("label");
    row.className = "horizon-dial";
    if (!dial.primary) row.dataset.secondary = "true";
    const name = document.createElement("span");
    name.textContent = dial.label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(dial.min);
    input.max = String(dial.max);
    input.step = String(dial.step);
    input.value = String(settings[dial.key]);
    input.setAttribute("aria-label", dial.label);
    const readout = document.createElement("span");
    readout.className = "value";
    const show = (v) => {
      readout.textContent = dial.unit === "×"
        ? `${v.toFixed(2)}×`
        : `${Math.round(v * 10) / 10}${dial.unit}`;
    };
    show(settings[dial.key]);
    input.oninput = () => {
      const next = Number(input.value);
      settings[dial.key] = next;
      show(next);
      schedule(REBUILD_FOR[GROUP_OF.get(dial.key)]);
    };
    row.append(name, input, readout);
    return row;
  }

  function toggleButton(toggle) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.horizonToggle = toggle.key;
    button.textContent = toggle.label;
    button.classList.toggle("active", Boolean(settings[toggle.key]));
    button.onclick = () => {
      settings[toggle.key] = !settings[toggle.key];
      button.classList.toggle("active", Boolean(settings[toggle.key]));
      schedule(TOGGLE_REBUILD[toggle.key]);
    };
    return button;
  }

  function putHorizonChromeBack() {
    if (!horizonActive || !root) return;
    root.dataset.tab = "horizon";
    root.dataset.context = "horizon";
    tabHorizon?.classList.add("active");
    for (const tab of normalTabs) tab.classList.remove("active");
    if (hint) hint.textContent = "ลากฉากเพื่อเลื่อนกล้อง • ปรับขอบฟ้าได้ทันทีบนมือถือ";
    if (actions) actions.replaceChildren(...actionButtons);
    if (moreButton) {
      moreButton.hidden = root.classList.contains("collapsed");
      moreButton.setAttribute("aria-expanded", String(root.classList.contains("more")));
    }
  }

  function enterHorizon(event) {
    event?.preventDefault();
    horizonActive = true;
    root?.classList.remove("collapsed", "more");
    putHorizonChromeBack();
    renderRules();
  }

  function leaveHorizon() {
    horizonActive = false;
    panPointer = null;
  }

  /**
   * Presets are a starting point, not a reset: they set the dials that define
   * a landscape's character and leave the rest of the map's own values alone.
   */
  function presetRow() {
    const row = document.createElement("div");
    row.className = "horizon-toggles";
    row.dataset.role = "world-presets";
    for (const preset of WORLD_PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.worldPreset = preset.id;
      button.textContent = preset.label;
      button.title = preset.hint;
      button.onclick = () => {
        settings = sanitizeHorizon(
          applyWorldPreset(preset.id, settings),
          config,
          authored
        );
        untouched = false;
        writeStored(storageKey, settings);
        build();
        apply();
        putHorizonChromeBack();
        onToast(`ตั้งเป็น "${preset.label}" แล้ว — ปรับต่อได้เลย`);
      };
      row.append(button);
    }
    return row;
  }

  /**
   * Switching worlds reloads the page rather than rebuilding the scene in
   * place. Terrain, paint, crops, colliders and the builder all hold direct
   * references to the live zone, so a teardown path would be a large amount of
   * fragile code to save a page load that costs under a second here.
   */
  function mapRow() {
    if (!mapScope || mapScope.maps.length < 2) return null;
    const row = document.createElement("div");
    row.className = "horizon-toggles";
    row.dataset.role = "map-picker";
    for (const entry of mapScope.maps) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.mapId = entry.id;
      button.textContent = entry.name;
      button.classList.toggle("active", entry.id === mapScope.id);
      button.onclick = () => {
        if (entry.id === mapScope.id) return;
        location.href = mapScope.urlFor(entry.id);
      };
      row.append(button);
    }
    return row;
  }

  function build() {
    const groups = [];
    for (const dial of HORIZON_DIALS) {
      let group = groups.find((entry) => entry.name === dial.group);
      if (!group) groups.push((group = { name: dial.group, dials: [] }));
      group.dials.push(dial);
    }

    const toggleRow = document.createElement("div");
    toggleRow.className = "horizon-toggles";
    toggleRow.append(...HORIZON_TOGGLES.map(toggleButton));

    const mapPicker = mapRow();
    const presetHeading = document.createElement("h4");
    presetHeading.textContent = "แบบภูมิทัศน์";
    const mapHeading = document.createElement("h4");
    mapHeading.textContent = "โลก";

    dialsBox.replaceChildren(
      ...(mapPicker ? [mapHeading, mapPicker] : []),
      presetHeading,
      presetRow(),
      toggleRow,
      ...groups.flatMap((group) => {
        const heading = document.createElement("h4");
        heading.textContent = group.name;
        if (group.dials.every((dial) => !dial.primary)) heading.dataset.secondary = "true";
        return [heading, ...group.dials.map(dialRow)];
      })
    );

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "primary";
    copy.textContent = "📋 คัดลอกค่า";
    copy.onclick = async () => {
      const text = horizonSnippet(resolveHorizon(settings, config, authored));
      try {
        await navigator.clipboard.writeText(text);
        onToast("คัดลอกค่าขอบฟ้าแล้ว");
      } catch {
        window.prompt("คัดลอกข้อความนี้ไปวางใน src/config.js", text);
      }
    };

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "↺ ค่าตั้งต้น";
    reset.onclick = () => {
      settings = horizonDefaults(config, authored);
      untouched = true;
      // Reset means "follow this map file again", not "freeze today's map
      // defaults into localStorage". Removing the override lets future edits to
      // maps/<id>.json reach players who chose to return to authored defaults.
      try { localStorage.removeItem(storageKey); }
      catch { /* private mode: keep the in-memory authored defaults */ }
      build();
      apply();
      renderRules();
      putHorizonChromeBack();
      onToast(authored
        ? "คืนค่าขอบฟ้าเป็นค่าของแผนที่นี้แล้ว"
        : "คืนค่าขอบฟ้าเป็นค่าในไฟล์แล้ว");
    };

    actionButtons = [copy, reset];
    container.replaceChildren(rulesBox, dialsBox);
    renderRules();
    putHorizonChromeBack();
  }

  // Same rule as the builder panel: one helper, so dispose cannot miss one.
  const bound = [];
  const bind = (target, type, handler, options) => {
    if (!target) return;
    target.addEventListener(type, handler, options);
    bound.push(() => target.removeEventListener(type, handler, options));
  };

  bind(tabHorizon, "click", enterHorizon, true);
  for (const tab of normalTabs) bind(tab, "click", leaveHorizon, true);
  document.querySelectorAll("#mode-bar [data-mode]").forEach((button) => {
    bind(button, "click", () => {
      if (button.dataset.mode !== "build") leaveHorizon();
    }, true);
  });

  bind(moreButton, "click", (event) => {
    if (!horizonActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    root.classList.toggle("more");
    moreButton.classList.toggle("active", root.classList.contains("more"));
    moreButton.setAttribute("aria-expanded", String(root.classList.contains("more")));
  }, true);

  bind(collapseButton, "click", (event) => {
    if (!horizonActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    root.classList.toggle("collapsed");
    if (root.classList.contains("collapsed")) root.classList.remove("more");
    collapseButton.textContent = root.classList.contains("collapsed") ? "⌃" : "⌄";
    collapseButton.setAttribute("aria-expanded", String(!root.classList.contains("collapsed")));
    putHorizonChromeBack();
  }, true);

  const capturePointer = (event) => horizonActive
    && document.body.dataset.mode === "build"
    && event.pointerType !== "touch" || false;

  bind(surface, "pointerdown", (event) => {
    if (!horizonActive || document.body.dataset.mode !== "build") return;
    if (event.pointerType === "touch" && event.isPrimary === false) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    panPointer = event.pointerId;
    panX = event.clientX;
    panY = event.clientY;
    surface.setPointerCapture?.(panPointer);
  }, true);

  bind(surface, "pointermove", (event) => {
    if (!horizonActive || event.pointerId !== panPointer) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cameraController.pan(event.clientX - panX, event.clientY - panY);
    panX = event.clientX;
    panY = event.clientY;
  }, true);

  const endPan = (event) => {
    if (!horizonActive || event.pointerId !== panPointer) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    panPointer = null;
  };
  bind(surface, "pointerup", endPan, true);
  bind(surface, "pointercancel", endPan, true);

  build();
  apply();

  return {
    get settings() { return settings; },
    get actions() { return actionButtons; },

    /** Drop every listener this panel owns, and cancel any pending apply. */
    dispose() {
      for (const off of bound.splice(0)) off();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },
    /**
     * Hands the panel the horizon block from the loaded map. Only rebases the
     * live dials when the player has not tuned this map themselves — their own
     * edits outrank the file, exactly as their sculpting does.
     */
    setAuthored(next) {
      authored = next && typeof next === "object" ? next : null;
      if (!untouched) {
        renderRules();
        return false;
      }
      settings = horizonDefaults(config, authored);
      build();
      apply();
      return true;
    },
    /** The horizon block to write into a map file. */
    toMap() {
      return horizonForMap(settings, config);
    },
    apply,
    render: renderRules,
    dispose() {
      if (frame) cancelAnimationFrame(frame);
    },
  };
}
