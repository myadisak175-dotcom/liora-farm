/**
 * Fullscreen toggle for the HUD.
 *
 * Three browsers, three answers. Chrome and Android give us the standard
 * Fullscreen API; older WebKit only has the prefixed one; and Safari on
 * iPhone has neither — `requestFullscreen` simply does not exist on an
 * element there, no matter what the page does. That last case is not a
 * failure to hide: iOS reaches the same place through "Add to Home Screen",
 * which runs the game standalone with no browser chrome at all. So the
 * button tells the player that instead of silently doing nothing.
 *
 * Everything here is injected, so the whole thing is testable without a real
 * browser going fullscreen.
 */

const LABEL_ENTER = "⛶";
const LABEL_EXIT = "⤢";

/** Is the game already filling the screen, by any of the routes that count? */
export function isFullscreenActive(doc = document, win = window) {
  if (doc?.fullscreenElement || doc?.webkitFullscreenElement) return true;
  // An iOS home-screen launch has no browser chrome to hide in the first
  // place, so the toggle has nothing left to offer.
  return Boolean(win?.navigator?.standalone) || Boolean(win?.matchMedia?.("(display-mode: standalone)")?.matches);
}

/** Whether this browser can be asked to go fullscreen at all. */
export function supportsFullscreen(root = document.documentElement, doc = document) {
  return typeof (root?.requestFullscreen ?? root?.webkitRequestFullscreen) === "function"
    && (doc?.fullscreenEnabled ?? doc?.webkitFullscreenEnabled ?? true) !== false;
}

export function createFullscreenControl({
  button,
  root = document.documentElement,
  doc = document,
  win = window,
  notify = () => {},
} = {}) {
  if (!button) return { dispose() {}, refresh() {}, get supported() { return false; } };

  const supported = supportsFullscreen(root, doc);

  function refresh() {
    const active = isFullscreenActive(doc, win);
    button.textContent = active ? LABEL_EXIT : LABEL_ENTER;
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.setAttribute("aria-label", active ? "ออกจากโหมดเต็มจอ" : "เต็มจอ");
    // A home-screen launch is already as full as it gets: leave the button in
    // place but stop pretending it does anything.
    button.disabled = !supported && active;
  }

  async function enter() {
    const request = root.requestFullscreen ?? root.webkitRequestFullscreen;
    // navigationUI: "hide" is what keeps Android's address bar from sliding
    // back in over the joystick; browsers that do not know the option ignore it.
    await request.call(root, { navigationUI: "hide" });
  }

  async function leave() {
    const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen;
    if (typeof exit === "function") await exit.call(doc);
  }

  async function toggle() {
    if (!supported) {
      notify(isFullscreenActive(doc, win)
        ? "เต็มจออยู่แล้ว"
        : "iPhone ต้องกดแชร์ → เพิ่มไปยังหน้าจอโฮม แล้วเปิดจากไอคอนเพื่อเล่นเต็มจอ");
      return false;
    }
    try {
      if (isFullscreenActive(doc, win)) await leave();
      else await enter();
      refresh();
      return true;
    } catch (error) {
      // A rejected request is normal: some browsers refuse outside a gesture,
      // or while another element owns the screen. Say so rather than leaving
      // the player tapping a dead button.
      notify("เบราว์เซอร์ไม่อนุญาตให้เต็มจอ");
      console.warn("Liora fullscreen refused", error);
      refresh();
      return false;
    }
  }

  const onClick = () => { void toggle(); };
  button.addEventListener("click", onClick);
  doc.addEventListener?.("fullscreenchange", refresh);
  doc.addEventListener?.("webkitfullscreenchange", refresh);
  refresh();

  return {
    toggle,
    refresh,
    get supported() { return supported; },
    dispose() {
      button.removeEventListener("click", onClick);
      doc.removeEventListener?.("fullscreenchange", refresh);
      doc.removeEventListener?.("webkitfullscreenchange", refresh);
    },
  };
}
