// Retain all unfinished work and the two most recently completed items.
export function getChecklistVisibility(items, expanded = false) {
  if (items.length <= 5) return { items, hiddenCount: 0 };
  const completed = items.filter((item) => item.state ? item.state === 'completed' : item.checked);
  const time = (item) => Date.parse(item.completedAt || item.createdAt || '') || 0;
  const old = new Set([...completed].sort((a, b) => time(b) - time(a)).slice(2));
  return { items: expanded ? items : items.filter((item) => !old.has(item)), hiddenCount: old.size };
}
