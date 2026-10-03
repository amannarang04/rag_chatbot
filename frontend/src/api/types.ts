/** A new upload returns duplicate=false. A content duplicate returns the original
 * filename and ID, duplicate=true, and chunks_added=0. */
export type UploadResponse = {
  filename: string
  chunks_added: number
  document_id: string
  duplicate: boolean
}

export type DocumentRecord = {
  document_id: string
  filename: string
  chunks: number
  uploaded_at: string
}

export type SearchResult = {
  text: string
  source_filename: string
  chunk_index: number
  document_id: string
  distance: number
}

export type SearchResponse = {
  results: SearchResult[]
}

export type ResearchResponse = {
  report: string
  faithfulness_score: number
  flagged_claims: string[]
  agent_trace: string[]
  retries: number
  claims_checked: number
}

export type SearchRequest = {
  query: string
  top_k?: number
}

export type ResearchRequest = {
  question: string
}
