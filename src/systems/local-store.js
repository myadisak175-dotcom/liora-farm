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
 */
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
      lastIssue = { kind, backupKey: null };
      console.warn(`"${key}" backup failed (${kind})`, error);
    }
  }

  function has() {
    return localStorage.getItem(key) !== null;
  }

  function save(payload) {
    try {
      localStorage.setItem(key, JSON.stringify(payload));
      return true;
    } catch (error) {
      lastIssue = { kind: "save-failed", error: String(error) };
      console.warn(`"${key}" could not be saved`, error);
      return false;
    }
  }

  /** The stored payload, or null when there is nothing usable to load. */
  function load() {
    lastIssue = null;
    lastRaw = localStorage.getItem(key);
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
    localStorage.removeItem(key);
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
    get lastIssue() {
      return lastIssue;
    },
  };
}
