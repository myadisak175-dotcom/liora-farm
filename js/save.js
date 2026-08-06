export const save = (() => {
  const SAVE_KEY = "liora-farm-save";
  const SAVE_VERSION = 2;
  const DEFAULT_TIME = { day: 1, minutes: 6 * 60 };

  function getStoredSave() {
    const storedSave = JSON.parse(localStorage.getItem(SAVE_KEY));
    return storedSave && typeof storedSave === "object" ? storedSave : {};
  }

  function load() {
    try {
      const storedSave = getStoredSave();
      const storedTime = storedSave?.time;
      if (
        Number.isInteger(storedTime?.day) &&
        storedTime.day >= 1 &&
        Number.isInteger(storedTime?.minutes) &&
        storedTime.minutes >= 6 * 60 &&
        storedTime.minutes < 26 * 60
      ) {
        return {
          version: Number.isInteger(storedSave.version) ? storedSave.version : 1,
          time: { day: storedTime.day, minutes: storedTime.minutes },
          farm: storedSave.farm,
          economy: storedSave.economy,
          player: storedSave.player,
        };
      }
    } catch (error) {
      console.warn("Could not load the local save; starting a new day.", error);
    }

    return {
      version: SAVE_VERSION,
      time: { ...DEFAULT_TIME },
      farm: undefined,
      economy: undefined,
      player: undefined,
    };
  }

  function saveGame(timeState, farmState, economyState, playerState) {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          version: SAVE_VERSION,
          time: timeState,
          farm: farmState,
          economy: economyState,
          player: playerState,
        }),
      );
    } catch (error) {
      console.warn("Could not save the current game.", error);
    }
  }

  return { load, save: saveGame };
})();
