export function createNotifications({
  statusElement,
  toastElement,
  statusAutoHideMs = 2200,
  toastDurationMs = 1400,
}) {
  let statusTimer = null;
  let toastTimer = null;

  function setStatus(text, { autoHide = false } = {}) {
    statusElement.textContent = text;
    statusElement.classList.remove("hidden");
    clearTimeout(statusTimer);
    if (autoHide) {
      statusTimer = setTimeout(() => statusElement.classList.add("hidden"), statusAutoHideMs);
    }
  }

  function toast(text) {
    toastElement.textContent = text;
    toastElement.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastElement.classList.remove("on"), toastDurationMs);
  }

  return { setStatus, toast };
}
