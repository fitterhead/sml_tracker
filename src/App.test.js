import { render, screen } from '@testing-library/react';
import App from './App';

beforeEach(() => {
  localStorage.setItem('sml-tracker-auth-token', 'test-token');
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      token: 'test-token',
      user: {
        name: 'Andrew',
        role: 'manager',
      },
      board: {
        todoColumns: [
          { id: 'todo-1', title: 'To Do' },
          { id: 'todo-2', title: 'To Do 2' },
        ],
        cards: [],
      },
    }),
  });
});

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

test('renders board view', async () => {
  render(<App />);
  const titleElement = await screen.findByRole('button', {
    name: /SML Project Note/i,
  });
  expect(titleElement).toBeInTheDocument();
});
