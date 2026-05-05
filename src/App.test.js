import { render, screen } from '@testing-library/react';
import App from './App';

test('renders board view', () => {
  render(<App />);
  const titleElement = screen.getByText(/SML Project Note/i);
  expect(titleElement).toBeInTheDocument();
});
