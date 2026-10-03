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

  it.each([
    [413, 'Payload Too Large'],
    [500, 'Internal Server Error'],
  ])('keeps non-JSON %i response bodies readable', (status, body) => {
    const error = parseApiError(status, body)
    expect(error.message).toBe(body)
    expect(error.status).toBe(status)
  })
})
