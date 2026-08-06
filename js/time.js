export const REAL_SECONDS_PER_DAY = 300;

export const time = (() => {
  const START_MINUTES = 6 * 60;
  const END_MINUTES = 26 * 60;
  const MINUTES_PER_STEP = 10;
  const STEPS_PER_DAY = (END_MINUTES - START_MINUTES) / MINUTES_PER_STEP;
  const REAL_SECONDS_PER_STEP = REAL_SECONDS_PER_DAY / STEPS_PER_DAY;

  const PERIODS = {
    Morning: "#91c96b",
    Afternoon: "#6eaf5d",
    Evening: "#c77b4d",
    Night: "#172c46",
  };

  let day = 1;
  let minutes = START_MINUTES;
  let elapsedSeconds = 0;

  function setState(state) {
    day = state.day;
    minutes = state.minutes;
    elapsedSeconds = 0;
  }

  function update(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) return false;
    elapsedSeconds += deltaTime;
    let dayChanged = false;

    while (elapsedSeconds >= REAL_SECONDS_PER_STEP) {
      elapsedSeconds -= REAL_SECONDS_PER_STEP;
      minutes += MINUTES_PER_STEP;
      if (minutes >= END_MINUTES) {
        day += 1;
        minutes = START_MINUTES;
        dayChanged = true;
      }
    }
    return dayChanged;
  }

  function getHour() {
    return Math.floor(minutes / 60) % 24;
  }

  function getMinute() {
    return minutes % 60;
  }

  function getDay() {
    return day;
  }

  function getPeriod() {
    const hour = getHour();
    if (hour >= 6 && hour < 12) return "Morning";
    if (hour >= 12 && hour < 18) return "Afternoon";
    if (hour >= 18 && hour < 21) return "Evening";
    return "Night";
  }

  function getState() {
    return { day, minutes };
  }

  function getFormattedTime() {
    const hour = getHour();
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${String(getMinute()).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
  }

  function drawBackground(ctx, width, height) {
    ctx.fillStyle = PERIODS[getPeriod()];
    ctx.fillRect(0, 0, width, height);
  }

  function draw(ctx) {
    const label = `Day ${day} · ${getFormattedTime()} · ${getPeriod()}`;
    ctx.font = "600 14px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(10, 24, 25, 0.72)";
    ctx.fillRect(12, 44, window.innerWidth - 24, 38);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, window.innerWidth / 2, 63);
  }

  return {
    setState,
    update,
    draw,
    drawBackground,
    getHour,
    getMinute,
    getDay,
    getPeriod,
    getState,
  };
})();
