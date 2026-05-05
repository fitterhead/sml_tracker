import { useBoardStore } from './useBoardStore';

describe('useBoardStore', () => {
  afterEach(() => {
    localStorage.clear();
    useBoardStore.getState().resetBoard();
  });

  test('deleteCard removes the selected card', () => {
    const initialCards = useBoardStore.getState().cards;
    const cardToDelete = initialCards[0];

    useBoardStore.getState().deleteCard(cardToDelete.id);

    const remainingCards = useBoardStore.getState().cards;

    expect(remainingCards).toHaveLength(initialCards.length - 1);
    expect(remainingCards.some((card) => card.id === cardToDelete.id)).toBe(false);
  });
});
