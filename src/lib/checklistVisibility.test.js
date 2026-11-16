import { getChecklistVisibility } from './checklistVisibility';

const completed = Array.from({ length: 5 }, (_, i) => ({ id: i, state: 'completed', completedAt: `2026-11-${10 + i}` }));
const pending = { id: 'pending', state: 'in_progress', checked: true };

test('hides older completed items while preserving unfinished work and original order', () => {
  const items = [pending, ...completed];
  expect(getChecklistVisibility(items)).toEqual({ items: [pending, completed[3], completed[4]], hiddenCount: 3 });
  expect(getChecklistVisibility(items, true)).toEqual({ items, hiddenCount: 3 });
});

test('small checklists stay fully visible', () => {
  expect(getChecklistVisibility(completed)).toEqual({ items: completed, hiddenCount: 0 });
});

test('unfinished and legacy checked items are handled without removing data', () => {
  const items = [...completed.map(({ state, ...item }) => ({ ...item, checked: true })), pending];
  expect(getChecklistVisibility(items).items).toEqual([items[3], items[4], pending]);
  expect(items).toHaveLength(6);
  const unfinished = Array.from({ length: 8 }, (_, id) => ({ id, checked: false }));
  expect(getChecklistVisibility(unfinished)).toEqual({ items: unfinished, hiddenCount: 0 });
});
