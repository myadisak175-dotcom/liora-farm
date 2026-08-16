import { CROP_STATES } from "../systems/farming/crops.js";

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

  function refresh() {
    if (!crops) return;
    pouchCount.textContent = String(crops.pouch);

    if (!target) {
      button.textContent = "ถอนผัก";
      button.disabled = true;
      button.classList.remove("ready");
      return;
    }
    if (target.state === CROP_STATES.EMPTY) {
      button.textContent = "ปลูกผัก";
      button.disabled = false;
      button.classList.add("ready");
      return;
    }
    if (target.state === CROP_STATES.GROWING) {
      button.textContent = `กำลังโต ${Math.round(target.progress * 100)}%`;
      button.disabled = true;
      button.classList.remove("ready");
      return;
    }

    button.textContent = "เก็บเกี่ยว";
    button.disabled = false;
    button.classList.add("ready");
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
    const { index, state } = target;
    if (state === CROP_STATES.EMPTY) {
      playFarmAction(animations.pickUp, () => {
        if (crops.plant(index)) onToast("ปลูกแล้ว 🌱");
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
    return a.index === b.index && a.state === b.state;
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
