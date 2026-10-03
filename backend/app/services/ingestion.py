from io import BytesIO
from uuid import uuid4

from fastapi import UploadFile
from pypdf import PdfReader
from pypdf.errors import PdfReadError

CHUNK_SIZE_WORDS = 500
CHUNK_OVERLAP_WORDS = 100


def chunk_text(text: str, source_filename: str) -> list[dict[str, str | int]]:
    words = text.split()
    if not words:
        return []

    stride = CHUNK_SIZE_WORDS - CHUNK_OVERLAP_WORDS
    chunks: list[dict[str, str | int]] = []
    for chunk_index, start in enumerate(range(0, len(words), stride)):
        chunk_words = words[start : start + CHUNK_SIZE_WORDS]
        if not chunk_words:
            break
        chunks.append(
            {
                "chunk_id": str(uuid4()),
                "text": " ".join(chunk_words),
                "source_filename": source_filename,
                "chunk_index": chunk_index,
            }
        )
        if start + CHUNK_SIZE_WORDS >= len(words):
            break
    return chunks


class UploadTooLargeError(Exception):
    pass


async def extract_pdf_chunks(
    file: UploadFile, max_bytes: int | None = None
) -> list[dict[str, str | int]]:
    filename = file.filename or "uploaded.pdf"
    if not filename.lower().endswith(".pdf"):
        raise ValueError("Please upload a PDF file.")

    contents = bytearray()
    while block := await file.read(64 * 1024):
        contents.extend(block)
        if max_bytes is not None and len(contents) > max_bytes:
            raise UploadTooLargeError
    if not contents:
        raise ValueError("The uploaded PDF is empty.")

    try:
        reader = PdfReader(BytesIO(bytes(contents)))
        if reader.is_encrypted:
            try:
                if not reader.decrypt(""):
                    raise ValueError("The uploaded PDF is password-protected.")
            except PdfReadError as exc:
                raise ValueError("The uploaded PDF is password-protected.") from exc

        page_text = [page.extract_text() or "" for page in reader.pages]
    except PdfReadError as exc:
        raise ValueError("The uploaded file is not a valid PDF.") from exc

    text = "\n".join(page_text).strip()
    if not text:
        raise ValueError("The PDF contains no extractable text.")

    return chunk_text(text, filename)
