from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.documents import router as documents_router
from app.routes.research import router as research_router
from app.services.embeddings import load_embedding_model


@asynccontextmanager
async def lifespan(_: FastAPI):
    load_embedding_model()
    yield

def parse_cors_origins(value: str | None) -> list[str]:
    if value is None:
        value = "http://localhost:5173"
    origins = [origin.strip() for origin in value.split(",") if origin.strip()]
    if "*" in origins:
        raise ValueError("CORS_ORIGINS must not contain a wildcard origin.")
    return origins


app = FastAPI(title="IntelliResearch", lifespan=lifespan)
cors_origins = parse_cors_origins(os.getenv("CORS_ORIGINS"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)
app.include_router(documents_router)
app.include_router(research_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
