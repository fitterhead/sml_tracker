import { formatCardDisplayDate, getPileLayout, getDragPoint } from './boardConfig';

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


test('status drops follow the pointer instead of an offset card centre, including touch', () => {
  const event = { delta: { x: 100, y: -20 }, active: { rect: { current: { initial: { left: 10, top: 20, width: 300, height: 148 } } } } };
  expect(getDragPoint({ ...event, activatorEvent: { clientX: 30, clientY: 40 } })).toEqual({ x: 130, y: 20 });
  expect(getDragPoint({ ...event, activatorEvent: { touches: [{ clientX: 30, clientY: 40 }] } })).toEqual({ x: 130, y: 20 });
  expect(getDragPoint(event)).toEqual({ x: 260, y: 74 });
  expect(getDragPoint({})).toBeNull();
});
