/**
 * One place that knows how to take the game apart again.
 *
 * `main.js` boots as a straight line: thirty-three imports, each system built
 * and wired by hand, each one's `update()` typed into `animate()` in the right
 * order. That works exactly as long as the game lives as long as the page.
 *
 * It stops working the first time a second map loads without a reload. The
 * repo had 34 `addEventListener` calls against a single `removeEventListener`,
 * so a second boot would leave the first boot's camera still orbiting on every
 * touch, the first joystick still driving a player that no longer exists, and
 * the first frame loop still rendering into a scene meant to be gone. None of
 * that throws. It shows up as "the camera moves twice as fast sometimes",
 * which is a miserable thing to track down months later.
 *
 * So: nothing here changes what the game does today. It gives teardown a home
 * before it is urgently needed, and it makes the frame order explicit data
 * instead of a hand-maintained sequence of statements.
 *
 *     const systems = createSystemRegistry();
 *     systems.listen(window, "resize", onResize);
 *     systems.add("wind", wind);                       // update + dispose
 *     systems.add("shadows", { update: () => {...} }); // update only
 *     systems.start((delta) => { ... });
 *     systems.dispose();
 *
 * A system is anything with an optional `update(delta, context)` and an
 * optional `dispose()`. Both are optional so existing systems can be handed
 * over as they are.
 */
export function createSystemRegistry({ onError = null } = {}) {
  const entries = [];
  const listeners = [];
  let frame = 0;
  let disposed = false;

  function guard(name, phase, run) {
    try {
      run();
    } catch (error) {
      // One broken system must not take the frame loop or the teardown with
      // it — a dispose that throws halfway leaves exactly the half-registered
      // state this file exists to prevent.
      console.error(`system "${name}" failed during ${phase}`, error);
      onError?.({ name, phase, error });
    }
  }

  return {
    /**
     * Register a system. Order matters: `update()` runs them in the order they
     * were added, which is the order `animate()` used to spell out by hand.
     */
    add(name, system) {
      if (disposed) throw new Error(`registry disposed; cannot add "${name}"`);
      if (system) entries.push({ name, system });
      return system;
    },

    /**
     * addEventListener that remembers how to undo itself. Every listener added
     * this way is removed by `dispose()`, which is the whole point.
     */
    listen(target, type, handler, options) {
      if (!target?.addEventListener) return () => {};
      target.addEventListener(type, handler, options);
      const off = () => target.removeEventListener(type, handler, options);
      listeners.push(off);
      return off;
    },

    /** Run every system's `update`, in registration order. */
    update(delta, context) {
      for (const { name, system } of entries) {
        if (system.update) guard(name, "update", () => system.update(delta, context));
      }
    },

    /**
     * Own the animation frame, so stopping is possible. `body` gets the frame
     * to itself — ordering between registered systems and the renderer is
     * still main.js's business, not this file's.
     */
    start(body) {
      const tick = () => {
        frame = requestAnimationFrame(tick);
        body();
      };
      frame = requestAnimationFrame(tick);
    },

    stop() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    },

    /** Registered systems, for tests and the perf HUD. */
    get names() {
      return entries.map((entry) => entry.name);
    },

    get disposed() {
      return disposed;
    },

    /**
     * Stop the loop, drop every listener, and dispose systems in reverse order
     * so a system is never torn down before something that depends on it.
     */
    dispose() {
      if (disposed) return;
      disposed = true;
      this.stop();
      for (const off of listeners.splice(0).reverse()) {
        try { off(); } catch { /* target already gone */ }
      }
      for (const { name, system } of entries.splice(0).reverse()) {
        if (system.dispose) guard(name, "dispose", () => system.dispose());
      }
    },
  };
}
