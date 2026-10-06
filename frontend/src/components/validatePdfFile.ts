import { MAX_UPLOAD_BYTES, MAX_UPLOAD_SIZE_LABEL } from '../constants'

export type PdfFileValidation = { ok: true } | { ok: false; reason: string }

export function validatePdfFile(file: File): PdfFileValidation {
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    return { ok: false, reason: 'Choose a PDF file with a .pdf extension.' }
  }
  if (file.size === 0) {
    return { ok: false, reason: 'This file is empty.' }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `This file is larger than the ${MAX_UPLOAD_SIZE_LABEL} limit.` }
  }
  return { ok: true }
}
