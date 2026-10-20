import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { normalizeTextColor, serializeRichText, toEditorDocument } from '../lib/richText';

const COLORS = ['#111111', '#99422e', '#8a620c', '#315c40', '#2457a6', '#784d9d'];

const RichTextInput = forwardRef(function RichTextInput({ value = '', onChange, onBlur, onFocus, onKeyDown, placeholder = '', autoFocus = false, className = '', rows = 2, 'aria-label': ariaLabel }, forwardedRef) {
  const wrapperRef = useRef(null);
  const callbacks = useRef({ onChange, onKeyDown });
  callbacks.current = { onChange, onKeyDown };
  const lastEmitted = useRef(value);
  const [colorsOpen, setColorsOpen] = useState(false);
  const extensions = useMemo(() => [StarterKit.configure({ heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false, strike: false, link: false, underline: false, trailingNode: false }), TextStyle, Color], []);
  const editor = useEditor({
    extensions,
    content: toEditorDocument(value),
    immediatelyRender: true,
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor: current }) => {
      const next = serializeRichText(current.getJSON());
      lastEmitted.current = next;
      callbacks.current.onChange?.({ target: { value: next }, currentTarget: { value: next } });
    },
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': ariaLabel || placeholder || 'Text', 'data-placeholder': placeholder, class: 'rich-input-surface' },
      handleKeyDown: (view, event) => {
        if (event.isComposing || view.composing || event.keyCode === 229) return false;
        if (event.key === 'Enter' && event.shiftKey) { event.stopPropagation(); return false; }
        if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && (view.state.selection.$from.parent.type.name === 'paragraph') && view.state.selection.$from.depth > 1) {
          event.stopPropagation(); return false;
        }
        callbacks.current.onKeyDown?.(event);
        if (event.defaultPrevented) { event.stopPropagation(); return true; }
        return false;
      },
    },
  });
  const formatting = useEditorState({ editor, selector: ({ editor: current }) => ({
    bold: current?.isActive('bold') || false,
    italic: current?.isActive('italic') || false,
    bulletList: current?.isActive('bulletList') || false,
    orderedList: current?.isActive('orderedList') || false,
    color: normalizeTextColor(current?.getAttributes('textStyle').color || ''),
    empty: current?.isEmpty ?? true,
  }) });
  useImperativeHandle(forwardedRef, () => ({
    focus: () => wrapperRef.current?.querySelector('[contenteditable="true"]')?.focus(),
    blur: () => wrapperRef.current?.querySelector('[contenteditable="true"]')?.blur(),
  }), []);
  useEffect(() => {
    if (editor && value !== lastEmitted.current) {
      lastEmitted.current = value;
      editor.commands.setContent(toEditorDocument(value), { emitUpdate: false });
    }
  }, [editor, value]);


  const command = (run) => { if (editor) run(editor.chain().focus()).run(); };
  const action = (label, content, active, run) => <button type="button" aria-label={label} title={label} aria-pressed={active == null ? undefined : Boolean(active)} onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => command(run)}>{content}</button>;
  return (
    <div data-placeholder={placeholder} data-empty={formatting?.empty ? 'true' : 'false'} className={`rich-editor ${className}`} ref={wrapperRef} style={{ '--editor-rows': rows }} onClick={(event) => event.stopPropagation()} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) { setColorsOpen(false); onBlur?.(event); }
    }} onFocus={onFocus} onKeyDown={(event) => {
      // Handled in ProseMirror so typing, IME, and list shortcuts win first.
      event.stopPropagation();
      if (event.key === 'Escape' && colorsOpen) { event.preventDefault(); setColorsOpen(false); editor?.commands.focus(); }
    }}>
      <div className="rich-toolbar" role="group" aria-label="Text formatting">
        {action('Bold', <b>B</b>, formatting?.bold, (chain) => chain.toggleBold())}
        {action('Italic', <i>I</i>, formatting?.italic, (chain) => chain.toggleItalic())}
        <span className="rich-toolbar-divider" />
        {action('Bullet list', '• List', formatting?.bulletList, (chain) => chain.toggleBulletList())}
        {action('Numbered list', '1. List', formatting?.orderedList, (chain) => chain.toggleOrderedList())}
        <button type="button" aria-label="Text colour" title="Text colour" aria-expanded={colorsOpen} onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => setColorsOpen(!colorsOpen)}><span className="rich-color-icon" style={{ borderColor: formatting?.color || 'currentColor' }}>A</span></button>
        {action('Clear formatting', 'Clear', null, (chain) => chain.unsetAllMarks().clearNodes())}
      </div>
      {colorsOpen && <div className="rich-color-palette" role="group" aria-label="Text colour palette">
        {COLORS.map((color) => <button type="button" key={color} aria-label={`Use ${color}`} aria-pressed={formatting?.color === color} style={{ backgroundColor: color }} onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => { command((chain) => chain.setColor(color)); setColorsOpen(false); }} />)}
        <label className="rich-custom-color">Custom<input type="color" aria-label="Custom text colour" value={formatting?.color || '#111111'} onChange={(event) => command((chain) => chain.setColor(event.target.value))} /></label>
        <button type="button" onPointerDown={(event) => event.preventDefault()} onMouseDown={(event) => event.preventDefault()} onClick={() => { command((chain) => chain.unsetColor()); setColorsOpen(false); }}>Default</button>
      </div>}
      <EditorContent editor={editor} />
      <small className="rich-input-hint">Shift + Enter for a new line</small>
    </div>
  );
});
export default RichTextInput;
