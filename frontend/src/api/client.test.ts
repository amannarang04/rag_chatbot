import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, NetworkError, parseApiError, RequestAbortedError, RequestTimeoutError, InvalidResponseError } from './client'

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

describe('API request failures', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('turns a timed out fetch into RequestTimeoutError', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }),
    ))

    const request = api.listDocuments()
    const rejection = expect(request).rejects.toBeInstanceOf(RequestTimeoutError)
    await vi.advanceTimersByTimeAsync(180_000)
    await rejection
  })

  it('turns a user abort into RequestAbortedError', async () => {
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
      }),
    ))

    const controller = new AbortController()
    const request = api.listDocuments(controller.signal)
    controller.abort()
    await expect(request).rejects.toBeInstanceOf(RequestAbortedError)
  })

  it('turns a rejected fetch into NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))))
    await expect(api.listDocuments()).rejects.toBeInstanceOf(NetworkError)
  })

  it('rejects a successful HTML response as InvalidResponseError', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('<html>proxy error</html>', { status: 200 }))))
    await expect(api.listDocuments()).rejects.toBeInstanceOf(InvalidResponseError)
  })

  it('rejects a JSON response that does not match the expected shape', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ results: [{ text: 'x' }] }), { status: 200 }))))
    await expect(api.searchDocuments({ query: 'x' })).rejects.toBeInstanceOf(InvalidResponseError)
  })
})
