import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RichTextInput from './RichTextEditor';
import { closeHistory } from '@tiptap/pm/history';
import RichText from './RichText';
import { readRichText, richTextToPlainText } from '../lib/richText';

// JSDOM has no layout; ProseMirror asks for caret geometry when focusing.
beforeAll(() => {
  if (!Range.prototype.getClientRects) Range.prototype.getClientRects = () => [];
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
  if (!document.elementFromPoint) document.elementFromPoint = () => null;
});

test('toolbar applies bold, italic and colour to selected text and renders safely after reopening', async () => {
  const change = jest.fn();
  const { unmount } = render(<RichTextInput value="Approved" onChange={change} aria-label="Note" />);
  const input = screen.getByRole('textbox', { name: 'Note' });
  fireEvent.focus(input);
  act(() => input.editor.commands.setTextSelection({ from: 1, to: 9 }));
  fireEvent.click(screen.getByRole('button', { name: 'Bold' }));
  fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
  fireEvent.click(screen.getByRole('button', { name: 'Text colour', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Use #2457a6' }));
  expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
  const saved = change.mock.calls.slice(-1)[0][0].target.value;
  expect(readRichText(saved).content[0].content[0].marks).toEqual(expect.arrayContaining([{ type: 'bold' }, { type: 'italic' }, { type: 'textStyle', attrs: { color: '#2457a6' } }]));
  unmount();
  render(<RichText value={saved} />);
  expect(screen.getByText('Approved').closest('strong')).toBeInTheDocument();
  expect(screen.getByText('Approved')).toHaveStyle('color: #2457a6');
});

test('Shift+Enter makes a line break without saving; Enter in a list creates an item', async () => {
  const save = jest.fn((event) => { if (event.key === 'Enter') event.preventDefault(); });
  const change = jest.fn();
  render(<RichTextInput value="First" onChange={change} onKeyDown={save} aria-label="Note" />);
  const input = screen.getByRole('textbox', { name: 'Note' });
  fireEvent.focus(input);
  act(() => input.editor.commands.setTextSelection(6));
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
  expect(save).not.toHaveBeenCalled();
  expect(richTextToPlainText(change.mock.calls.slice(-1)[0][0].target.value)).toBe('First\n');
  fireEvent.click(screen.getByRole('button', { name: 'Bullet list' }));
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input.querySelectorAll('li')).toHaveLength(2);
  expect(save).not.toHaveBeenCalled();
  await waitFor(() => expect(input.querySelector('ul')).toBeInTheDocument());
});

test('numbered lists, clear formatting, undo and empty values behave as text controls', () => {
  const change = jest.fn();
  const { rerender } = render(<RichTextInput value="Review" onChange={change} aria-label="Note" />);
  const input = screen.getByRole('textbox', { name: 'Note' });
  fireEvent.focus(input);
  fireEvent.click(screen.getByRole('button', { name: 'Numbered list' }));
  expect(input.querySelector('ol')).toBeInTheDocument();
  act(() => input.editor.view.dispatch(closeHistory(input.editor.state.tr)));
  fireEvent.click(screen.getByRole('button', { name: 'Clear formatting' }));
  expect(input.querySelector('ol')).not.toBeInTheDocument();
  act(() => input.editor.commands.undo());
  expect(input.querySelector('ol')).toBeInTheDocument();
  rerender(<RichTextInput value="" onChange={change} aria-label="Note" />);
  expect(input).toHaveTextContent('');
});

test('IME composition and toolbar Enter do not trigger parent save shortcuts', () => {
  const parentKey = jest.fn();
  const save = jest.fn();
  render(<div onKeyDown={parentKey}><RichTextInput value="Review" onChange={jest.fn()} onKeyDown={save} aria-label="Note" /></div>);
  const input = screen.getByRole('textbox', { name: 'Note' });
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 });
  expect(save).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Bold' }), { key: 'Enter' });
  expect(parentKey).not.toHaveBeenCalled();
});

test('formatting tools appear only while the field or its controls have focus', () => {
  render(<RichTextInput value="Read first" onChange={jest.fn()} aria-label="Note" />);
  const input = screen.getByRole('textbox', { name: 'Note' });
  expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument();
  fireEvent.focus(input);
  expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument();
  fireEvent.blur(input, { relatedTarget: document.body });
  expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeInTheDocument();
});
