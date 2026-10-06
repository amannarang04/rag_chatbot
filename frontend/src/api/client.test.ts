import { describe, expect, it } from 'vitest'
import { parseApiError } from './client'

describe('API error parsing', () => {
  it('turns FastAPI validation details into a readable message', () => {
    const error = parseApiError(
      422,
      JSON.stringify({
        detail: [
          { loc: ['body', 'file'], msg: 'Field required', type: 'missing' },
          { loc: ['body', 'query'], msg: 'String should have at least 1 character', type: 'string_too_short' },
        ],
      }),
    )

    expect(error.message).toBe('file: Field required; query: String should have at least 1 character')
    expect(error.status).toBe(422)
  })

  it('keeps 5xx technical details separate from the generic user message', () => {
    const error = parseApiError(500, 'Internal Server Error')
    expect(error.message).toBe('The server ran into an error. Please try again.')
    expect(error.technicalDetail).toBe('Internal Server Error')
    expect(error.status).toBe(500)
  })

  it('keeps non-5xx API details readable', () => {
    const error = parseApiError(413, 'Payload Too Large')
    expect(error.message).toBe('Payload Too Large')
    expect(error.status).toBe(413)
  })
})
