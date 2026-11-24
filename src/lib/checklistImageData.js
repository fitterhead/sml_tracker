const CHECKLIST_IMAGE_MAX_LENGTH = 12 * 1024;
const checklistImagePattern = /^data:image\/(?:webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

function normalizeChecklistImage(value) {
  return typeof value === 'string' &&
    value.length <= CHECKLIST_IMAGE_MAX_LENGTH &&
    checklistImagePattern.test(value)
    ? value
    : '';
}

module.exports = { normalizeChecklistImage };
