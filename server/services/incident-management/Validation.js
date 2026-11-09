const { httpError } = require('../../utils/HttpError');
const { isValidDate } = require('../../../shared/DateUtils');

const MAX_EVIDENCE_FILES = 10;
const MAX_EVIDENCE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_EVIDENCE_TOTAL_BYTES = 18 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 256 * 1024;
const ALLOWED_EVIDENCE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/rtf',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'audio/mpeg',
  'audio/wav',
  'video/mp4',
  'video/quicktime'
]);

function normalizeText(value, label, maxLength, required = true) {
  if (typeof value !== 'string') {
    if (!required && (value === undefined || value === null)) return '';
    throw httpError(`${label} is required.`, 400);
  }
  const clean = value.trim().replace(/[<>]/g, '');
  if (!clean && required) throw httpError(`${label} is required.`, 400);
  if (clean.length > maxLength)
    throw httpError(`${label} must be ${maxLength} characters or fewer.`, 400);
  return clean;
}

function normalizeDate(value, label) {
  if (!isValidDate(value)) throw httpError(`Enter a valid ${label}.`, 400);
  return value;
}

function normalizeTime(value) {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw httpError('Enter a valid incident time.', 400);
  }
  return `${value}:00`;
}

function normalizeSignature(value) {
  if (typeof value !== 'string') throw httpError('Draw your signature.', 400);
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw httpError('The signature image is invalid.', 400);
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > MAX_SIGNATURE_BYTES) {
    throw httpError('The signature image is too large.', 400);
  }
  return value;
}

function normalizeEvidence(files = []) {
  if (!Array.isArray(files) || files.length > MAX_EVIDENCE_FILES) {
    throw httpError(`Attach no more than ${MAX_EVIDENCE_FILES} files.`, 400);
  }
  let totalBytes = 0;
  return files.map((file) => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) {
      throw httpError('An attached file is invalid.', 400);
    }
    const mimeType = String(file.mimeType || '').toLowerCase();
    if (!ALLOWED_EVIDENCE_TYPES.has(mimeType)) {
      throw httpError(
        'One or more evidence file types are not supported.',
        400
      );
    }
    const fileName = String(file.fileName || '')
      .replace(/[\\/]/g, '_')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 191);
    if (!fileName) throw httpError('An attached file needs a file name.', 400);
    const match = new RegExp(
      `^data:${mimeType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};base64,([A-Za-z0-9+/]+={0,2})$`
    ).exec(String(file.dataUrl || ''));
    if (!match) throw httpError('An attached evidence file is invalid.', 400);
    const fileData = Buffer.from(match[1], 'base64');
    if (!fileData.length || fileData.length > MAX_EVIDENCE_FILE_BYTES) {
      throw httpError('Each evidence file must be 8 MB or smaller.', 400);
    }
    totalBytes += fileData.length;
    if (totalBytes > MAX_EVIDENCE_TOTAL_BYTES) {
      throw httpError(
        'The combined evidence files must be 18 MB or smaller.',
        400
      );
    }
    return { fileName, mimeType, fileData };
  });
}

module.exports = {
  normalizeText,
  normalizeDate,
  normalizeTime,
  normalizeSignature,
  normalizeEvidence
};
