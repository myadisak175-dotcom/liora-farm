import { CONFIG } from "../config.js";

const STRENGTHS = [
  { id: "soft", label: "เบา", value: 0.45 },
  { id: "normal", label: "กลาง", value: 0.9 },
  { id: "strong", label: "แรง", value: 1.5 },
];

const PRESETS = [
  { id: "hill", label: "⛰ เนินนุ่ม", tool: "raise", radius: 4.5, strength: 0.55 },
  { id: "pond", label: "💧 แอ่งน้ำ", tool: "lower", radius: 4.5, strength: 0.75 },
  { id: "flat", label: "▭ พื้นราบ", tool: "flatten", radius: 3.5, strength: 0.9 },
];

let strength = CONFIG.sculpt.strength;
let presetId = null;

function addStyle() {
  if (document.querySelector("#sculpt-assist-style")) return;
  const style = document.createElement("style");
  style.id = "sculpt-assist-style";
  style.textContent = `
    #sculpt-presets,#sculpt-strength{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
    #sculpt-presets button,#sculpt-strength button{min-height:44px;padding:6px 4px;font-size:11px}
    #sculpt-presets button.active,#sculpt-strength button.active{background:var(--accent);color:#fff}
    #build-panel:not([data-tab="sculpt"]) :is(#sculpt-presets,#sculpt-strength){display:none}
  `;
  document.head.append(style);
}

function setStrength(value, custom = true) {
  strength = value;
  CONFIG.sculpt.strength = value;
  if (custom) presetId = null;
  renderActive();
}

function setRadius(value) {
  const input = document.querySelector('#sculpt-size input[type="range"]');
  if (!input) return;
  input.value = String(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function selectTool(tool) {
  document.querySelector(`#sculpt-strip [data-sculpt-tool="${tool}"]`)?.click();
}

function applyPreset(preset) {
  presetId = preset.id;
  selectTool(preset.tool);
  setRadius(preset.radius);
  setStrength(preset.strength, false);
  if (preset.id === "pond") {
    const hint = document.querySelector("#build-hint");
    if (hint) hint.textContent = `แอ่งน้ำ: ขุดให้ต่ำกว่า ${CONFIG.water.level.toFixed(1)} ม. แล้วน้ำจะโผล่เอง`;
  }
  renderActive();
}

function renderActive() {
  document.querySelectorAll("#sculpt-strength [data-strength]").forEach((button) => {
    const entry = STRENGTHS.find((item) => item.id === button.dataset.strength);
    button.classList.toggle("active", !presetId && entry && Math.abs(entry.value - strength) < 1e-6);
  });
  document.querySelectorAll("#sculpt-presets [data-preset]").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === presetId);
  });
}

function mount() {
  const sizeRow = document.querySelector("#sculpt-size");
  const panel = document.querySelector("#build-panel");
  if (!sizeRow || !panel) return false;
  addStyle();

  let presets = document.querySelector("#sculpt-presets");
  if (!presets) {
    presets = document.createElement("div");
    presets.id = "sculpt-presets";
    sizeRow.before(presets);
  }
  let strengths = document.querySelector("#sculpt-strength");
  if (!strengths) {
    strengths = document.createElement("div");
    strengths.id = "sculpt-strength";
    sizeRow.after(strengths);
  }

  if (!presets.childElementCount) {
    for (const preset of PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.preset = preset.id;
      button.textContent = preset.label;
      button.onclick = () => applyPreset(preset);
      presets.append(button);
    }
  }
  if (!strengths.childElementCount) {
    for (const entry of STRENGTHS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.strength = entry.id;
      button.textContent = entry.label;
      button.onclick = () => setStrength(entry.value);
      strengths.append(button);
    }
  }

  CONFIG.sculpt.strength = strength;
  renderActive();
  return true;
}

if (!mount()) {
  const observer = new MutationObserver(() => {
    if (mount()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
