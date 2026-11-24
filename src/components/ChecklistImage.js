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
    setBusy(true);
    onBusyChange?.(true);
    try {
      const thumbnail = await resizeChecklistImage(file);
      if (active.current) {
        onChange(thumbnail);
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
      <label className="checklist-image-picker" onMouseDown={(event) => event.preventDefault()}>
        <span>{busy ? 'Preparing image…' : image ? 'Replace image' : 'Attach image'}</span>
        <input type="file" accept="image/*" disabled={busy} onChange={pickImage} />
      </label>
      {image && (
        <button type="button" disabled={busy} onMouseDown={(event) => event.preventDefault()} onClick={() => onChange('')}>
          Remove image
        </button>
      )}
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
