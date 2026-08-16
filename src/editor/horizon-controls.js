import {
  HORIZON_DIALS,
  HORIZON_TOGGLES,
  HORIZON_STORAGE_KEY,
  horizonDefaults,
  sanitizeHorizon,
  resolveHorizon,
  checkHorizonRules,
  horizonSnippet,
} from "../systems/horizon-settings.js";

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

function readStored() {
  try { return JSON.parse(localStorage.getItem(HORIZON_STORAGE_KEY) ?? "null"); }
  catch { return null; }
}

function writeStored(settings) {
  try { localStorage.setItem(HORIZON_STORAGE_KEY, JSON.stringify(settings)); }
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
  container,
  surface,
  onToast = () => {},
}) {
  if (!container) return { apply() {}, render() {}, settings: null, actions: [] };

  const root = document.querySelector("#build-panel");
  const actions = document.querySelector("#build-actions");
  const hint = document.querySelector("#build-hint");
  const moreButton = document.querySelector("#build-more");
  const collapseButton = document.querySelector("#build-collapse");
  const tabHorizon = document.querySelector("#tab-horizon");
  const normalTabs = ["#tab-place", "#tab-paint", "#tab-sculpt"]
    .map((selector) => document.querySelector(selector))
    .filter(Boolean);

  let settings = sanitizeHorizon(readStored(), config);
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
    const resolved = resolveHorizon(settings, config);
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
    if (!targets || targets.has("range")) sky.rebuildDistantRange(resolved.distantRange);
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
      writeStored(settings);
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
    const rules = checkHorizonRules(resolveHorizon(settings, config), config);
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

    dialsBox.replaceChildren(
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
      const text = horizonSnippet(resolveHorizon(settings, config));
      try {
        await navigator.clipboard.writeText(text);
        onToast("คัดลอกค่าขอบฟ้าแล้ว — วางทับใน src/config.js");
      } catch {
        window.prompt("คัดลอกข้อความนี้ไปวางใน src/config.js", text);
      }
    };

    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "↺ ค่าตั้งต้น";
    reset.onclick = () => {
      settings = horizonDefaults(config);
      writeStored(settings);
      build();
      apply();
      renderRules();
      putHorizonChromeBack();
      onToast("คืนค่าขอบฟ้าเป็นค่าในไฟล์แล้ว");
    };

    actionButtons = [copy, reset];
    container.replaceChildren(rulesBox, dialsBox);
    renderRules();
    putHorizonChromeBack();
  }

  tabHorizon?.addEventListener("click", enterHorizon, true);
  for (const tab of normalTabs) tab.addEventListener("click", leaveHorizon, true);
  document.querySelectorAll("#mode-bar [data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.mode !== "build") leaveHorizon();
    }, true);
  });

  moreButton?.addEventListener("click", (event) => {
    if (!horizonActive) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    root.classList.toggle("more");
    moreButton.classList.toggle("active", root.classList.contains("more"));
    moreButton.setAttribute("aria-expanded", String(root.classList.contains("more")));
  }, true);

  collapseButton?.addEventListener("click", (event) => {
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

  surface?.addEventListener("pointerdown", (event) => {
    if (!horizonActive || document.body.dataset.mode !== "build") return;
    if (event.pointerType === "touch" && event.isPrimary === false) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    panPointer = event.pointerId;
    panX = event.clientX;
    panY = event.clientY;
    surface.setPointerCapture?.(panPointer);
  }, true);

  surface?.addEventListener("pointermove", (event) => {
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
  surface?.addEventListener("pointerup", endPan, true);
  surface?.addEventListener("pointercancel", endPan, true);

  build();
  apply();

  return {
    get settings() { return settings; },
    get actions() { return actionButtons; },
    apply,
    render: renderRules,
    dispose() {
      if (frame) cancelAnimationFrame(frame);
    },
  };
}
