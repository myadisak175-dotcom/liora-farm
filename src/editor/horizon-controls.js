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

/**
 * The horizon tuning tab in build mode.
 *
 * Two things make this more than a box of sliders:
 *
 *   1. It rebuilds SELECTIVELY. Fog and camera pitch are uniform changes that
 *      apply instantly; the ground, ridges and peaks each cost a geometry
 *      rebuild, so a slider only rebuilds the layer it belongs to, once per
 *      frame. Dragging "หมอกเริ่ม" allocates nothing at all.
 *   2. It reports the four horizon rules live, by name. A hard line at the edge
 *      of the map and a washed-out farm are both "it looks wrong" until
 *      something tells you which rule you just broke and which dial fixes it.
 *
 * Nothing here can affect gameplay: no dial is read by collision, ground
 * sampling, sculpting, painting, Builder placement, farming or saves.
 */

const GROUP_OF = new Map(HORIZON_DIALS.map((dial) => [dial.key, dial.group]));

const REBUILD_FOR = {
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
  try {
    return JSON.parse(localStorage.getItem(HORIZON_STORAGE_KEY) ?? "null");
  } catch {
    return null;
  }
}

function writeStored(settings) {
  try {
    localStorage.setItem(HORIZON_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* private mode — tuning lasts for this session only */
  }
}

export function createHorizonControls({
  config,
  scene,
  sky,
  world,
  cameraController,
  container,
  onToast = () => {},
  onActionsChange = () => {},
}) {
  if (!container) return { apply() {}, render() {}, settings: null, actions: [] };

  let settings = sanitizeHorizon(readStored(), config);
  let frame = 0;
  const dirty = new Set();

  const rulesBox = document.createElement("div");
  rulesBox.className = "horizon-rules";
  const dialsBox = document.createElement("div");
  dialsBox.className = "horizon-dials";
  let actionButtons = [];

  function apply(targets) {
    const resolved = resolveHorizon(settings, config);

    if (!targets || targets.has("camera")) {
      cameraController.setMinPitch(resolved.cameraMinPitch);
    }
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
    const resolved = resolveHorizon(settings, config);
    const rules = checkHorizonRules(resolved, config);
    const failed = rules.filter((rule) => !rule.pass);

    rulesBox.classList.toggle("has-failure", failed.length > 0);
    rulesBox.replaceChildren(
      ...(failed.length === 0
        ? [ruleRow({ pass: true, label: `ผ่านกฎขอบฟ้าครบ ${rules.length} ข้อ` })]
        : failed.map((rule) =>
            ruleRow({ pass: false, label: rule.label, fix: rule.fix, detail: rule.detail })
          ))
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
      readout.textContent = dial.unit === "×" ? `${v.toFixed(2)}×` : `${Math.round(v * 10) / 10}${dial.unit}`;
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

  function build() {
    const groups = [];
    for (const dial of HORIZON_DIALS) {
      let group = groups.find((g) => g.name === dial.group);
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
      onToast("คืนค่าขอบฟ้าเป็นค่าในไฟล์แล้ว");
    };

    actionButtons = [copy, reset];
    container.replaceChildren(rulesBox, dialsBox);
    renderRules();
    onActionsChange();
  }

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
