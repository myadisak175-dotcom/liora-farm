import { CROP_STATES, SOIL_STATES } from "../systems/farming/states.js";

export function createFarmUI({
  crops,
  playerRuntime,
  button,
  pouchCount,
  animations,
  onToast = () => {},
  onTargetChange = () => {},
  onActionStart = () => {},
  onActionComplete = () => {},
}) {
  let target = null;
  let sinceCheck = 0;
  let busy = false;
  let busyLabel = "";
  let active = true;
  let disposed = false;
  let actionRun = 0;

  function setButton(label, enabled, phase = "unavailable") {
    button.textContent = label;
    button.disabled = !enabled;
    button.classList.toggle("ready", enabled);
    button.dataset.phase = phase;
    button.setAttribute("aria-busy", String(busy));
  }

  function refresh() {
    if (disposed || !crops) return;
    pouchCount.textContent = String(crops.pouch);
    const position = playerRuntime.position;
    target = active && position ? crops.getTarget(position) : null;
    onTargetChange(target);

    if (busy) {
      setButton(busyLabel, false, "busy");
      return;
    }

    if (!target) {
      setButton("เข้าใกล้แปลงผัก", false);
      return;
    }

    if (target.state === CROP_STATES.EMPTY) {
      if (target.soilState === SOIL_STATES.PLAIN) {
        setButton("🪏 พรวนดิน", true, "hoe");
        return;
      }
      if (target.soilState === SOIL_STATES.TILLED) {
        setButton("💧 รดน้ำ", true, "water");
        return;
      }
      setButton("🌱 หยอดเมล็ด", true, "plant");
      return;
    }

    if (target.state === CROP_STATES.GROWING) {
      setButton(`🌱 กำลังโต ${Math.round(target.progress * 100)}%`, false, "growing");
      return;
    }

    setButton("🥕 เก็บเกี่ยว", true, "harvest");
  }

  function playFarmAction({ type, animationName, label, message, index, apply }) {
    if (busy || !active || disposed) return;
    const world = crops.cells?.[index]?.world ?? playerRuntime.position;
    const position = world ? { x: world.x, y: world.y, z: world.z } : null;
    const run = ++actionRun;
    let settled = false;
    busy = true;
    busyLabel = label;
    const started = playerRuntime.playSpecial(animationName, () => {
      if (disposed || settled || run !== actionRun) return;
      settled = true;
      busy = false;
      button.classList.remove("active");
      // The animation is presentation; only a successful crop transaction
      // earns feedback. Switching to Build cancels the pending transaction.
      if (active && apply(index)) {
        onToast(message);
        onActionComplete({ type, index, position, pouch: crops.pouch });
      }
      refresh();
    });
    if (started) {
      button.classList.add("active");
      onActionStart({ type, index, position });
    } else {
      busy = false;
      onToast("รอให้ท่าทางจบก่อน แล้วลองอีกครั้งนะ");
    }
    refresh();
  }

  button.onclick = () => {
    if (disposed || !active || busy || !crops) return;
    // Resolve at the tap, not from a possibly stale 200 ms HUD snapshot.
    refresh();
    if (!target) return;
    const { index, state, soilState } = target;

    if (state === CROP_STATES.EMPTY && soilState === SOIL_STATES.PLAIN) {
      playFarmAction({
        type: "hoe", index, animationName: animations.hammer,
        label: "กำลังพรวนดิน…", message: "พรวนดินแล้ว 🪏", apply: (i) => crops.hoe(i),
      });
      return;
    }

    if (state === CROP_STATES.EMPTY && soilState === SOIL_STATES.TILLED) {
      playFarmAction({
        type: "water", index, animationName: animations.pickUp,
        label: "กำลังรดน้ำ…", message: "รดน้ำแล้ว 💧", apply: (i) => crops.water(i),
      });
      return;
    }

    if (state === CROP_STATES.EMPTY && soilState === SOIL_STATES.WATERED) {
      playFarmAction({
        type: "plant", index, animationName: animations.pickUp,
        label: "กำลังหยอดเมล็ด…", message: "หยอดเมล็ดแล้ว 🌱", apply: (i) => crops.plant(i),
      });
      return;
    }

    if (state === CROP_STATES.RIPE) {
      playFarmAction({
        type: "harvest", index, animationName: animations.pullRadish,
        label: "กำลังเก็บเกี่ยว…", message: "ได้หัวไชเท้า +1 🥕", apply: (i) => crops.harvest(i),
      });
    }
  };

  function sameTarget(a, b) {
    if (!a || !b) return a === b;
    return a.index === b.index
      && a.state === b.state
      && a.soilState === b.soilState;
  }

  function setActive(next) {
    if (active === Boolean(next)) return;
    active = Boolean(next);
    if (!active) {
      actionRun += 1;
      busy = false;
      button.classList.remove("active");
    }
    refresh();
  }

  function update(delta, { active: nextActive = true } = {}) {
    if (disposed) return;
    setActive(nextActive);
    if (!active || !crops) return;
    const position = playerRuntime.position;
    if (!position) return;

    sinceCheck += delta;
    if (sinceCheck < 0.2) return;
    sinceCheck = 0;

    const next = crops.getTarget(position);
    const changed = !sameTarget(target, next) || next?.state === CROP_STATES.GROWING;
    target = next;
    if (changed) refresh();
  }

  return {
    refresh,
    update,
    setActive,
    dispose() {
      disposed = true;
      actionRun += 1;
      button.onclick = null;
      onTargetChange(null);
    },
    get busy() { return busy; },
    get target() {
      return target;
    },
  };
}
