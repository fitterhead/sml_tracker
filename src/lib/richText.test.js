import { normalizeTextColor, readRichText, richTextToPlainText, serializeRichText, toEditorDocument, RICH_TEXT_PREFIX } from './richText';
const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Approved', marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'textStyle', attrs: { color: '#2457a6' } }] }, { type: 'hardBreak' }, { type: 'text', text: 'Next step' }] }] };

test('rich formatting round trips while old text, literal HTML, and line breaks stay readable', () => {
  const saved = serializeRichText(doc);
  expect(readRichText(saved)).toEqual(doc);
  expect(richTextToPlainText(saved)).toBe('Approved\nNext step');
  expect(serializeRichText(toEditorDocument('old\ntext'))).toBe('old\ntext');
  expect(richTextToPlainText('<b>literal</b>')).toBe('<b>literal</b>');
  expect(serializeRichText(toEditorDocument('123'))).toBe('123');
});

test('empty formatted content stays empty and lists retain their structure', () => {
  expect(serializeRichText({ type: 'doc', content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] }] })).toBe('');
  const list = { type: 'doc', content: [{ type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: '123' }] }] }] }] };
  const saved = serializeRichText(list);
  expect(richTextToPlainText(saved)).toBe('3. 123');
  expect(readRichText(saved).content[0].type).toBe('orderedList');
});

test('unknown nodes, marks and unsafe colours are discarded', () => {
  const saved = RICH_TEXT_PREFIX + JSON.stringify({ type: 'doc', content: [{ type: 'script', attrs: { src: 'https://example.com' } }, { type: 'paragraph', content: [{ type: 'text', text: '<img onerror=alert(1)>', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'textStyle', attrs: { color: 'url(https://example.com)' } }] }] }] });
  expect(readRichText(saved).content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: '<img onerror=alert(1)>' }] }]);
  expect(normalizeTextColor('rgb(36, 87, 166)')).toBe('#2457a6');
  expect(normalizeTextColor('rgb(999, 1, 1)')).toBe('');
  expect(readRichText(RICH_TEXT_PREFIX + 'invalid')).toBeNull();
});
