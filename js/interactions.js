const interactions = (() => {
  const ACTIVATION_COOLDOWN_MS = 320;
  const registry = new Map();

  let current = null;
  let lastActivationTime = -Infinity;
  let message = "";
  let messageUntil = 0;

  function resolveValue(value, entry) {
    return typeof value === "function" ? value(entry) : value;
  }

  function getPosition(entry) {
    const position = typeof entry.getPosition === "function"
      ? entry.getPosition()
      : { x: entry.x, y: entry.y };

    return Number.isFinite(position?.x) && Number.isFinite(position?.y)
      ? position
      : null;
  }

  function register(entry) {
    if (!entry || typeof entry.id !== "string" || typeof entry.action !== "function") {
      console.warn("Ignored an invalid interaction entry.", entry);
      return false;
    }

    const position = getPosition(entry);
    const radius = resolveValue(entry.radius, entry);
    if (!position || !Number.isFinite(radius) || radius <= 0) {
      console.warn(`Ignored interaction ${entry.id}: invalid position or radius.`);
      return false;
    }

    registry.set(entry.id, entry);
    return true;
  }

  function registerMany(entries) {
    if (!Array.isArray(entries)) return 0;
    return entries.reduce((count, entry) => count + (register(entry) ? 1 : 0), 0);
  }

  function update(playerX, playerY) {
    let nearest = null;
    let nearestDistance = Infinity;
    let nearestPriority = -Infinity;

    registry.forEach((entry) => {
      if (typeof entry.isEnabled === "function" && !entry.isEnabled()) return;

      const position = getPosition(entry);
      const radius = resolveValue(entry.radius, entry);
      if (!position || !Number.isFinite(radius) || radius <= 0) return;

      const distance = Math.hypot(playerX - position.x, playerY - position.y);
      if (distance > radius) return;

      const priority = Number.isFinite(entry.priority) ? entry.priority : 0;
      const isCloser = distance < nearestDistance - 0.01;
      const winsTie = Math.abs(distance - nearestDistance) <= 0.01 && priority > nearestPriority;
      if (!isCloser && !winsTie) return;

      nearest = { entry, position, distance };
      nearestDistance = distance;
      nearestPriority = priority;
    });

    current = nearest;
    return current;
  }

  function activateCurrent() {
    if (!current) {
      notify("ยังไม่มีสิ่งให้ใช้งานใกล้ ๆ", 1300);
      return false;
    }

    const now = performance.now();
    if (now - lastActivationTime < ACTIVATION_COOLDOWN_MS) return false;
    lastActivationTime = now;
    return Boolean(current.entry.action());
  }

  function getPromptLabel() {
    if (!current) return null;
    const label = resolveValue(current.entry.label, current.entry);
    return typeof label === "string" && label.trim() ? label.trim() : null;
  }

  function notify(text, duration = 2200) {
    message = String(text ?? "");
    messageUntil = performance.now() + Math.max(300, duration);
  }

  function drawWorld(ctx) {
    if (!current) return;

    const entry = current.entry;
    const radiusValue = resolveValue(entry.highlightRadius, entry);
    const radius = Number.isFinite(radiusValue) ? radiusValue : 28;
    const pulse = 1 + Math.sin(performance.now() / 180) * 0.08;

    ctx.save();
    ctx.strokeStyle = entry.highlightColor ?? "rgba(255, 238, 125, 0.95)";
    ctx.fillStyle = "rgba(255, 238, 125, 0.12)";
    ctx.lineWidth = 4;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(current.position.x, current.position.y, radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawMessage(ctx) {
    if (!message || performance.now() >= messageUntil) return;

    ctx.font = "600 15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const width = Math.min(window.innerWidth - 32, ctx.measureText(message).width + 24);
    const y = Math.max(148, window.innerHeight - 138);
    ctx.fillStyle = "rgba(10, 24, 25, 0.82)";
    ctx.fillRect(window.innerWidth / 2 - width / 2, y - 17, width, 34);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(message, window.innerWidth / 2, y);
  }

  function getCurrentId() {
    return current?.entry.id ?? null;
  }

  return {
    register,
    registerMany,
    update,
    activateCurrent,
    getPromptLabel,
    getCurrentId,
    notify,
    drawWorld,
    drawMessage,
  };
})();
