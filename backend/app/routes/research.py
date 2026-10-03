import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.agents.llm import AgentError
from app.agents.orchestrator import ResearchState, get_research_graph

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/research", tags=["research"])


class ResearchQuery(BaseModel):
    question: str = Field(min_length=1)


@router.post("/query")
def research_query(request: ResearchQuery) -> dict[str, Any]:
    try:
        state: ResearchState = get_research_graph().invoke(
            {"query": request.question, "retry_count": 0, "agent_trace": []}
        )
    except AgentError as exc:
        logger.exception("Research request failed in an agent")
        raise HTTPException(
            status_code=500,
            detail=f"Research could not be completed: {exc}",
        ) from exc
    except Exception as exc:
        logger.exception("Research orchestration failed")
        raise HTTPException(
            status_code=500,
            detail="Research could not be completed. Check the backend logs for details.",
        ) from exc

    evaluation = state.get("evaluation", {})
    return {
        "report": state.get("report", ""),
        "faithfulness_score": evaluation.get("faithfulness_score", 0.0),
        "flagged_claims": evaluation.get("flagged_claims", []),
        "agent_trace": state.get("agent_trace", []),
        "retries": state.get("retry_count", 0),
        "claims_checked": evaluation.get("total_claims_checked", 0),
    }
