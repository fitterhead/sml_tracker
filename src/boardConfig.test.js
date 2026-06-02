import { getPileLayout } from './boardConfig';

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
