import { Fragment } from 'react';
import { readRichText } from '../lib/richText';

function renderNode(node, key) {
  if (node.type === 'text') {
    let content = node.text;
    (node.marks || []).forEach((mark, index) => {
      if (mark.type === 'bold') content = <strong key={index}>{content}</strong>;
      if (mark.type === 'italic') content = <em key={index}>{content}</em>;
      if (mark.type === 'textStyle') content = <span key={index} style={{ color: mark.attrs.color }}>{content}</span>;
    });
    return <Fragment key={key}>{content}</Fragment>;
  }
  if (node.type === 'hardBreak') return <br key={key} />;
  const children = (node.content || []).map((child, index) => renderNode(child, index));
  if (node.type === 'doc') return children;
  if (node.type === 'paragraph') return <span className="rich-paragraph" key={key}>{children.length ? children : <br />}</span>;
  if (node.type === 'listItem') return <span className="rich-list-item" role="listitem" key={key}>{children}</span>;
  return <span className={`rich-list ${node.type === 'orderedList' ? 'rich-list-ordered' : ''}`} role="list" style={node.type === 'orderedList' ? { counterReset: `rich-item ${(node.attrs?.start || 1) - 1}` } : undefined} key={key}>{children}</span>;
}

export default function RichText({ value = '' }) {
  const doc = readRichText(value);
  return <span className="rich-text">{doc ? renderNode(doc, 'doc') : String(value || '')}</span>;
}
