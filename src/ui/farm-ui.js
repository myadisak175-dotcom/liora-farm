import { CROP_STATES, SOIL_STATES } from "../systems/farming/crops.js";

export function createFarmUI({
  crops,
  playerRuntime,
  button,
  pouchCount,
  animations,
  onToast = () => {},
}) {
  let target = null;
  let sinceCheck = 0;

  function setButton(label, enabled) {
    button.textContent = label;
    button.disabled = !enabled;
    button.classList.toggle("ready", enabled);
  }

  function refresh() {
    if (!crops) return;
    pouchCount.textContent = String(crops.pouch);

    if (!target) {
      setButton("ทำฟาร์ม", false);
      return;
    }

    if (target.state === CROP_STATES.EMPTY) {
      if (target.soilState === SOIL_STATES.PLAIN) {
        setButton("🪏 พรวนดิน", true);
        return;
      }
      if (target.soilState === SOIL_STATES.TILLED) {
        setButton("💧 รดน้ำ", true);
        return;
      }
      setButton("🌱 หยอดเมล็ด", true);
      return;
    }

    if (target.state === CROP_STATES.GROWING) {
      setButton(`กำลังโต ${Math.round(target.progress * 100)}%`, false);
      return;
    }

    setButton("🥕 เก็บเกี่ยว", true);
  }

  function playFarmAction(animationName, onDone) {
    const started = playerRuntime.playSpecial(animationName, () => {
      button.classList.remove("active");
      onDone?.();
    });
    if (started) button.classList.add("active");
  }

  button.onclick = () => {
    if (!crops || !target) return;
    const { index, state, soilState } = target;

    if (state === CROP_STATES.EMPTY && soilState === SOIL_STATES.PLAIN) {
      playFarmAction(animations.hammer, () => {
        if (crops.hoe(index)) onToast("พรวนดินแล้ว 🪏");
      });
      return;
    }

    if (state === CROP_STATES.EMPTY && soilState === SOIL_STATES.TILLED) {
      playFarmAction(animations.pickUp, () => {
        if (crops.water(index)) onToast("รดน้ำแล้ว 💧");
      });
      return;
    }

    if (state === CROP_STATES.EMPTY && soilState === SOIL_STATES.WATERED) {
      playFarmAction(animations.pickUp, () => {
        if (crops.plant(index)) onToast("หยอดเมล็ดแล้ว 🌱");
      });
      return;
    }

    if (state === CROP_STATES.RIPE) {
      playFarmAction(animations.pullRadish, () => {
        if (crops.harvest(index)) onToast("ได้หัวไชเท้า +1 🥕");
      });
    }
  };

  function sameTarget(a, b) {
    if (!a || !b) return a === b;
    return a.index === b.index
      && a.state === b.state
      && a.soilState === b.soilState;
  }

  function update(delta, { active = true } = {}) {
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
    get target() {
      return target;
    },
  };
}
