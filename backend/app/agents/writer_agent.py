import json

from app.agents.llm import call_llm

SYSTEM_PROMPT = (
    "You are a careful research report writer. Write a clear, coherent report in Markdown "
    "that answers the user's question using only the supplied analysis. Every factual claim "
    "must have an inline citation copied exactly from the supplied source references, in the "
    "format [Source: filename.pdf, chunk 3]. Do not invent citations or unsupported claims. "
    "If the notes contain no relevant evidence, say so plainly."
)


def write_report(
    query: str,
    analysis: dict[str, list[str]],
    retry_note: str = "",
) -> str:
    prompt = (
        f"Question: {query}\n\n"
        f"Analysis notes:\n{json.dumps(analysis, ensure_ascii=False)}\n\n"
        f"Evaluator feedback to address, if any:\n{retry_note or 'None'}"
    )
    return call_llm(SYSTEM_PROMPT, prompt, "Writer")
