from typing import Any
import os
import hashlib
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.services.embeddings import embed_texts
from app.services.ingestion import UploadTooLargeError, extract_pdf_chunks
from app.services.vector_store import vector_store

router = APIRouter(prefix="/documents", tags=["documents"])
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))


def _upload_limit_label() -> str:
    if MAX_UPLOAD_BYTES % (1024 * 1024) == 0:
        return f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB"
    return f"{MAX_UPLOAD_BYTES} bytes"


class DocumentSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    top_k: int = Field(default=5, ge=1, le=100)


@router.post("/upload")
async def upload_document(file: UploadFile = File(...)) -> dict[str, Any]:
    filename = file.filename or "uploaded.pdf"
    if not filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")
    if file.size is not None and file.size > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"PDF exceeds the {_upload_limit_label()} upload limit.")
    digest_builder = hashlib.sha256()
    bytes_read = 0
    while block := await file.read(64 * 1024):
        bytes_read += len(block)
        if bytes_read > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"PDF exceeds the {_upload_limit_label()} upload limit.")
        digest_builder.update(block)
    await file.seek(0)
    digest = digest_builder.hexdigest()
    existing = vector_store.get_document_by_digest(digest)
    if existing is not None:
        return {
            "filename": existing["filename"],
            "chunks_added": 0,
            "document_id": existing["document_id"],
            "duplicate": True,
        }
    try:
        chunks = await extract_pdf_chunks(file, MAX_UPLOAD_BYTES)
    except UploadTooLargeError as exc:
        raise HTTPException(status_code=413, detail=f"PDF exceeds the {_upload_limit_label()} upload limit.") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    document_id = str(uuid4())
    embeddings = embed_texts([chunk["text"] for chunk in chunks])
    document, duplicate = vector_store.add_document(document_id, filename, digest, chunks, embeddings)
    return {
        "filename": document["filename"],
        "chunks_added": 0 if duplicate else len(chunks),
        "document_id": document["document_id"],
        "duplicate": duplicate,
    }


@router.get("")
def list_documents() -> list[dict[str, Any]]:
    return vector_store.list_documents()


@router.post("/search")
def search_documents(request: DocumentSearchRequest) -> dict[str, list[dict[str, Any]]]:
    query_embedding = embed_texts([request.query])
    results = vector_store.search(query_embedding[0], request.top_k)
    return {"results": results}
