import type {
  DocumentRecord,
  ResearchRequest,
  ResearchResponse,
  SearchRequest,
  SearchResponse,
  UploadResponse,
} from './types'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const baseUrl = configuredBaseUrl?.replace(/\/+$/, '')
const REQUEST_TIMEOUT_MS = 180_000

type ValidationIssue = {
  loc?: unknown
  msg?: unknown
  type?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function formatApiErrorDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail.trim()
  if (Array.isArray(detail)) {
    const issues = detail.flatMap((item) => {
      if (!isRecord(item)) return []
      const issue = item as ValidationIssue
      if (typeof issue.msg !== 'string') return []
      const location = Array.isArray(issue.loc)
        ? issue.loc.filter((part) => part !== 'body').map(String).join('.')
        : ''
      return [location ? `${location}: ${issue.msg}` : issue.msg]
    })
    if (issues.length > 0) return issues.join('; ')
  }
  if (detail === undefined || detail === null || detail === '') return ''
  try {
    return JSON.stringify(detail)
  } catch {
    return 'The server returned an unreadable error.'
  }
}

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(formatApiErrorDetail(detail) || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export function parseApiError(status: number, rawBody: string): ApiError {
  let payload: unknown = rawBody
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as unknown
    } catch {
      payload = rawBody
    }
  }
  const detail = isRecord(payload) && 'detail' in payload ? payload.detail : payload
  return new ApiError(status, detail)
}

export class NetworkError extends Error {
  constructor(message = 'Unable to reach the server.') {
    super(message)
    this.name = 'NetworkError'
  }
}

export class RequestTimeoutError extends Error {
  constructor() {
    super('The request timed out.')
    this.name = 'RequestTimeoutError'
  }
}

export class RequestAbortedError extends Error {
  constructor() {
    super('The request was cancelled.')
    this.name = 'RequestAbortedError'
  }
}

function endpoint(path: string): string {
  if (!baseUrl) {
    throw new Error('Set VITE_API_BASE_URL in frontend/.env before making API requests.')
  }
  return `${baseUrl}${path}`
}

async function readFetchResponse<T>(response: Response): Promise<T> {
  const rawBody = await response.text()
  let payload: unknown = rawBody
  if (rawBody) {
    try {
      payload = JSON.parse(rawBody) as unknown
    } catch {
      payload = rawBody
    }
  }

  if (!response.ok) {
    throw parseApiError(response.status, rawBody)
  }

  return payload as T
}

async function request<T>(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const timeout = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, REQUEST_TIMEOUT_MS)
  const forwardAbort = () => controller.abort()
  if (signal?.aborted) controller.abort()
  else signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    const response = await fetch(endpoint(path), { ...init, signal: controller.signal })
    return await readFetchResponse<T>(response)
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (timedOut) throw new RequestTimeoutError()
    if (signal?.aborted) throw new RequestAbortedError()
    throw new NetworkError(error instanceof Error ? error.message : undefined)
  } finally {
    globalThis.clearTimeout(timeout)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

function uploadWithProgress(
  file: File,
  signal: AbortSignal | undefined,
  onProgress: ((percent: number) => void) | undefined,
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new RequestAbortedError())
      return
    }

    const xhr = new XMLHttpRequest()
    let timedOut = false
    const abortUpload = () => xhr.abort()
    xhr.open('POST', endpoint('/documents/upload'))
    xhr.timeout = REQUEST_TIMEOUT_MS
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      let payload: unknown = xhr.responseText
      if (xhr.responseText) {
        try {
          payload = JSON.parse(xhr.responseText) as unknown
        } catch {
          payload = xhr.responseText
        }
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(parseApiError(xhr.status, xhr.responseText))
        return
      }
      resolve(payload as UploadResponse)
    }
    xhr.onerror = () => reject(new NetworkError())
    xhr.ontimeout = () => {
      timedOut = true
      reject(new RequestTimeoutError())
    }
    xhr.onabort = () => reject(timedOut ? new RequestTimeoutError() : new RequestAbortedError())
    signal?.addEventListener('abort', abortUpload, { once: true })
    xhr.onloadend = () => signal?.removeEventListener('abort', abortUpload)

    const body = new FormData()
    body.append('file', file)
    // Leave Content-Type unset so the browser adds the multipart boundary.
    xhr.send(body)
  })
}

export const api = {
  uploadDocument(
    file: File,
    signal?: AbortSignal,
    onProgress?: (percent: number) => void,
  ): Promise<UploadResponse> {
    return uploadWithProgress(file, signal, onProgress)
  },

  listDocuments(signal?: AbortSignal): Promise<DocumentRecord[]> {
    return request<DocumentRecord[]>('/documents', {}, signal)
  },

  searchDocuments(input: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    return request(
      '/documents/search',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      signal,
    )
  },

  research(input: ResearchRequest, signal?: AbortSignal): Promise<ResearchResponse> {
    return request(
      '/research/query',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      signal,
    )
  },
}
