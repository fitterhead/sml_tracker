import { useState } from 'react';
import RichText from './RichText';
import { richTextToPlainText } from '../lib/richText';

// Keep stored rich text intact; only shorten its presentation.
export default function ExpandableText({ value = '', onEdit, className = '' }) {
  const [expandedValue, setExpandedValue] = useState(null);
  const text = richTextToPlainText(value);
  const long = text.length > 180 || text.split('\n').length > 3;
  const expanded = expandedValue === value;
  const content = <RichText value={value} />;
  return <span className="expandable-text">
    {onEdit ? <button type="button" className={`${className} expandable-copy ${long && !expanded ? 'is-collapsed' : ''}`} onClick={onEdit}>{content}</button>
      : <span className={`expandable-copy ${long && !expanded ? 'is-collapsed' : ''}`}>{content}</span>}
    {long && <button type="button" className="text-see-more" aria-expanded={expanded} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setExpandedValue(expanded ? null : value); }}>{expanded ? 'See less' : '… See more'}</button>}
  </span>;
}
