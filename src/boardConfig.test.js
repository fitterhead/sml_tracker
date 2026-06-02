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
});
