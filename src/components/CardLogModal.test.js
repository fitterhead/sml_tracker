import { fireEvent, render, screen, within } from '@testing-library/react';
import CardLogModal from './CardLogModal';
import { useBoardStore } from '../store/useBoardStore';

afterEach(() => { useBoardStore.getState().resetBoard(); localStorage.clear(); });
test('reviews before applying, supports skipping, and reports duplicate input', () => {
  const store = useBoardStore.getState();
  store.resetBoard();
  store.createCard({ taskName: 'Website', jobName: 'Acme' });
  const card = useBoardStore.getState().cards.slice(-1)[0];
  const input = JSON.stringify({ schema: 'sml-card-log/v1', source: 'Client email', updates: [{ match: { cardId: card.id }, notes: ['Approved'] }] });
  render(<CardLogModal onClose={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Update log from ChatGPT'), { target: { value: input } });
  fireEvent.click(screen.getByRole('button', { name: 'Review matches' }));
  expect(useBoardStore.getState().cards.find((item) => item.id === card.id).activityLog).toBeUndefined();
  const selector = screen.getByLabelText('Card for update 1');
  fireEvent.change(selector, { target: { value: '' } });
  expect(screen.getByRole('button', { name: 'Apply 0 updates' })).toBeDisabled();
  fireEvent.change(selector, { target: { value: card.id } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply 1 update' }));
  expect(screen.getByRole('status')).toHaveTextContent('1 update applied');
  fireEvent.click(screen.getByRole('button', { name: 'Review matches' }));
  expect(screen.getByText(/Nothing new to add/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Apply 0 updates' })).toBeDisabled();
});

test('invalid input shows an actionable error without changing cards', () => {
  const before = useBoardStore.getState().cards;
  render(<CardLogModal onClose={jest.fn()} />);
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Update log from ChatGPT'), { target: { value: 'not json' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Review matches' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Could not read the log');
  expect(useBoardStore.getState().cards).toBe(before);
});
