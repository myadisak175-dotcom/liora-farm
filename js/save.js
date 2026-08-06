const save = (() => {
  const SAVE_KEY = "liora-farm-save";
  const DEFAULT_TIME = { day: 1, minutes: 6 * 60 };

  function load() {
    try {
      const storedSave = JSON.parse(localStorage.getItem(SAVE_KEY));
      const storedTime = storedSave?.time;

      if (
        Number.isInteger(storedTime?.day) &&
        storedTime.day >= 1 &&
        Number.isInteger(storedTime?.minutes) &&
        storedTime.minutes >= 6 * 60 &&
        storedTime.minutes < 26 * 60
      ) {
        return { day: storedTime.day, minutes: storedTime.minutes };
      }
    } catch (error) {
      console.warn("Could not load the local save; starting a new day.", error);
    }

    return { ...DEFAULT_TIME };
  }

  function saveTime(timeState) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ time: timeState }));
    } catch (error) {
      console.warn("Could not save the current game time.", error);
    }
  }

  return { load, save: saveTime };
})();
