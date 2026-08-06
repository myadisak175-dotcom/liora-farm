import { migrateSave, UnsupportedSaveVersionError } from "./save-migrations.js";
import { createDefaultSave, normalizeSaveV6 } from "./save-schema.js";

export const save = (() => {
  const SAVE_KEY = "liora-farm-save";
  let writesBlocked = false;

  function persist(snapshot) {
    localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
  }

  function load() {
    writesBlocked = false;
    const storedText = localStorage.getItem(SAVE_KEY);
    if (storedText === null) return createDefaultSave();

    let parsed;
    try {
      parsed = JSON.parse(storedText);
    } catch (error) {
      console.warn("Could not parse the local save; starting a new game.", error);
      return createDefaultSave();
    }

    try {
      const result = migrateSave(parsed);
      try {
        persist(result.save);
      } catch (error) {
        console.warn("The migrated save loaded, but could not be written back.", error);
      }
      return result.save;
    } catch (error) {
      if (error instanceof UnsupportedSaveVersionError) {
        writesBlocked = true;
        console.warn("This save was created by a newer game version; saving is disabled.", error);
      } else {
        console.warn("Could not migrate the local save; starting a new game.", error);
      }
      return createDefaultSave();
    }
  }

  function saveGame(snapshot) {
    if (writesBlocked) return false;

    try {
      persist(normalizeSaveV6(snapshot));
      return true;
    } catch (error) {
      console.warn("Could not save the current game.", error);
      return false;
    }
  }

  return {
    load,
    save: saveGame,
    isWriteBlocked: () => writesBlocked,
  };
})();
