/**
 * Explicit sculpt UI wiring. Unlike the old sculpt-assist module this is
 * initialized by main after BuilderUI exists: no MutationObserver and no
 * mutation of CONFIG.
 *
 * Everything here goes into #sculpt-extra, the "เพิ่มเติม" drawer — NOT into
 * #sculpt-strip. Appending presets next to the four sculpt tools made nine
 * identical-looking buttons in one grid, so there was no way to tell a tool
 * ("ยก") from a preset ("ภูเขา") from a one-shot command ("ธรรมชาติ"), and it
 * pushed the panel three rows taller on the smallest screens.
 */
export function createSculptControls({ height, paint, sculptConfig, onTerrainChange = () => {}, onRender = () => {} }) {
  const strip = document.querySelector("#sculpt-presets");
  const size = document.querySelector("#sculpt-extra-size");
  const toolStrip = document.querySelector("#sculpt-strip");
  const brushSize = document.querySelector("#sculpt-size");
  if (!strip || !size) return { dispose() {} };

  const presets = [
    { id: "hill", label: "🌄 เนินนุ่ม", tool: "raise", radius: 4.5, strength: 0.55, roughness: 0.12 },
    { id: "mountain", label: "🏔 ภูเขา", tool: "raise", radius: 4.2, strength: 0.9, roughness: 0.82 },
    { id: "river", label: "💧 ร่องน้ำ", tool: "lower", radius: 3.2, strength: 0.82, roughness: 0.15 },
  ];

  let strength = sculptConfig.strength;
  let roughness = sculptConfig.defaultRoughness ?? 0.55;
  let selectedPreset = null;

  function row(label, min, max, step, value, format, onInput) {
    const wrap = document.createElement("label");
    wrap.className = "terrain-control";
    const name = document.createElement("span");
    name.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.setAttribute("aria-label", label);
    const readout = document.createElement("span");
    readout.className = "value";
    const update = (v) => { readout.textContent = format(v); };
    update(value);
    input.oninput = () => {
      const next = Number(input.value);
      update(next);
      onInput(next);
    };
    wrap.append(name, input, readout);
    return { wrap, input, update };
  }

  const strengthRow = row("แรง", 0.25, 1.6, 0.05, strength, (v) => v.toFixed(2), (value) => {
    strength = value;
    selectedPreset = null;
    height.setBrushProfile({ strength, roughness });
    syncPresetState();
  });
  const roughnessRow = row("ธรรมชาติ", 0, 1, 0.05, roughness, (v) => `${Math.round(v * 100)}%`, (value) => {
    roughness = value;
    selectedPreset = null;
    height.setBrushProfile({ strength, roughness });
    syncPresetState();
  });
  size.append(strengthRow.wrap, roughnessRow.wrap);
  height.setBrushProfile({ strength, roughness });

  // The brush-size slider belongs to builder-ui and lives in #sculpt-size.
  // Driving it through a real "input" event keeps builder-ui's own radius
  // state and the brush cursor in sync — a preset must not set the number
  // behind the UI's back.
  function setRadius(value) {
    const input = brushSize?.querySelector('input[type="range"]');
    if (!input) return;
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function chooseTool(tool) {
    toolStrip?.querySelector(`[data-sculpt-tool="${tool}"]`)?.click();
  }

  function applyPreset(preset) {
    selectedPreset = preset.id;
    strength = preset.strength;
    roughness = preset.roughness;
    chooseTool(preset.tool);
    setRadius(preset.radius);
    height.setBrushProfile({ strength, roughness });
    strengthRow.input.value = String(strength);
    strengthRow.update(strength);
    roughnessRow.input.value = String(roughness);
    roughnessRow.update(roughness);
    syncPresetState();
  }

  const presetButtons = presets.map((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset";
    button.dataset.sculptPreset = preset.id;
    button.textContent = preset.label;
    button.onclick = () => applyPreset(preset);
    strip.append(button);
    return button;
  });

  const autoButton = document.createElement("button");
  autoButton.type = "button";
  autoButton.className = "terrain-action";
  autoButton.onclick = () => {
    paint.setAutoSurfaceEnabled(!paint.autoSurfaceEnabled);
    syncAuto();
    onRender();
  };
  strip.append(autoButton);

  const naturalizeButton = document.createElement("button");
  naturalizeButton.type = "button";
  naturalizeButton.className = "terrain-action";
  naturalizeButton.textContent = "✨ ธรรมชาติ";
  naturalizeButton.onclick = () => {
    height.naturalize();
    onTerrainChange();
    onRender();
  };
  strip.append(naturalizeButton);

  function syncAuto() {
    autoButton.textContent = paint.autoSurfaceEnabled ? "🌿 Auto ON" : "🌿 Auto OFF";
    autoButton.classList.toggle("active", paint.autoSurfaceEnabled);
  }

  function syncPresetState() {
    for (const button of presetButtons) {
      button.classList.toggle("active", button.dataset.sculptPreset === selectedPreset);
    }
  }

  syncAuto();
  syncPresetState();

  return {
    dispose() {
      strengthRow.wrap.remove();
      roughnessRow.wrap.remove();
      for (const button of presetButtons) button.remove();
      autoButton.remove();
      naturalizeButton.remove();
    },
  };
}
