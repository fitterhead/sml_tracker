import { formatCardDisplayDate, getPileLayout } from './boardConfig';

test('active card stack keeps horizontal spacing consistent for every adjacent card', () => {
  const visibleCount = 100;
  const firstDelta =
    getPileLayout('active', visibleCount, 1).x -
    getPileLayout('active', visibleCount, 0).x;
  const lateDelta =
    getPileLayout('active', visibleCount, 99).x -
    getPileLayout('active', visibleCount, 98).x;

  expect(lateDelta).toBeCloseTo(firstDelta, 6);
  expect(firstDelta).toBeCloseTo(11.783503, 5);
});

test('active card stack uses half-strength diagonal rotation', () => {
  const visibleCount = 100;
  const firstRotation = getPileLayout('active', visibleCount, 1).rotate;
  const lateRotation =
    getPileLayout('active', visibleCount, 99).rotate -
    getPileLayout('active', visibleCount, 98).rotate;

  expect(lateRotation).toBeCloseTo(firstRotation, 6);
  expect(firstRotation).toBeCloseTo(0.014, 6);
});


test('start dates keep their calendar day in time zones west of UTC', () => {
  expect(formatCardDisplayDate('2026-10-18')).toBe('Oct 18, 2026');
});

test.each(['hold', 'done'])('%s stack matches To Do spacing and rotation at every card count', (lane) => {
  for (const count of [1, 2, 14, 20]) {
    for (let index = 0; index < count; index += 1) {
      expect(getPileLayout(lane, count, index)).toEqual(getPileLayout('active', count, index));
    }
  }
});
