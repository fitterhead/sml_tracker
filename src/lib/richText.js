// Rich content remains a string, so existing persistence and history stay compatible.
export const RICH_TEXT_PREFIX = 'sml-richtext:v1:';
const BLOCKS = new Set(['doc', 'paragraph', 'bulletList', 'orderedList', 'listItem']);

export const normalizeTextColor = (value = '') => {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) return '#' + value.slice(1).split('').map((part) => part + part).join('').toLowerCase();
  const rgb = String(value).match(/^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  return rgb && rgb.slice(1).every((part) => Number(part) <= 255) ? '#' + rgb.slice(1).map((part) => Number(part).toString(16).padStart(2, '0')).join('') : '';
};

const cleanNode = (node, depth = 0) => {
  if (!node || depth > 40) return null;
  if (node.type === 'text') {
    if (typeof node.text !== 'string' || !node.text) return null;
    const marks = (Array.isArray(node.marks) ? node.marks : []).flatMap((mark) => {
      if (mark.type === 'bold' || mark.type === 'italic') return [{ type: mark.type }];
      const color = mark.type === 'textStyle' && normalizeTextColor(mark.attrs?.color);
      return color ? [{ type: 'textStyle', attrs: { color } }] : [];
    });
    return { type: 'text', text: node.text, ...(marks.length ? { marks } : {}) };
  }
  if (node.type === 'hardBreak') return { type: 'hardBreak' };
  if (!BLOCKS.has(node.type)) return null;
  const content = (Array.isArray(node.content) ? node.content : []).map((child) => cleanNode(child, depth + 1)).filter(Boolean);
  const start = Math.max(1, Math.min(999999, Number(node.attrs?.start) || 1));
  return { type: node.type, ...(node.type === 'orderedList' ? { attrs: { start } } : {}), ...(content.length ? { content } : {}) };
};

export function readRichText(value) {
  if (typeof value !== 'string' || !value.startsWith(RICH_TEXT_PREFIX)) return null;
  try {
    const json = JSON.parse(value.slice(RICH_TEXT_PREFIX.length));
    return json.type === 'doc' ? cleanNode(json) : null;
  } catch { return null; }
}

function nodeText(node) {
  if (node.type === 'text') return node.text;
  if (node.type === 'hardBreak') return '\n';
  const content = node.content || [];
  if (node.type === 'bulletList' || node.type === 'orderedList') {
    return content.map((child, index) => `${node.type === 'bulletList' ? '•' : `${(node.attrs?.start || 1) + index}.`} ${nodeText(child)}`).join('\n');
  }
  return content.map(nodeText).join(node.type === 'doc' || node.type === 'listItem' ? '\n' : '');
}

export function richTextToPlainText(value = '') {
  const doc = readRichText(value);
  return doc ? nodeText(doc) : String(value || '');
}

export function toEditorDocument(value = '') {
  return readRichText(value) || { type: 'doc', content: String(value || '').split('\n').map((line) => ({ type: 'paragraph', ...(line ? { content: [{ type: 'text', text: line }] } : {}) })) };
}

export function serializeRichText(document) {
  const doc = cleanNode(document);
  if (!doc) return '';
  const plain = nodeText(doc);
  const hasText = (node) => (node.type === 'text' && node.text.trim()) || (node.content || []).some(hasText);
  if (!hasText(doc)) return '';
  const formatted = (node) => (node.marks || []).length > 0 || node.type === 'bulletList' || node.type === 'orderedList' || (node.content || []).some(formatted);
  return formatted(doc) ? RICH_TEXT_PREFIX + JSON.stringify(doc) : plain;
}
