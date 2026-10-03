import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { api, ApiError, NetworkError, RequestAbortedError, RequestTimeoutError } from '../api/client'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_SIZE_LABEL } from '../constants'

function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 400) return error.message || 'The backend rejected this PDF.'
    if (error.status === 413) return `This PDF exceeds the ${MAX_UPLOAD_SIZE_LABEL} upload limit.`
    if (error.status === 422) return `The upload request was invalid. ${error.message}`
    return error.message || `Upload failed with status ${error.status}.`
  }
  if (error instanceof RequestTimeoutError) return 'The upload timed out. Please try again.'
  if (error instanceof RequestAbortedError) return 'The upload was cancelled.'
  if (error instanceof NetworkError) return 'Network error: unable to reach the backend. Check that it is running.'
  return 'The upload could not be completed.'
}

export default function UploadPanel() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  async function upload(file: File) {
    setStatus('')
    setError('')
    setProgress(null)

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF file with a .pdf extension.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`This file is larger than the ${MAX_UPLOAD_SIZE_LABEL} limit.`)
      return
    }

    setBusy(true)
    try {
      const result = await api.uploadDocument(file, undefined, setProgress)
      if (result.duplicate) {
        setStatus(`This document was already uploaded as ${result.filename}.`)
      } else {
        setStatus(`Uploaded ${result.filename}; ${result.chunks_added} ${result.chunks_added === 1 ? 'chunk' : 'chunks'} added.`)
      }
    } catch (uploadError) {
      setError(uploadErrorMessage(uploadError))
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) void upload(file)
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
    setDragging(false)
    const file = event.dataTransfer.files[0]
    if (file) void upload(file)
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
        onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { event.preventDefault(); setDragging(false) }}
        onDrop={onDrop}
        className={`block cursor-pointer rounded-2xl border-2 border-dashed p-7 text-center transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-amber-300 focus-within:ring-offset-2 focus-within:ring-offset-stone-900 sm:p-10 ${dragging ? 'border-amber-300 bg-amber-300/10' : 'border-stone-600 bg-stone-950/50 hover:border-stone-400'}`}
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
          accept=".pdf,application/pdf"
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
        </div>
      )}

      <p id="upload-status" role="status" aria-live="polite" className="mt-4 min-h-6 text-sm font-medium text-emerald-300">
        {status}
      </p>
      <p id="upload-error" role="alert" aria-live="assertive" className="mt-1 min-h-6 text-sm text-rose-300">
        {error}
      </p>
    </section>
  )
}
