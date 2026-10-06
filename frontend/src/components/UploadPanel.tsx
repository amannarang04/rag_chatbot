import { useEffect, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent } from 'react'
import {
  api,
  ApiError,
  ConfigError,
  InvalidResponseError,
  NetworkError,
  RequestAbortedError,
  RequestTimeoutError,
} from '../api/client'
import { MAX_UPLOAD_SIZE_LABEL } from '../constants'
import { validatePdfFile } from './validatePdfFile'

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return error.message
    if (error.status === 413) return 'File is larger than the server limit'
    if (error.status === 422) return error.message
    return error.message
  }
  if (error instanceof RequestTimeoutError) return 'The upload timed out. Please try again.'
  if (error instanceof RequestAbortedError) return 'Upload cancelled. The server may still finish processing the file.'
  if (error instanceof NetworkError) return 'Cannot reach the server'
  if (error instanceof ConfigError) return 'App is not configured (VITE_API_BASE_URL missing)'
  if (error instanceof InvalidResponseError) return 'The server sent an unexpected response'
  return 'The upload could not be completed.'
}

function hasFileTransfer(dataTransfer: DataTransfer | null): boolean {
  return dataTransfer !== null && Array.from(dataTransfer.types).includes('Files')
}

function preventBrowserFileNavigation(event: DragEvent) {
  if (hasFileTransfer(event.dataTransfer)) event.preventDefault()
}

export default function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [technicalDetails, setTechnicalDetails] = useState('')

  useEffect(() => {
    window.addEventListener('dragover', preventBrowserFileNavigation)
    window.addEventListener('drop', preventBrowserFileNavigation)
    return () => {
      window.removeEventListener('dragover', preventBrowserFileNavigation)
      window.removeEventListener('drop', preventBrowserFileNavigation)
      abortControllerRef.current?.abort()
    }
  }, [])

  async function upload(file: File) {
    if (abortControllerRef.current) return
    setStatus('')
    setError('')
    setTechnicalDetails('')
    setProgress(null)

    const validation = validatePdfFile(file)
    if (!validation.ok) {
      setError(validation.reason)
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    setBusy(true)
    try {
      const result = await api.uploadDocument(file, controller.signal, setProgress)
      if (result.duplicate) {
        setStatus(`This document was already uploaded as ${result.filename}.`)
      } else {
        setStatus(`Uploaded ${result.filename}; ${result.chunks_added} ${result.chunks_added === 1 ? 'chunk' : 'chunks'} added.`)
      }
    } catch (uploadError) {
      setError(uploadErrorMessage(uploadError))
      if (uploadError instanceof ApiError && uploadError.status >= 500) {
        setTechnicalDetails(uploadError.technicalDetail || 'No technical details were provided.')
      }
    } finally {
      if (abortControllerRef.current === controller) abortControllerRef.current = null
      setBusy(false)
      setProgress(null)
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) void upload(file)
  }

  function onDrop(event: ReactDragEvent<HTMLLabelElement>) {
    if (!hasFileTransfer(event.dataTransfer)) return
    event.preventDefault()
    setDragging(false)
    if (busy) return
    if (event.dataTransfer.files.length > 1) {
      setStatus('')
      setError('Drop one PDF at a time')
      return
    }
    const file = event.dataTransfer.files[0]
    if (file) void upload(file)
  }

  function cancelUpload() {
    abortControllerRef.current?.abort()
  }

  function onFileDragEnter(event: ReactDragEvent<HTMLLabelElement>) {
    if (!hasFileTransfer(event.dataTransfer)) return
    event.preventDefault()
    if (!busy) setDragging(true)
  }

  function onFileDragOver(event: ReactDragEvent<HTMLLabelElement>) {
    if (hasFileTransfer(event.dataTransfer)) event.preventDefault()
  }

  function onFileDragLeave(event: ReactDragEvent<HTMLLabelElement>) {
    if (!hasFileTransfer(event.dataTransfer)) return
    event.preventDefault()
    setDragging(false)
  }

  return (
    <section aria-labelledby="upload-heading" className="w-full max-w-3xl rounded-3xl border border-stone-700 bg-stone-900 p-6 text-left shadow-2xl sm:p-9">
      <div className="mb-7">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">Research workspace</p>
        <h1 id="upload-heading" className="text-3xl font-semibold tracking-tight text-stone-50 sm:text-4xl">IntelliResearch</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-stone-300 sm:text-base">Start by adding a research paper. Upload a PDF to make its content searchable.</p>
      </div>

      <label
        htmlFor="pdf-upload"
        aria-disabled={busy}
        onDragEnter={onFileDragEnter}
        onDragOver={onFileDragOver}
        onDragLeave={onFileDragLeave}
        onDrop={onDrop}
        className={`block rounded-2xl border-2 border-dashed p-7 text-center transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-amber-300 focus-within:ring-offset-2 focus-within:ring-offset-stone-900 sm:p-10 ${busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${dragging ? 'border-amber-300 bg-amber-300/10' : 'border-stone-600 bg-stone-950/50 hover:border-stone-400'}`}
      >
        <span aria-hidden="true" className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-stone-800 text-amber-300">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5 5 5M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
          </svg>
        </span>
        <span className="block font-medium text-stone-100">Drop a PDF here or <span className="text-amber-300 underline underline-offset-4">browse files</span></span>
        <span className="mt-2 block text-sm text-stone-400">PDF files up to {MAX_UPLOAD_SIZE_LABEL}</span>
        <input
          ref={inputRef}
          id="pdf-upload"
          name="file"
          type="file"
          accept=".pdf,.PDF,application/pdf"
          onChange={onFileChange}
          disabled={busy}
          aria-describedby="upload-hint upload-status upload-error"
          className="sr-only"
        />
      </label>

      <p id="upload-hint" className="mt-3 text-xs leading-5 text-stone-500">Selecting a file with the keyboard works from the file chooser control.</p>

      {busy && (
        <div className="mt-5" aria-live="polite">
          <div className="mb-2 flex justify-between text-sm text-stone-300">
            <span>{progress === 100 ? 'File sent; backend is processing…' : 'Uploading PDF…'}</span>
            <span>{progress === null ? 'Sending' : `${progress}%`}</span>
          </div>
          <progress
            className="h-2 w-full accent-amber-300"
            value={progress ?? undefined}
            max={100}
            aria-label={progress === null ? 'PDF upload in progress' : `PDF upload ${progress}% complete`}
          />
          <button type="button" onClick={cancelUpload} className="mt-3 rounded-lg border border-stone-500 px-4 py-2 text-sm font-medium text-stone-100 hover:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-300">
            Cancel upload
          </button>
        </div>
      )}

      <p id="upload-status" role="status" aria-live="polite" className="mt-4 min-h-6 text-sm font-medium text-emerald-300">
        {status}
      </p>
      <p id="upload-error" role="alert" aria-live="assertive" className="mt-1 min-h-6 text-sm text-rose-300">
        {error}
      </p>
      {technicalDetails && (
        <details className="mt-2 text-sm text-stone-400">
          <summary className="cursor-pointer">Technical details</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{technicalDetails}</pre>
        </details>
      )}
    </section>
  )
}
