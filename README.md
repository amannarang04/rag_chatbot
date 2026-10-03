# IntelliResearch

IntelliResearch is a multi-agent, RAG-based research assistant. This repository contains its FastAPI backend and React frontend starter.

Run the backend from `backend/` with `uvicorn main:app --reload`. Run the frontend from `frontend/` with `npm run dev`.

The first backend run downloads the sentence-transformer embedding model (about 90 MB).

Copy `frontend/.env.example` to `frontend/.env` before starting Vite, then set
`VITE_API_BASE_URL` to the backend origin.

PDF uploads are limited to 20 MiB by default; set `MAX_UPLOAD_BYTES` to change the
limit. The application enforces this after multipart parsing, so production deployments
should also configure a request-size limit at the reverse proxy.

The FAISS index and document registry are held in memory and reset when the backend
restarts.
