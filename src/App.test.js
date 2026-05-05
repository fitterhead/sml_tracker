import { render, screen } from '@testing-library/react';
import App from './App';

test('renders login gate', () => {
  render(<App />);
  const titleElement = screen.getByText(/Internal Login/i);
  expect(titleElement).toBeInTheDocument();
});
