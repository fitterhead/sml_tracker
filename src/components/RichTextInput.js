import { forwardRef, lazy, Suspense } from 'react';

// Load the editor engine only when an editable field is opened.
const Editor = lazy(() => import('./RichTextEditor'));
export default forwardRef(function RichTextInput(props, ref) {
  return <Suspense fallback={<div className="rich-editor-loading" role="status">Loading editor…</div>}><Editor {...props} ref={ref} /></Suspense>;
});
