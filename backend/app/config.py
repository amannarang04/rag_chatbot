import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@dataclass(frozen=True)
class Settings:
    GROQ_API_KEY: str | None
    GROQ_MODEL: str
    max_tokens: int


settings = Settings(
    GROQ_API_KEY=os.getenv("GROQ_API_KEY"),
    GROQ_MODEL="llama-3.3-70b-versatile",
    max_tokens=2048,
)
