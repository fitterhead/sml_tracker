import { buildCardLogPrompt, buildLogPreview, findLogMatches, parseCardLog, LOG_SCHEMA } from './cardLog';
const card = { id: 'a', taskName: 'Website', jobName: 'Acme', assignedPerson: '', startDate: '', lane: 'active', checklist: [{ id: 'task', text: 'Review', state: 'completed', checked: true, context: 'Existing note', contextHistory: [] }] };
const log = (updates) => parseCardLog(JSON.stringify({ schema: LOG_SCHEMA, source: 'Meeting · Oct 20', updates }));

test('accepts a fenced ChatGPT log and rejects invalid dates or unsupported writes', () => {
  expect(parseCardLog('```json\n' + JSON.stringify({ schema: LOG_SCHEMA, source: 'Email', updates: [{ match: { cardId: 'a' }, notes: ['Decision'] }] }) + '\n```').updates).toHaveLength(1);
  expect(() => log([{ match: { cardId: 'a' }, fields: { startDate: '2026-02-30' } }])).toThrow(/real date/);
  expect(() => log([{ match: { cardId: 'a' }, fields: { lane: 'done' } }])).toThrow(/Unsupported field/);
  expect(() => log([{ match: {}, notes: ['Decision'] }])).toThrow(/needs a card/);
});

test('uses exact normalized names, both supplied names, and never guesses an invalid ID', () => {
  const cards = [card, { ...card, id: 'b', jobName: 'Other' }];
  expect(findLogMatches({ project: ' website ', client: 'ACME' }, cards).map((item) => item.id)).toEqual(['a']);
  expect(findLogMatches({ cardId: 'missing', project: 'Website' }, cards)).toEqual([]);
  const [row] = buildLogPreview(log([{ match: { project: 'Website' }, notes: ['Decision'] }]), cards);
  expect(row.cardId).toBe('');
  expect(row.candidates).toHaveLength(2);
});

test('fills only empty fields, keeps completed tasks intact, and retains old context', () => {
  const [row] = buildLogPreview(log([{ match: { cardId: 'a' }, fields: { client: 'New client', assignedPerson: 'Alex' }, tasks: [{ text: 'Review', context: 'New feedback' }], notes: ['Approved direction'] }]), [card]);
  expect(row.patch.assignedPerson).toBe('Alex');
  expect(row.patch.jobName).toBeUndefined();
  expect(row.warnings[0]).toMatch(/kept existing/);
  expect(row.patch.checklist[0]).toMatchObject({ state: 'completed', checked: true, context: 'Existing note', contextHistory: [{ note: 'New feedback' }] });
});

test('repeated notes and tasks across entries are only added once', () => {
  const input = log([1, 2].map(() => ({ match: { cardId: 'a' }, notes: ['Approved'], tasks: [{ text: 'Send artwork', context: 'PDF' }] })));
  const rows = buildLogPreview(input, [card]);
  expect(rows[0].changes).toHaveLength(2);
  expect(rows[1].changes).toHaveLength(0);
});

test('manual selection resolves ambiguity and explicit skip excludes an update', () => {
  const input = log([{ match: { project: 'Website' }, notes: ['Approved'] }]);
  const cards = [card, { ...card, id: 'b' }];
  expect(buildLogPreview(input, cards, { 0: 'b' })[0].cardId).toBe('b');
  expect(buildLogPreview(input, cards, { 0: '' })[0].changes).toHaveLength(0);
});

test('only new tasks reopen completed cards', () => {
  const input = log([{ match: { cardId: 'a' }, notes: ['Client replied'] }]);
  expect(buildLogPreview(input, [{ ...card, lane: 'done' }])[0].patch.lane).toBeUndefined();
  const tasks = log([{ match: { cardId: 'a' }, tasks: [{ text: 'Send artwork' }] }]);
  expect(buildLogPreview(tasks, [{ ...card, lane: 'done' }])[0].patch).toMatchObject({ lane: 'active', completedAt: '' });
});

test('prompt includes stable IDs and the card index without context history', () => {
  const prompt = buildCardLogPrompt([card], 'Main');
  expect(prompt).toContain('"cardId": "a"');
  expect(prompt).toContain(LOG_SCHEMA);
  expect(prompt).not.toContain('Existing note');
});

test('formatted card and task names still match plain ChatGPT logs', () => {
  const { serializeRichText } = require('./richText');
  const format = (text) => serializeRichText({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] }] });
  const formattedCard = { ...card, taskName: format(card.taskName), jobName: format(card.jobName), checklist: card.checklist.map((item) => ({ ...item, text: format(item.text) })) };
  const input = log([{ match: { project: 'Website', client: 'Acme' }, tasks: [{ text: 'Review', context: 'Latest feedback' }] }]);
  const row = buildLogPreview(input, [formattedCard])[0];
  expect(row.cardId).toBe('a');
  expect(row.patch.checklist).toHaveLength(1);
  expect(buildCardLogPrompt([formattedCard], 'Main')).not.toContain('sml-richtext');
});
