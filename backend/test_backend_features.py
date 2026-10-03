import asyncio
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import numpy as np

import main
from main import app
from app.routes import documents
from app.services.vector_store import VectorStore


class BackendFeatureTests(unittest.TestCase):
    def test_cors_allows_configured_local_frontend_origin(self) -> None:
        with patch.object(main, "load_embedding_model"), TestClient(app) as client:
            response = client.options(
                "/documents",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "GET",
                },
            )
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:5173")

    def test_upload_rejects_large_file_with_413_before_embedding(self) -> None:
        original_limit = documents.MAX_UPLOAD_BYTES
        documents.MAX_UPLOAD_BYTES = 4
        try:
            with patch.object(main, "load_embedding_model"), TestClient(app) as client, patch.object(documents, "embed_texts") as embed:
                response = client.post(
                    "/documents/upload",
                    files={"file": ("large.pdf", b"12345", "application/pdf")},
                )
            self.assertEqual(response.status_code, 413)
            self.assertEqual(response.json(), {"detail": "PDF exceeds the 4 bytes upload limit."})
            embed.assert_not_called()
        finally:
            documents.MAX_UPLOAD_BYTES = original_limit

    def test_upload_size_limit_is_enforced_during_incremental_read(self) -> None:
        class Stream:
            filename = "large.pdf"
            size = None
            def __init__(self) -> None:
                self.remaining = [b"1234", b"5", b""]
            async def read(self, _size: int) -> bytes:
                return self.remaining.pop(0)

        from app.services.ingestion import UploadTooLargeError, extract_pdf_chunks
        with self.assertRaises(UploadTooLargeError):
            asyncio.run(extract_pdf_chunks(Stream(), 4))  # type: ignore[arg-type]

    def test_document_registry_returns_requested_shape(self) -> None:
        store = VectorStore()
        store.add_document(
            "doc-1", "paper.pdf", "digest-1",
            [{"text": "source", "chunk_index": 0}], np.array([[1.0, 0.0]], dtype=np.float32),
        )
        result = store.list_documents()
        self.assertEqual(len(result), 1)
        self.assertEqual(
            {key: result[0][key] for key in ("document_id", "filename", "chunks")},
            {"document_id": "doc-1", "filename": "paper.pdf", "chunks": 1},
        )
        self.assertTrue(result[0]["uploaded_at"].endswith("Z"))

    def test_index_failure_leaves_index_and_registry_unchanged(self) -> None:
        store = VectorStore()
        store.add_document(
            "first", "first.pdf", "digest-1",
            [{"text": "existing", "chunk_index": 0}], np.array([[1.0, 0.0]], dtype=np.float32),
        )
        index_before = store._index
        metadata_before = dict(store._metadata)
        documents_before = store.list_documents()
        with patch("app.services.vector_store.faiss.clone_index", side_effect=RuntimeError("index failure")):
            with self.assertRaisesRegex(RuntimeError, "index failure"):
                store.add_document(
                    "second", "second.pdf", "digest-2",
                    [{"text": "new", "chunk_index": 0}], np.array([[0.0, 1.0]], dtype=np.float32),
                )
        self.assertIs(store._index, index_before)
        self.assertEqual(store._metadata, metadata_before)
        self.assertEqual(store.list_documents(), documents_before)

    def test_embedding_failure_does_not_change_index_or_registry(self) -> None:
        from app.routes import documents as document_routes
        from unittest.mock import AsyncMock
        store = VectorStore()
        store.add_document(
            "first", "first.pdf", "digest-1",
            [{"text": "existing", "chunk_index": 0}], np.array([[1.0, 0.0]], dtype=np.float32),
        )
        index_before = store._index
        docs_before = store.list_documents()
        chunks = [{"text": "new", "chunk_index": 0, "source_filename": "new.pdf"}]
        with (
            patch.object(main, "load_embedding_model"),
            patch.object(document_routes, "vector_store", store),
            patch.object(document_routes, "extract_pdf_chunks", new=AsyncMock(return_value=chunks)),
            patch.object(document_routes, "embed_texts", side_effect=RuntimeError("embedding failure")),
            TestClient(app, raise_server_exceptions=False) as client,
        ):
            response = client.post("/documents/upload", files={"file": ("new.pdf", b"new bytes", "application/pdf")})
        self.assertEqual(response.status_code, 500)
        self.assertIs(store._index, index_before)
        self.assertEqual(store.list_documents(), docs_before)

    def test_duplicate_upload_reuses_id_without_indexing_again(self) -> None:
        from app.routes import documents as document_routes
        from unittest.mock import AsyncMock
        store = VectorStore()
        chunks = [{"text": "same source", "chunk_index": 0, "source_filename": "paper.pdf"}]
        with (
            patch.object(main, "load_embedding_model"),
            patch.object(document_routes, "vector_store", store),
            patch.object(document_routes, "extract_pdf_chunks", new=AsyncMock(return_value=chunks)),
            patch.object(document_routes, "embed_texts", return_value=np.array([[1.0, 0.0]], dtype=np.float32)) as embed,
            TestClient(app) as client,
        ):
            first = client.post("/documents/upload", files={"file": ("paper.pdf", b"same bytes", "application/pdf")}).json()
            second = client.post("/documents/upload", files={"file": ("paper.pdf", b"same bytes", "application/pdf")}).json()
        self.assertEqual(first["document_id"], second["document_id"])
        self.assertFalse(first["duplicate"])
        self.assertTrue(second["duplicate"])
        self.assertEqual(second["chunks_added"], 0)
        self.assertEqual(embed.call_count, 1)
        self.assertEqual(store._index.ntotal, 1)
        self.assertEqual(len(store.list_documents()), 1)

    def test_get_documents_returns_registry(self) -> None:
        with patch.object(main, "load_embedding_model"), TestClient(app) as client:
            response = client.get("/documents")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json(), list)

    def test_cors_preflight_and_origin_parsing(self) -> None:
        from main import parse_cors_origins
        self.assertEqual(
            parse_cors_origins(" https://one.example ,  https://two.example  "),
            ["https://one.example", "https://two.example"],
        )
        self.assertEqual(parse_cors_origins("  ,  "), [])
        with patch.object(main, "load_embedding_model"), TestClient(app) as client:
            response = client.options(
                "/documents/upload",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                },
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:5173")

    def test_research_response_includes_claims_checked(self) -> None:
        from app.routes import research as research_routes
        state = {
            "report": "result", "evaluation": {"faithfulness_score": 1.0, "flagged_claims": [], "total_claims_checked": 0},
            "agent_trace": [], "retry_count": 0,
        }
        with patch.object(main, "load_embedding_model"), patch.object(
            research_routes.get_research_graph(), "invoke", return_value=state
        ) as invoke, TestClient(app) as client:
            response = client.post("/research/query", json={"question": "question"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["claims_checked"], 0)


if __name__ == "__main__":
    unittest.main()
