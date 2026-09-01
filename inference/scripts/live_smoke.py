#!/usr/bin/env python3
"""Non-sensitive Granite Chat Completions smoke; never prints credentials or reasoning."""

import argparse
import json
import os
import time
import urllib.error
import urllib.request


TOOLS = {
    "classification": {
        "name": "submit_care_classification",
        "description": "Return a CARE voice classification.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "category": {
                    "type": ["string", "null"],
                    "enum": ["SAFETY", "ENVIRONMENT", "FACILITY", "WORK_DIFFICULTY", None],
                },
                "severity": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
                "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                "rationaleCode": {"type": "string"},
            },
            "required": ["category", "severity", "confidence", "rationaleCode"],
        },
    },
    "location": {
        "name": "submit_care_location_review",
        "description": "Return a CARE location review.",
        "parameters": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "completeness": {"type": "string", "enum": ["COMPLETE", "INCOMPLETE", "UNKNOWN"]},
                "warning": {"type": ["string", "null"]},
                "questions": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
            },
            "required": ["completeness", "warning", "questions"],
        },
    },
}


def request_json(url, api_key, body=None, timeout=120):
    data = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=data, method="GET" if body is None else "POST")
    request.add_header("Authorization", "Bearer " + api_key)
    if data is not None:
        request.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def run_call(base_url, api_key, model, kind):
    tool = TOOLS[kind]
    user = (
        "Klasifikasikan laporan: pelindung mesin press terlepas dan berisiko mengenai operator."
        if kind == "classification"
        else "Tinjau lokasi: Karawang 1, gedung produksi A, line 2, mesin press nomor 4."
    )
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Return exactly the requested function call."},
            {"role": "user", "content": user},
        ],
        "tools": [{"type": "function", "function": tool}],
        "tool_choice": {"type": "function", "function": {"name": tool["name"]}},
        "temperature": 1.0,
        "top_p": 0.95,
        "max_tokens": 8192,
        "chat_template_kwargs": {"enable_thinking": True, "low_effort": False},
    }
    started = time.monotonic()
    result = request_json(base_url + "/chat/completions", api_key, body)
    elapsed = round((time.monotonic() - started) * 1000)
    choice = result.get("choices", [{}])[0]
    message = choice.get("message", {})
    calls = message.get("tool_calls") or []
    if len(calls) != 1 or calls[0].get("function", {}).get("name") != tool["name"]:
        raise RuntimeError(kind + " did not return exactly one expected tool call")
    json.loads(calls[0]["function"]["arguments"])
    reasoning_present = bool(message.get("reasoning_content"))
    if not reasoning_present:
        raise RuntimeError(kind + " did not expose parsed reasoning_content")
    return {"operation": kind, "latencyMs": elapsed, "reasoningPresent": True, "toolCallValid": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=os.environ.get("OPENAI_BASE_URL", "http://127.0.0.1:30000/v1"))
    parser.add_argument("--model", default=os.environ.get("OPENAI_MODEL", "ibm-granite/granite-4.2-3b"))
    args = parser.parse_args()
    api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("INFERENCE_API_KEY")
    if not api_key:
        raise SystemExit("OPENAI_API_KEY or INFERENCE_API_KEY is required")

    unauthenticated = urllib.request.Request(args.base_url + "/models")
    try:
        urllib.request.urlopen(unauthenticated, timeout=15)
        raise RuntimeError("unauthenticated request was accepted")
    except urllib.error.HTTPError as error:
        if error.code != 401:
            raise

    models = request_json(args.base_url + "/models", api_key)
    identifiers = [item.get("id") for item in models.get("data", [])]
    if args.model not in identifiers:
        raise RuntimeError("configured Granite model is not advertised")

    results = [run_call(args.base_url, api_key, args.model, kind) for kind in ("classification", "location")]
    print(json.dumps({"status": "ok", "model": args.model, "results": results}))


if __name__ == "__main__":
    main()
