function resolveValue(value, context) {
  return typeof value === "function" ? value(context) : value;
}

function isToolSpecific(action, selectedToolId) {
  return Array.isArray(action.toolIds) && action.toolIds.includes(selectedToolId);
}

function isToolNeutral(action) {
  return action.toolIds === undefined || action.toolIds === null;
}

function isAvailable(action, context) {
  return typeof action.execute === "function" && resolveValue(action.when, context) !== false;
}

function priorityOf(action) {
  return Number.isFinite(action.priority) ? action.priority : 0;
}

function chooseHighestPriority(actions) {
  return [...actions].sort((a, b) => priorityOf(b) - priorityOf(a))[0] ?? null;
}

export function resolveAction(actions, context = {}) {
  if (!Array.isArray(actions)) return null;

  const selectedToolId = context.selectedToolId ?? null;
  const available = actions.filter((action) => action && isAvailable(action, context));
  const toolSpecific = available.filter((action) => isToolSpecific(action, selectedToolId));
  const candidates = toolSpecific.length > 0
    ? toolSpecific
    : available.filter(isToolNeutral);
  const action = chooseHighestPriority(candidates);
  if (!action) return null;

  const label = resolveValue(action.label, context);
  return {
    id: typeof action.id === "string" && action.id.trim() ? action.id.trim() : "action",
    label: typeof label === "string" && label.trim() ? label.trim() : null,
    execute: () => action.execute(context),
    toolSpecific: isToolSpecific(action, selectedToolId),
  };
}
