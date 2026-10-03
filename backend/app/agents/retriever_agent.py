from typing import Any

from app.services.embeddings import embed_texts
from app.services.vector_store import vector_store


def retrieve_chunks(query: str, top_k: int = 5) -> list[dict[str, Any]]:
    query_embedding = embed_texts([query])
    return vector_store.search(query_embedding[0], top_k)
