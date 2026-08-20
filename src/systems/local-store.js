/**
 * Versioned localStorage with one rule: never lose a payload we cannot read.
 *
 * `layout-store.js` learned this the hard way — a save from a different schema
 * version was dropped on the floor and then overwritten by the next autosave,
 * taking an entire island's worth of work with it. Ground paint, sculpted
 * terrain and the farm all had the same hole, because the lesson lived inside
 * one file instead of in a shared policy.
 *
 * Anything unreadable is copied to `<key>.backup` before the caller is told
 * "nothing here", and the reason is left on `lastIssue` so the UI can say so
 * out loud instead of silently starting from scratch.
 *
 * This owns bytes, not meaning: it never inspects a payload beyond `version`.
 * A store whose body is the wrong shape calls `rejectLoaded()` to get the same
 * protection.
 *
 * Backups are never cleaned up automatically, and that is deliberate — an
 * autosave eating the backup is the exact bug this file exists to prevent, and
 * `local-store.test.html` pins it. The cost is that they accumulate against a
 * ~5 MB phone quota with nothing watching, so instead of deleting them:
 *
 *   - `report()` sends every failure to the UI, not just `console.warn`. A
 *     quota-full autosave used to be completely silent while the player kept
 *     sculpting terrain that was no longer being saved.
 *   - `discardBackup()` lets a caller drop one *after* the player has been
 *     told it exists and chosen to let it go.
 */

/**
 * Where store failures go. Defaults to the console; `main.js` points it at the
 * toast once the UI exists, so no store needs to know about the UI.
 */
let report = (message) => console.warn(message);

/** Called once at boot with something that can show a message to the player. */
export function setStoreReporter(reporter) {
  report = typeof reporter === "function" ? reporter : (message) => console.warn(message);
}

/** Roughly how much of the origin's localStorage this game is holding. */
export function storageFootprint() {
  let bytes = 0;
  let backups = 0;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith("liora")) continue;
      bytes += key.length + (localStorage.getItem(key)?.length ?? 0);
      if (key.endsWith(".backup")) backups += 1;
    }
  } catch { /* private / restricted storage mode */ }
  return { bytes, backups };
}

export function createLocalStore({ key, version }) {
  if (!key) throw new Error("Local store requires a storage key");
  if (!Number.isFinite(version)) throw new Error("Local store requires a schema version");

  const backupKey = `${key}.backup`;
  let lastIssue = null;
  let lastRaw = null;

  function keep(raw, kind) {
    try {
      localStorage.setItem(backupKey, raw);
      lastIssue = { kind, backupKey };
      console.warn(`"${key}" kept at "${backupKey}" (${kind})`);
    } catch (error) {
      // Out of quota while trying to rescue data. Say so rather than pretend.
      lastIssue = { kind, backupKey: null, error: String(error) };
      console.warn(`"${key}" backup failed (${kind})`, error);
      report("พื้นที่เก็บข้อมูลเต็ม — สำรองข้อมูลเดิมไม่สำเร็จ");
    }
  }

  function readRaw(targetKey, kind = "load-failed") {
    try {
      return localStorage.getItem(targetKey);
    } catch (error) {
      lastIssue = { kind, backupKey: null, error: String(error) };
      console.warn(`"${targetKey}" could not be read`, error);
      report("อ่านข้อมูลที่บันทึกไว้ไม่ได้ — เบราว์เซอร์ปิดกั้นพื้นที่เก็บข้อมูล");
      return null;
    }
  }

  function has() {
    lastIssue = null;
    return readRaw(key, "read-failed") !== null;
  }

  function save(payload) {
    try {
      localStorage.setItem(key, JSON.stringify(payload));
      return true;
    } catch (error) {
      lastIssue = { kind: "save-failed", error: String(error) };
      console.warn(`"${key}" could not be saved`, error);
      // The autosave path. Failing here silently means the player keeps
      // building on top of work that is no longer being written down, which is
      // the worst possible moment to only talk to the console.
      const { backups } = storageFootprint();
      report(backups
        ? `บันทึกไม่สำเร็จ — พื้นที่เต็ม (มีไฟล์สำรองค้างอยู่ ${backups} ชุด)`
        : "บันทึกไม่สำเร็จ — พื้นที่เก็บข้อมูลเต็ม");
      return false;
    }
  }

  /**
   * Drop the rescued copy. For a caller that has told the player it exists and
   * been told to let it go — never call this from an autosave path.
   */
  function discardBackup() {
    try {
      localStorage.removeItem(backupKey);
      if (lastIssue?.backupKey === backupKey) lastIssue = null;
      return true;
    } catch (error) {
      lastIssue = { kind: "clear-failed", backupKey, error: String(error) };
      console.warn(`"${backupKey}" could not be removed`, error);
      return false;
    }
  }

  /** Whether a rescued copy is sitting there waiting to be dealt with. */
  function hasBackup() {
    try { return localStorage.getItem(backupKey) !== null; }
    catch { return false; }
  }

  /** The stored payload, or null when there is nothing usable to load. */
  function load() {
    lastIssue = null;
    lastRaw = readRaw(key, "load-failed");
    if (lastRaw === null) return null;

    let payload = null;
    try {
      payload = JSON.parse(lastRaw);
    } catch (error) {
      keep(lastRaw, "unreadable");
      console.warn(`"${key}" could not be parsed`, error);
      return null;
    }

    if (payload?.version !== version) {
      keep(lastRaw, "version-mismatch");
      return null;
    }
    return payload;
  }

  /**
   * For the caller that parsed a correctly versioned payload and then found
   * the body unusable. Same protection, same reporting.
   */
  function rejectLoaded(kind = "malformed") {
    if (lastRaw === null) return false;
    keep(lastRaw, kind);
    return true;
  }

  function clear() {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      lastIssue = { kind: "clear-failed", backupKey: null, error: String(error) };
      console.warn(`"${key}" could not be cleared`, error);
      report("ล้างข้อมูลที่บันทึกไว้ไม่ได้ — เบราว์เซอร์ปิดกั้นพื้นที่เก็บข้อมูล");
      return false;
    }
  }

  return {
    key,
    backupKey,
    version,
    has,
    save,
    load,
    rejectLoaded,
    clear,
    hasBackup,
    discardBackup,
    get lastIssue() {
      return lastIssue;
    },
  };
}
