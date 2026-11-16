import { fireEvent, render, screen } from '@testing-library/react';
import ExpandableText from './ExpandableText';

test('expands long content without invoking edit or the card click', () => {
  const edit = jest.fn();
  const open = jest.fn();
  render(<div onClick={open}><ExpandableText value={'Long checklist '.repeat(30)} onEdit={edit} /></div>);
  fireEvent.click(screen.getByRole('button', { name: '… See more' }));
  expect(screen.getByRole('button', { name: 'See less' })).toHaveAttribute('aria-expanded', 'true');
  expect(edit).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'See less' }));
  expect(screen.getByRole('button', { name: '… See more' })).toHaveAttribute('aria-expanded', 'false');
});

test('short content needs no expansion control', () => {
  render(<ExpandableText value="Short note" />);
  expect(screen.getByText('Short note')).toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
