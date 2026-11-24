import { normalizeChecklistImage } from './checklistImageData';

export default async function resizeChecklistImage(file) {
  if (file.type && !file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }
  if (file.size > 20 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 20 MB.');
  }

  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('Image compression is unavailable.');
    }

    const supportsWebp = canvas.toDataURL('image/webp').startsWith('data:image/webp;');
    const type = supportsWebp ? 'image/webp' : 'image/jpeg';
    for (const maxSide of [320, 256, 192, 128, 96]) {
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.54, 0.4, 0.28]) {
        const thumbnail = normalizeChecklistImage(canvas.toDataURL(type, quality));
        if (thumbnail) {
          return thumbnail;
        }
      }
    }
    throw new Error('This image could not be compressed.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
