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

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    const message = typeof detail === 'string' ? detail : JSON.stringify(detail)
    super(message || `Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function endpoint(path: string): string {
  if (!baseUrl) {
    throw new Error('Set VITE_API_BASE_URL in frontend/.env before making API requests.')
  }
  return `${baseUrl}${path}`
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(endpoint(path), init)
  const payload: unknown = await response.json().catch(() => undefined)

  if (!response.ok) {
    const detail =
      typeof payload === 'object' && payload !== null && 'detail' in payload
        ? payload.detail
        : payload
    throw new ApiError(response.status, detail)
  }

  return payload as T
}

export const api = {
  uploadDocument(file: File, signal?: AbortSignal): Promise<UploadResponse> {
    const body = new FormData()
    body.append('file', file)
    return request<UploadResponse>('/documents/upload', { method: 'POST', body, signal })
  },

  listDocuments(signal?: AbortSignal): Promise<DocumentRecord[]> {
    return request<DocumentRecord[]>('/documents', { signal })
  },

  searchDocuments(input: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
    return request<SearchResponse>('/documents/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    })
  },

  research(input: ResearchRequest, signal?: AbortSignal): Promise<ResearchResponse> {
    return request<ResearchResponse>('/research/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    })
  },
}
