import json
import math
from typing import Any

from app.agents.llm import request_json

SYSTEM_PROMPT = (
    "You are a strict report faithfulness evaluator. A claim is supported only when the "
    "provided source chunks directly state or clearly imply it. Citations alone do not make "
    "a claim supported. Check each distinct factual claim, and flag unsupported or "
    "contradicted claims. Output ONLY valid JSON with exactly these keys: "
    '"faithfulness_score" (number from 0 to 1), "flagged_claims" (array of strings), '
    'and "total_claims_checked" (non-negative integer). The score is the fraction of '
    "checked claims supported by the sources; use 1.0 when no factual claims are made."
)


def _validate_evaluation(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON object.")

    expected_keys = {"faithfulness_score", "flagged_claims", "total_claims_checked"}
    if set(value) != expected_keys:
        raise ValueError("JSON must contain faithfulness_score, flagged_claims, and total_claims_checked only.")

    score = value["faithfulness_score"]
    flagged = value["flagged_claims"]
    total = value["total_claims_checked"]
    if isinstance(score, bool) or not isinstance(score, (int, float)) or not math.isfinite(score):
        raise ValueError("faithfulness_score must be a finite number.")
    if not 0 <= score <= 1:
        raise ValueError("faithfulness_score must be between 0 and 1.")
    if not isinstance(flagged, list) or any(not isinstance(claim, str) for claim in flagged):
        raise ValueError("flagged_claims must be an array of strings.")
    if isinstance(total, bool) or not isinstance(total, int) or total < 0:
        raise ValueError("total_claims_checked must be a non-negative integer.")

    return {
        "faithfulness_score": float(score),
        "flagged_claims": flagged,
        "total_claims_checked": total,
    }


def evaluate_report(
    report: str,
    chunks: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = (
        "Evaluate this report against the source chunks. Return the required JSON.\n\n"
        f"Report:\n{report}\n\n"
        f"Source chunks:\n{json.dumps(chunks, ensure_ascii=False)}"
    )
    return request_json(SYSTEM_PROMPT, prompt, "Evaluator", _validate_evaluation)
