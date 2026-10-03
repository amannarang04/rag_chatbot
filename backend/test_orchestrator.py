import argparse
import json
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run a research query against a running IntelliResearch backend."
    )
    parser.add_argument("question", nargs="?", default="What are the main findings in my uploaded documents?")
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    request = Request(
        f"{args.base_url.rstrip('/')}/research/query",
        data=json.dumps({"question": args.question}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=180) as response:
            result = json.load(response)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(f"Research request failed ({exc.code}): {detail}", file=sys.stderr)
        return 1
    except URLError as exc:
        print(f"Could not reach the backend: {exc.reason}", file=sys.stderr)
        return 1

    if not result.get("report"):
        print("The pipeline returned an empty report.", file=sys.stderr)
        return 1

    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
