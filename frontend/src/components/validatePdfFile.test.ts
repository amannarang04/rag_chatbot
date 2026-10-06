import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_BYTES } from '../constants'
import { validatePdfFile } from './validatePdfFile'

describe('validatePdfFile', () => {
  it.each(['paper.pdf', 'paper.PDF'])('accepts %s', (name) => {
    expect(validatePdfFile(new File(['pdf'], name))).toEqual({ ok: true })
  })

  it('rejects a non-PDF extension', () => {
    expect(validatePdfFile(new File(['text'], 'notes.txt'))).toEqual({
      ok: false,
      reason: 'Choose a PDF file with a .pdf extension.',
    })
  })

  it('rejects an empty PDF', () => {
    expect(validatePdfFile(new File([], 'empty.pdf'))).toEqual({ ok: false, reason: 'This file is empty.' })
  })

  it('rejects files over the limit', () => {
    const file = new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], 'large.pdf')
    expect(validatePdfFile(file)).toEqual({ ok: false, reason: 'This file is larger than the 20 MB limit.' })
  })

  it('accepts a file exactly at the size limit', () => {
    const file = new File([new Uint8Array(MAX_UPLOAD_BYTES)], 'limit.pdf')
    expect(validatePdfFile(file)).toEqual({ ok: true })
  })
})
