import { useEffect, useRef, useState } from 'react';
import resizeChecklistImage from '../lib/resizeChecklistImage';

export function ChecklistImage({ image }) {
  const [visibleImage, setVisibleImage] = useState('');
  const open = visibleImage === image;

  if (!image) {
    return null;
  }

  return (
    <div
      className="checklist-image"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="text-see-more"
        aria-expanded={open}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisibleImage(open ? '' : image)}
      >
        {open ? 'Hide image' : 'View image'}
      </button>
      {open && <img src={image} alt="Checklist attachment" />}
    </div>
  );
}

export function ChecklistImageInput({ image, onChange, onBusyChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preparedImage, setPreparedImage] = useState('');
  const fileInput = useRef(null);
  const active = useRef(false);
  const busyCallback = useRef(onBusyChange);
  busyCallback.current = onBusyChange;
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      busyCallback.current?.(false);
    };
  }, []);

  const pickImage = async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setError('');
    setPreparedImage('');
    setBusy(true);
    onBusyChange?.(true);
    try {
      const thumbnail = await resizeChecklistImage(file);
      if (active.current) {
        onChange(thumbnail);
        setPreparedImage(thumbnail);
      }
    } catch {
      if (active.current) {
        setError('Could not prepare the image. Try a JPG, PNG or WebP under 20 MB.');
      }
    } finally {
      if (active.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };

  return (
    <div
      className="checklist-image-input"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        disabled={busy}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => fileInput.current?.click()}
      >
        {image ? 'Replace image' : 'Attach image'}
      </button>
      <input ref={fileInput} type="file" accept="image/*" aria-label="Choose checklist image" hidden onChange={pickImage} />
      {image && (
        <button type="button" disabled={busy} onMouseDown={(event) => event.preventDefault()} onClick={() => onChange('')}>
          Remove image
        </button>
      )}
      {busy && (
        <div className="checklist-image-status" role="status">
          <div>Compressing image…</div>
          <progress aria-label="Compressing image" />
        </div>
      )}
      {!busy && preparedImage && preparedImage === image && (
        <div className="checklist-image-status" role="status">
          Image ready. Save the checklist item to keep it.
        </div>
      )}
      {error && <div className="checklist-image-status" role="alert">{error}</div>}
    </div>
  );
}
