import * as THREE from "three";
import { getFarmJourney } from "../systems/farming/journey.js";

const COLORS = { hoe: 0xffe4aa, water: 0x95dcfa, plant: 0xa9edb3, harvest: 0xffcf70 };

export function createFarmPresentation({ plot, crops, camera, growSeconds, onToast = () => {} }) {
  const card = document.querySelector("#farm-journey");
  const details = document.querySelector("#journey-details");
  const journeyToggle = document.querySelector("#journey-toggle");
  const title = document.querySelector("#journey-title");
  const count = document.querySelector("#journey-count");
  const hint = document.querySelector("#journey-hint");
  const meter = document.querySelector("#journey-progress");
  const steps = [...document.querySelectorAll(".journey-step")];
  const pouch = document.querySelector("#pouch");
  const layer = document.querySelector("#farm-feedback-layer");
  const actions = document.querySelector("#actions");
  const emoteToggle = document.querySelector("#emote-toggle");
  const emoteMenu = document.querySelector("#emote-menu");
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const listeners = [];
  const rewards = new Map();
  let active = true;
  let disposed = false;
  let sinceJourney = 0;
  let journeyKey = "";
  let complete = getFarmJourney(crops).complete;
  let pulseAge = 1;

  // Two tiny, shared-geometry rings identify the actual selected soil cell and
  // confirm a successful action. They don't change the farm mesh or lighting.
  const geometry = new THREE.RingGeometry(0.42, 0.47, 40);
  geometry.rotateX(-Math.PI / 2);
  const targetMaterial = new THREE.MeshBasicMaterial({
    color: COLORS.hoe, transparent: true, opacity: 0.86,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  });
  const pulseMaterial = targetMaterial.clone();
  const targetRing = new THREE.Mesh(geometry, targetMaterial);
  const pulseRing = new THREE.Mesh(geometry, pulseMaterial);
  for (const ring of [targetRing, pulseRing]) {
    ring.visible = false;
    ring.renderOrder = 12;
    plot.group.add(ring);
  }

  function bind(element, type, handler) {
    if (!element) return;
    element.addEventListener(type, handler);
    listeners.push(() => element.removeEventListener(type, handler));
  }

  function closeEmotes() {
    if (emoteMenu) emoteMenu.hidden = true;
    emoteToggle?.setAttribute("aria-expanded", "false");
  }

  bind(emoteToggle, "click", () => {
    if (!emoteMenu) return;
    emoteMenu.hidden = !emoteMenu.hidden;
    emoteToggle.setAttribute("aria-expanded", String(!emoteMenu.hidden));
  });
  bind(emoteMenu, "click", (event) => {
    if (event.target.closest("[data-action]")) closeEmotes();
  });
  bind(document, "pointerdown", (event) => {
    if (!actions?.contains(event.target)) closeEmotes();
  });
  bind(document, "keydown", (event) => {
    if (event.key !== "Escape" || emoteMenu?.hidden !== false) return;
    closeEmotes();
    emoteToggle?.focus();
  });
  bind(journeyToggle, "click", () => {
    if (!details) return;
    details.hidden = !details.hidden;
    journeyToggle.setAttribute("aria-expanded", String(!details.hidden));
  });

  function refreshJourney(celebrate = false) {
    if (disposed || !card) return;
    const next = getFarmJourney({ cells: crops.cells, pouch: crops.pouch, growSeconds });
    const key = `${next.progress}:${next.phase}:${next.hint}`;
    if (journeyKey !== key) {
      journeyKey = key;
      card.dataset.complete = String(next.complete);
      title.textContent = next.complete ? "ตะกร้าแรกสำเร็จ!" : "ตะกร้าแรกของเรา";
      count.textContent = `${next.progress} / ${next.goal}`;
      hint.textContent = next.hint;
      meter.value = next.progress;
      for (const [index, step] of steps.entries()) {
        step.dataset.state = index < next.step ? "done" : index === next.step ? "current" : "waiting";
      }
    }
    if (celebrate && next.complete && !complete) {
      onToast("ตะกร้าแรกเต็มแล้ว! เก็บผักครบ 3 หัว 🌱");
      // Use the animation API so consecutive, rapid actions don't force layout.
      if (!reducedMotion?.matches) {
        card.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.025)" }, { transform: "scale(1)" }], { duration: 500 });
      }
    }
    complete = next.complete;
  }

  function placeRing(ring, index) {
    const cell = plot.cells[index];
    if (!cell) return false;
    ring.position.set(cell.position.x, (cell.mesh?.position.y ?? 0.09) + 0.018, cell.position.z);
    return true;
  }

  function setTarget(target) {
    targetRing.visible = Boolean(active && target && placeRing(targetRing, target.index));
    if (!targetRing.visible) return;
    const phase = target.state === "ripe" ? "harvest"
      : target.state === "growing" ? "plant"
        : target.soilState === "watered" ? "plant"
          : target.soilState === "tilled" ? "water" : "hoe";
    targetMaterial.color.setHex(COLORS[phase]);
  }

  const projected = new THREE.Vector3();
  function removeReward(element) {
    clearTimeout(rewards.get(element));
    rewards.delete(element);
    element.remove();
  }

  function showHarvest(position) {
    if (!position || !layer || !active) return;
    projected.set(position.x, position.y + 0.65, position.z).project(camera);
    if (projected.z < -1 || projected.z > 1) return;
    while (rewards.size >= 4) removeReward(rewards.keys().next().value);
    const reward = document.createElement("div");
    reward.className = "farm-reward";
    reward.textContent = "🥕 +1";
    reward.setAttribute("aria-hidden", "true");
    reward.style.left = `${Math.max(36, Math.min(innerWidth - 36, (projected.x * 0.5 + 0.5) * innerWidth))}px`;
    reward.style.top = `${Math.max(100, Math.min(innerHeight - 140, (-projected.y * 0.5 + 0.5) * innerHeight))}px`;
    layer.append(reward);
    rewards.set(reward, setTimeout(() => removeReward(reward), 1100));
    if (!reducedMotion?.matches) {
      pouch?.animate?.([{ transform: "scale(1)" }, { transform: "scale(1.16)" }, { transform: "scale(1)" }], { duration: 330 });
    }
  }

  function onAction({ type, index, position }) {
    if (disposed || !active) return;
    pulseAge = 0;
    pulseRing.visible = placeRing(pulseRing, index);
    pulseRing.scale.setScalar(1);
    pulseMaterial.color.setHex(COLORS[type] ?? COLORS.hoe);
    pulseMaterial.opacity = 0.8;
    if (type === "harvest") showHarvest(position);
    try { globalThis.navigator?.vibrate?.(type === "harvest" ? 18 : 8); } catch { /* optional tactile feedback */ }
    refreshJourney(true);
  }

  function setActive(value) {
    active = Boolean(value);
    if (card) card.hidden = !active;
    if (layer) layer.hidden = !active;
    if (!active) {
      targetRing.visible = false;
      pulseRing.visible = false;
      closeEmotes();
      for (const reward of [...rewards.keys()]) removeReward(reward);
    }
  }

  refreshJourney();
  setActive(true);
  return {
    setTarget,
    setActive,
    onAction,
    update(delta) {
      if (disposed || !active) return;
      if (pulseRing.visible) {
        pulseAge += delta;
        const fraction = Math.min(1, pulseAge / 0.55);
        pulseRing.scale.setScalar(reducedMotion?.matches ? 1 : 1 + fraction * 0.8);
        pulseMaterial.opacity = 0.8 * (1 - fraction);
        pulseRing.visible = fraction < 1;
      }
      sinceJourney += delta;
      if (sinceJourney >= 0.5) {
        sinceJourney = 0;
        refreshJourney();
      }
    },
    dispose() {
      disposed = true;
      setActive(false);
      for (const remove of listeners) remove();
      plot.group.remove(targetRing, pulseRing);
      geometry.dispose();
      targetMaterial.dispose();
      pulseMaterial.dispose();
    },
  };
}
