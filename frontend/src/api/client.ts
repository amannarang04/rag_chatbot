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
  readonly technicalDetail: string

  constructor(status: number, detail: unknown) {
    super(status >= 500
      ? 'The server ran into an error. Please try again.'
      : formatApiErrorDetail(detail) || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.technicalDetail = formatApiErrorDetail(detail)
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

export class ConfigError extends Error {
  constructor() {
    super('App is not configured (VITE_API_BASE_URL missing).')
    this.name = 'ConfigError'
  }
}

export class InvalidResponseError extends Error {
  constructor() {
    super('The server sent an unexpected response.')
    this.name = 'InvalidResponseError'
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
    throw new ConfigError()
  }
  return `${baseUrl}${path}`
}

function isUploadResponse(value: unknown): value is UploadResponse {
  return isRecord(value) && typeof value.filename === 'string' &&
    typeof value.chunks_added === 'number' && Number.isInteger(value.chunks_added) && value.chunks_added >= 0 &&
    typeof value.document_id === 'string' && typeof value.duplicate === 'boolean'
}

function isDocumentRecord(value: unknown): value is DocumentRecord {
  return isRecord(value) && typeof value.document_id === 'string' && typeof value.filename === 'string' &&
    typeof value.chunks === 'number' && Number.isInteger(value.chunks) && value.chunks >= 0 &&
    typeof value.uploaded_at === 'string'
}

function isDocumentRecordArray(value: unknown): value is DocumentRecord[] {
  return Array.isArray(value) && value.every(isDocumentRecord)
}

function isSearchResponse(value: unknown): value is SearchResponse {
  return isRecord(value) && Array.isArray(value.results) && value.results.every((item) =>
    isRecord(item) && typeof item.text === 'string' && typeof item.source_filename === 'string' &&
    typeof item.chunk_index === 'number' && Number.isInteger(item.chunk_index) &&
    typeof item.document_id === 'string' && typeof item.distance === 'number',
  )
}

function isResearchResponse(value: unknown): value is ResearchResponse {
  return isRecord(value) && typeof value.report === 'string' &&
    typeof value.faithfulness_score === 'number' && value.faithfulness_score >= 0 && value.faithfulness_score <= 1 &&
    Array.isArray(value.flagged_claims) && value.flagged_claims.every((item) => typeof item === 'string') &&
    Array.isArray(value.agent_trace) && value.agent_trace.every((item) => typeof item === 'string') &&
    typeof value.retries === 'number' && Number.isInteger(value.retries) && value.retries >= 0 &&
    typeof value.claims_checked === 'number' && Number.isInteger(value.claims_checked) && value.claims_checked >= 0
}

async function readFetchResponse<T>(response: Response, guard: (value: unknown) => value is T): Promise<T> {
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

  if (typeof payload === 'string' || !guard(payload)) throw new InvalidResponseError()
  return payload
}

async function request<T>(path: string, guard: (value: unknown) => value is T, init: RequestInit = {}, signal?: AbortSignal): Promise<T> {
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
    return await readFetchResponse(response, guard)
  } catch (error) {
    if (error instanceof ApiError || error instanceof ConfigError || error instanceof InvalidResponseError) throw error
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
      if (typeof payload === 'string' || !isUploadResponse(payload)) {
        reject(new InvalidResponseError())
        return
      }
      resolve(payload)
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
    return request('/documents', isDocumentRecordArray, {}, signal)
  },

  searchDocuments(input: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    return request(
      '/documents/search',
      isSearchResponse,
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
      isResearchResponse,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      },
      signal,
    )
  },
}
