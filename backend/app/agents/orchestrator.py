from functools import lru_cache
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from app.agents.analyzer_agent import analyze_chunks
from app.agents.evaluator_agent import evaluate_report
from app.agents.retriever_agent import retrieve_chunks
from app.agents.writer_agent import write_report


class ResearchState(TypedDict, total=False):
    query: str
    retrieved_chunks: list[dict[str, Any]]
    analysis: dict[str, list[str]]
    report: str
    evaluation: dict[str, Any]
    retry_count: int
    retry_note: str
    agent_trace: list[str]


def _append_trace(state: ResearchState, node_name: str) -> list[str]:
    return [*state.get("agent_trace", []), node_name]


def _retrieve(state: ResearchState) -> ResearchState:
    return {
        "retrieved_chunks": retrieve_chunks(state["query"]),
        "agent_trace": _append_trace(state, "retrieve"),
    }


def _analyze(state: ResearchState) -> ResearchState:
    return {
        "analysis": analyze_chunks(state["query"], state.get("retrieved_chunks", [])),
        "agent_trace": _append_trace(state, "analyze"),
    }


def _write(state: ResearchState) -> ResearchState:
    retry_count = state.get("retry_count", 0)
    retry_note = ""
    if state.get("evaluation") and retry_count < 1:
        flagged = state["evaluation"]["flagged_claims"]
        retry_count += 1
        retry_note = (
            "Revise the report to remove or correct these unsupported claims: "
            f"{flagged}. Do not introduce new unsupported claims."
        )

    return {
        "report": write_report(state["query"], state.get("analysis", {}), retry_note),
        "retry_count": retry_count,
        "retry_note": retry_note,
        "agent_trace": _append_trace(state, "write"),
    }


def _evaluate(state: ResearchState) -> ResearchState:
    return {
        "evaluation": evaluate_report(
            state.get("report", ""),
            state.get("retrieved_chunks", []),
        ),
        "agent_trace": _append_trace(state, "evaluate"),
    }


def _after_evaluation(state: ResearchState) -> str:
    evaluation = state.get("evaluation", {})
    if evaluation.get("faithfulness_score", 1.0) < 0.7 and state.get("retry_count", 0) < 1:
        return "write"
    return END


@lru_cache(maxsize=1)
def get_research_graph() -> Any:
    graph = StateGraph(ResearchState)
    graph.add_node("retrieve", _retrieve)
    graph.add_node("analyze", _analyze)
    graph.add_node("write", _write)
    graph.add_node("evaluate", _evaluate)
    graph.add_edge(START, "retrieve")
    graph.add_edge("retrieve", "analyze")
    graph.add_edge("analyze", "write")
    graph.add_edge("write", "evaluate")
    graph.add_conditional_edges("evaluate", _after_evaluation, {"write": "write", END: END})
    return graph.compile()
