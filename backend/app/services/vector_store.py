from threading import RLock
from typing import Any
from datetime import datetime, timezone
import faiss
import numpy as np


class VectorStore:
    def __init__(self) -> None:
        self._index: faiss.IndexFlatL2 | None = None
        self._metadata: dict[int, dict[str, Any]] = {}
        self._documents: list[dict[str, Any]] = []
        self._document_ids_by_digest: dict[str, str] = {}
        self._lock = RLock()

    def add_document(
        self,
        document_id: str,
        filename: str,
        digest: str,
        chunks: list[dict[str, Any]],
        embeddings: np.ndarray,
    ) -> tuple[dict[str, Any], bool]:
        vectors = np.ascontiguousarray(embeddings, dtype=np.float32)
        if vectors.ndim != 2 or vectors.shape[0] != len(chunks):
            raise ValueError("Each chunk must have exactly one embedding vector.")
        with self._lock:
            existing_id = self._document_ids_by_digest.get(digest)
            if existing_id is not None:
                existing = next(doc for doc in self._documents if doc["document_id"] == existing_id)
                return dict(existing), True

            old_index = self._index
            if vectors.shape[0] and old_index is not None and vectors.shape[1] != old_index.d:
                raise ValueError("Embedding dimensions do not match the vector index.")

            # Prepare the new FAISS index and metadata off to the side. A failure here
            # leaves the currently searchable index and registry untouched.
            candidate = faiss.clone_index(old_index) if old_index is not None else None
            if vectors.shape[0]:
                if candidate is None:
                    candidate = faiss.IndexFlatL2(vectors.shape[1])
                candidate.add(vectors)

            candidate_metadata = dict(self._metadata)
            first_position = old_index.ntotal if old_index is not None else 0
            for offset, chunk in enumerate(chunks):
                candidate_metadata[first_position + offset] = {
                    "text": chunk["text"],
                    "source_filename": filename,
                    "chunk_index": chunk["chunk_index"],
                    "document_id": document_id,
                }
            document = {
                "document_id": document_id,
                "filename": filename,
                "chunks": len(chunks),
                "uploaded_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
            candidate_documents = [*self._documents, document]
            candidate_digests = {**self._document_ids_by_digest, digest: document_id}

            self._index = candidate
            self._metadata = candidate_metadata
            self._documents = candidate_documents
            self._document_ids_by_digest = candidate_digests
            return dict(document), False

    def list_documents(self) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(document) for document in self._documents]

    def get_document_by_digest(self, digest: str) -> dict[str, Any] | None:
        with self._lock:
            document_id = self._document_ids_by_digest.get(digest)
            if document_id is None:
                return None
            document = next(doc for doc in self._documents if doc["document_id"] == document_id)
            return dict(document)

    def search(self, query_embedding: np.ndarray, top_k: int) -> list[dict[str, Any]]:
        query = np.ascontiguousarray(query_embedding, dtype=np.float32).reshape(1, -1)
        with self._lock:
            if self._index is None or self._index.ntotal == 0:
                return []
            if query.shape[1] != self._index.d:
                raise ValueError("Query embedding dimensions do not match the vector index.")

            distances, positions = self._index.search(query, min(top_k, self._index.ntotal))
            return [
                {**self._metadata[int(position)], "distance": float(distance)}
                for position, distance in zip(positions[0], distances[0])
                if int(position) in self._metadata
            ]


vector_store = VectorStore()
