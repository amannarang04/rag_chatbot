import json
import logging
from functools import lru_cache
from typing import Callable, TypeVar

from groq import Groq

from app.config import settings

logger = logging.getLogger(__name__)
ResultT = TypeVar("ResultT")


class AgentError(RuntimeError):
    """Raised when an agent cannot complete its LLM-backed step."""


@lru_cache(maxsize=1)
def get_groq_client() -> Groq:
    if not settings.GROQ_API_KEY:
        raise AgentError("GROQ_API_KEY is not configured.")
    return Groq(api_key=settings.GROQ_API_KEY)


def call_llm(system_prompt: str, user_prompt: str, agent_name: str) -> str:
    try:
        response = get_groq_client().chat.completions.create(
            model=settings.GROQ_MODEL,
            max_tokens=settings.max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        text = (response.choices[0].message.content or "").strip()
        if not text:
            raise AgentError(f"{agent_name} received an empty response from the LLM.")
        return text
    except AgentError:
        logger.exception("%s agent LLM call failed", agent_name)
        raise
    except Exception as exc:
        logger.exception("%s agent LLM call failed", agent_name)
        raise AgentError(f"{agent_name} could not complete its LLM request.") from exc


def request_json(
    system_prompt: str,
    user_prompt: str,
    agent_name: str,
    validate: Callable[[object], ResultT],
) -> ResultT:
    retry_note = ""
    for attempt in range(2):
        raw_response = call_llm(system_prompt, user_prompt + retry_note, agent_name)
        try:
            return validate(json.loads(raw_response))
        except (json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.warning(
                "%s agent returned invalid JSON on attempt %d: %s",
                agent_name,
                attempt + 1,
                exc,
            )
            if attempt == 1:
                logger.error("%s agent JSON response remained invalid after one retry", agent_name)
                raise AgentError(f"{agent_name} returned invalid JSON after one retry.") from exc
            retry_note = (
                "\nYour previous response was not valid JSON matching the required schema. "
                "Correct the issue and return only one valid JSON object."
            )

    raise AgentError(f"{agent_name} could not produce valid JSON.")
