export function bindPlayerActionButtons({
  buttons,
  animations,
  playSpecial,
  skipActions = ["farm"],
}) {
  const skipped = new Set(skipActions);

  for (const button of buttons) {
    const action = button.dataset.action;
    if (!action || skipped.has(action)) continue;

    button.onclick = () => {
      const started = playSpecial(animations[action], () => {
        button.classList.remove("active");
      });
      if (started) button.classList.add("active");
    };
  }
}
