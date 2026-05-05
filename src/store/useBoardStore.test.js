import { useBoardStore } from './useBoardStore';

describe('useBoardStore', () => {
  afterEach(() => {
    localStorage.clear();
    useBoardStore.getState().resetBoard();
  });

  test('deleteCard removes the selected card and keeps a placeholder board', () => {
    const initialCards = useBoardStore.getState().cards;
    const cardToDelete = initialCards[0];

    useBoardStore.getState().deleteCard(cardToDelete.id);

    const remainingCards = useBoardStore.getState().cards;

    expect(remainingCards).toHaveLength(1);
    expect(remainingCards.some((card) => card.id === cardToDelete.id)).toBe(false);
    expect(remainingCards[0].taskName).toBe('');
    expect(remainingCards[0].jobName).toBe('');
  });
});
