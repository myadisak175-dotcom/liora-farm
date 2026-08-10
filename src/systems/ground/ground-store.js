/**
 * Ground store — spec docs/GROUND_SYSTEM.md section 2.2.
 * Drafts auto-save to localStorage; committed authoring data lives in
 * maps/home-island-ground.json. Strokes are stored, never a baked image.
 */
const SCHEMA_VERSION = 1;
const DRAFT_SAVE_DELAY = 700;

export function createGroundStore({
  painter,
  url = "./maps/home-island-ground.json",
  storageKey = "liora.ground.draft.v1",
  worldSize = 42,
  resolution = 512,
}) {
  let draftTimer = null;
  let source = "empty";

  function serialize() {
    return {
      version: SCHEMA_VERSION,
      worldSize,
      resolution,
      strokes: painter.strokes,
    };
  }

  function isUsable(data) {
    return Boolean(data && data.version === SCHEMA_VERSION && Array.isArray(data.strokes));
  }

  function readDraft() {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return isUsable(data) ? data : null;
    } catch (error) {
      console.warn("[ground-store] draft unreadable:", error.message);
      return null;
    }
  }

  async function readMap() {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      if (!isUsable(data)) throw new Error("unsupported schema");
      return data;
    } catch (error) {
      console.info(`[ground-store] no committed ground map (${error.message})`);
      return null;
    }
  }

  return {
    async loadInitial() {
      const draft = readDraft();
      if (draft) {
        painter.load(draft.strokes);
        source = "draft";
        return { source, count: draft.strokes.length };
      }

      const map = await readMap();
      if (map) {
        painter.load(map.strokes);
        source = "map";
        return { source, count: map.strokes.length };
      }

      source = "empty";
      return { source, count: 0 };
    },

    saveDraft() {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(serialize()));
          source = "draft";
        } catch (error) {
          console.warn("[ground-store] draft save failed:", error.message);
        }
      }, DRAFT_SAVE_DELAY);
    },

    clearDraft() {
      clearTimeout(draftTimer);
      try {
        localStorage.removeItem(storageKey);
      } catch (error) {
        console.warn("[ground-store] draft clear failed:", error.message);
      }
      source = "empty";
    },

    toJson() {
      return JSON.stringify(serialize());
    },

    download(filename = "home-island-ground.json") {
      const blob = new Blob([this.toJson()], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    },

    getSource: () => source,
    getCount: () => painter.strokes.length,
  };
}
