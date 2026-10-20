import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCardLogPrompt, buildLogPreview, parseCardLog } from '../lib/cardLog';
import { richTextToPlainText } from '../lib/richText';
import { useBoardStore } from '../store/useBoardStore';

export default function CardLogModal({ onClose }) {
  const cards = useBoardStore((state) => state.cards);
  const workspaceId = useBoardStore((state) => state.activeWorkspaceId);
  const workspace = useBoardStore((state) => state.workspaces.find((item) => item.id === state.activeWorkspaceId));
  const applyCardLog = useBoardStore((state) => state.applyCardLog);
  const [input, setInput] = useState('');
  const [log, setLog] = useState(null);
  const [choices, setChoices] = useState({});
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [copyStatus, setCopyStatus] = useState('Copy prompt');
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  const reviewRef = useRef(null);
  const resultRef = useRef(null);
  const preview = useMemo(() => log ? buildLogPreview(log, cards, choices) : [], [log, cards, choices]);
  const readyCount = preview.filter((row) => row.cardId && row.changes.length).length;
  const prompt = useMemo(() => buildCardLogPrompt(cards, workspace?.name || 'Workspace'), [cards, workspace?.name]);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; previous?.focus?.(); };
  }, []);
  useEffect(() => { if (log) reviewRef.current?.focus(); }, [log]);
  useEffect(() => { if (result) resultRef.current?.focus(); }, [result]);
  useEffect(() => { setLog(null); setChoices({}); setResult(''); }, [workspaceId]);

  const review = () => {
    setError(''); setResult('');
    try { setLog(parseCardLog(input)); setChoices({}); }
    catch (issue) { setError(issue.message); setLog(null); }
  };
  const apply = () => {
    try {
      const count = applyCardLog(log, Object.fromEntries(preview.map((row) => [row.index, row.cardId])));
      setResult(`${count} update${count === 1 ? '' : 's'} applied. Your board will save automatically.`);
      setLog(null);
    } catch (issue) { setError(issue.message); }
  };
  const keyDown = (event) => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    if (event.key !== 'Tab') return;
    const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), textarea, select, input')].filter((el) => el.getClientRects().length);
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  return (
    <div className="focus-backdrop log-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="log-modal" role="dialog" aria-modal="true" aria-labelledby="log-title" ref={dialogRef} onKeyDown={keyDown}>
        <div className="log-heading">
          <div><p className="eyebrow">Email & meeting updates</p><h2 id="log-title">Paste update log</h2></div>
          <button className="close-button" ref={closeRef} onClick={onClose}>Close</button>
        </div>
        <p className="log-intro">Turn a ChatGPT summary into card updates in <strong>{workspace?.name}</strong>. Review matches, fill empty fields, and add notes or tasks.</p>
        <div className="log-steps" aria-label="Import steps"><span>1 · Copy prompt to ChatGPT</span><span>2 · Paste its log</span><span>3 · Review & apply</span></div>
        <div className="log-help">
          <p>The prompt includes this workspace’s card names, IDs and task titles to help ChatGPT match your updates.</p>
          <div className="log-buttons">
            <button className="secondary-button" onClick={async () => {
              try { await navigator.clipboard.writeText(prompt); setCopyStatus('Copied'); }
              catch { setShowPrompt(true); setCopyStatus('Select and copy below'); }
            }}>{copyStatus}</button>
            <button className="ghost-button" aria-expanded={showPrompt} onClick={() => setShowPrompt(!showPrompt)}>{showPrompt ? 'Hide prompt' : 'View prompt'}</button>
          </div>
          {showPrompt && <label className="field"><span>Prompt for ChatGPT</span><textarea className="log-prompt" readOnly value={prompt} onFocus={(event) => event.currentTarget.select()} /></label>}
        </div>
        <label className="field log-input"><span>Update log from ChatGPT</span><textarea value={input} onChange={(event) => { setInput(event.target.value); setLog(null); setResult(''); setError(''); }} placeholder={'Paste the JSON log here…'} spellCheck={false} /></label>
        {error && <p role="alert" className="log-error">{error}</p>}
        {result && <p role="status" tabIndex={-1} ref={resultRef} className="log-success">{result}</p>}
        {log && <div className="log-review">
          <h3 tabIndex={-1} ref={reviewRef}>Review {log.updates.length} update{log.updates.length === 1 ? '' : 's'}</h3>
          <p className="log-source">Source: {log.source}</p>
          {preview.map((row) => <article className="log-update" key={row.index}>
            <label className="field"><span>Update {row.index + 1} · {row.entry.match.project || row.entry.match.client || row.entry.match.cardId}</span>
              <select aria-label={`Card for update ${row.index + 1}`} value={row.cardId} onChange={(event) => setChoices((current) => ({ ...current, [row.index]: event.target.value }))}>
                <option value="">Skip / choose a card</option>
                {cards.map((card) => <option key={card.id} value={card.id}>{richTextToPlainText(card.taskName) || 'Untitled project'} · {richTextToPlainText(card.jobName) || 'No client'} · {card.id.slice(-6)}</option>)}
              </select>
            </label>
            {row.warnings.map((warning) => <p className="log-warning" key={warning}>{warning}</p>)}
            {row.cardId && !row.changes.length && <p className="log-muted">Nothing new to add. Existing information is kept.</p>}
            <ul>{row.changes.map((change, index) => <li key={index}><strong>{change.label}</strong><span>{change.text}</span></li>)}</ul>
          </article>)}
        </div>}
        <div className="log-footer">
          <span>Existing fields stay unchanged. Unmatched updates are skipped.</span>
          {log ? <button className="primary-button" disabled={!readyCount} onClick={apply}>Apply {readyCount} update{readyCount === 1 ? '' : 's'}</button> : <button className="primary-button" disabled={!input.trim()} onClick={review}>Review matches</button>}
        </div>
      </section>
    </div>
  );
}
