#!/usr/bin/env python3
"""
Veridian central DeepSeek-V4 code-bundle gateway (the ONLY path to DeepSeek).

Policy: docs/program-control/MODEL_EXECUTION_POLICY.md
- DeepSeek V4 via OpenRouter is the sole code AUTHOR. No Qwen, no fallback, no
  substitution. If the configured route cannot be PROVEN to be the approved
  DeepSeek V4 route, the gateway exits MODEL_ROUTE_BLOCKED and writes nothing.
- The API key is read from env/env-file and NEVER printed or logged.
- The outbound request is redaction-scanned; if it looks like it carries a secret,
  the gateway aborts (never sends secrets to a model).
- Raw model output goes to a git-ignored private dir; only REDACTED metadata +
  hashes are written under docs/program-control/ai-evidence/<package-id>/.

Usage:
  python openrouter_deepseek_bundle.py --validate-only
  python openrouter_deepseek_bundle.py --package-id VC02 \
      --definition-pack docs/program-control/definition-packs/VC02.md \
      --request /path/to/redacted-request.md

Exit codes: 0 ok · 2 MODEL_ROUTE_BLOCKED · 3 usage · 4 redaction abort · 5 call/verify failure
"""
import argparse, hashlib, json, os, re, sys, urllib.request, urllib.error
from datetime import datetime, timezone

BASE_URL = os.environ.get("VERIDIAN_OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
APPROVED_PREFIX = os.environ.get("VERIDIAN_DEEPSEEK_APPROVED_PREFIX", "deepseek/deepseek-v4")
PRIVATE_DIR = os.environ.get("VERIDIAN_AI_PRIVATE_ARTIFACT_DIR", os.path.join(".ai-private"))
EVIDENCE_ROOT = os.path.join("docs", "program-control", "ai-evidence")

# Secret shapes we must never transmit to a model (defense in depth on the request).
SECRET_RE = re.compile(
    r"(sk-or-v1-[A-Za-z0-9]{20,}|sk-ant-[A-Za-z0-9_-]{16,}|sk-[A-Za-z0-9]{20,}"
    r"|AKIA[A-Z0-9]{16}|gh[opsru]_[A-Za-z0-9]{20,}|GOCSPX-[A-Za-z0-9_-]{10,}"
    r"|AIza[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}"
    r"|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)"
)


class RouteBlocked(Exception):
    pass


def _ts():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_key():
    key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("VERIDIAN_ENV") or ""
    if not key:
        envfile = os.environ.get("VERIDIAN_ENV_FILE", r"C:\Users\HI\Desktop\env\.env")
        try:
            with open(envfile, "r", encoding="utf-8") as fh:
                for line in fh:
                    m = re.match(r"\s*(VERIDIAN_ENV|OPENROUTER_API_KEY)\s*=\s*(.+)", line)
                    if m:
                        key = m.group(2).strip().strip('"').strip("'")
                        break
        except OSError:
            pass
    return key


# --- HTTP seams (monkeypatched in tests; no network there) -------------------
def http_get_models(key):
    req = urllib.request.Request(f"{BASE_URL}/models", headers={"Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def http_post_chat(key, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions", data=data,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "X-Title": "Veridian-Gateway"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


# --- route validation (the heart of the policy) ------------------------------
def configured_model():
    m = os.environ.get("VERIDIAN_DEEPSEEK_CODE_MODEL", "").strip()
    if not m:
        raise RouteBlocked("VERIDIAN_DEEPSEEK_CODE_MODEL is not set — refusing to guess a model id")
    return m


def validate_route(key, model, models_payload):
    """Prove the configured model is the approved DeepSeek V4 route, or raise."""
    low = model.lower()
    if "qwen" in low:
        raise RouteBlocked(f"Qwen route forbidden: {model}")
    if not low.startswith("deepseek/"):
        raise RouteBlocked(f"non-DeepSeek route forbidden: {model}")
    if not low.startswith(APPROVED_PREFIX.lower()):
        raise RouteBlocked(f"model {model} is not the approved DeepSeek route (prefix {APPROVED_PREFIX})")
    ids = {m.get("id") for m in (models_payload or {}).get("data", [])}
    if model not in ids:
        raise RouteBlocked(f"model {model} not found in live OpenRouter metadata — cannot prove it exists")
    return True


def redaction_scan(text):
    hit = SECRET_RE.search(text or "")
    return (hit.group(0)[:6] + "…") if hit else None


def write_evidence(pkg, manifest, proposed_files, risk_summary, resp_hash):
    d = os.path.join(EVIDENCE_ROOT, pkg)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "model-route-manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    with open(os.path.join(d, "deepseek-response-hash.txt"), "w", encoding="utf-8") as f:
        f.write(resp_hash + "\n")
    with open(os.path.join(d, "deepseek-proposed-files.md"), "w", encoding="utf-8") as f:
        f.write("# Proposed files (from DeepSeek bundle)\n\n" + (proposed_files or "(none parsed)") + "\n")
    with open(os.path.join(d, "deepseek-risk-summary.md"), "w", encoding="utf-8") as f:
        f.write("# Risk summary\n\n" + (risk_summary or "(none)") + "\n")
    return d


def run(package_id=None, definition_pack=None, request_path=None, validate_only=False,
        key=None, models_payload=None, chat_response=None):
    """Core flow. In tests, pass models_payload/chat_response to bypass network."""
    key = key if key is not None else load_key()
    if not key:
        raise RouteBlocked("no OpenRouter API key available")
    model = configured_model()
    models_payload = models_payload if models_payload is not None else http_get_models(key)
    validate_route(key, model, models_payload)
    if validate_only:
        return {"status": "ROUTE_OK", "model": model, "ts": _ts()}

    if not package_id or not definition_pack:
        raise SystemExit("usage: --package-id and --definition-pack required")
    if not os.path.exists(definition_pack):
        raise SystemExit(f"definition pack not found: {definition_pack}")
    req_text = ""
    if request_path:
        with open(request_path, "r", encoding="utf-8") as f:
            req_text = f.read()
    # Redaction guard — never send a secret to the model.
    leak = redaction_scan(req_text) or redaction_scan(open(definition_pack, encoding="utf-8").read())
    if leak:
        print(f"REDACTION_ABORT: request appears to carry a secret ({leak}) — not sending", file=sys.stderr)
        sys.exit(4)

    system = ("You are DeepSeek V4, the sole code AUTHOR for Veridian. Return a COMPLETE code "
              "bundle (exact file list, full file contents or unified diffs, complete tests, "
              "negative tests, loading/error/empty/unavailable states, rollback notes, risks). "
              "No pseudo-code, no TODO placeholders, no invented APIs, no missing tests.")
    body = {
        "model": model,                 # EXACTLY ONE explicit model
        "messages": [{"role": "system", "content": system},
                     {"role": "user", "content": req_text or open(definition_pack, encoding="utf-8").read()}],
        # No "models" fallback list, no "route":"fallback" — substitution forbidden.
    }
    resp = chat_response if chat_response is not None else http_post_chat(key, body)
    returned_model = (resp or {}).get("model", "")
    if not returned_model.lower().startswith(APPROVED_PREFIX.lower()):
        raise RouteBlocked(f"response model '{returned_model}' != approved route — possible substitution")
    content = (((resp.get("choices") or [{}])[0]).get("message") or {}).get("content", "")
    resp_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()

    # Raw output -> private git-ignored dir only.
    os.makedirs(PRIVATE_DIR, exist_ok=True)
    with open(os.path.join(PRIVATE_DIR, f"{package_id}-deepseek-raw.md"), "w", encoding="utf-8") as f:
        f.write(content)
    files = re.findall(r"(?:^|\n)#{0,3}\s*(?:File|FILE|path):\s*(\S+)", content)
    manifest = {"package_id": package_id, "provider": "openrouter", "model": model,
                "returned_model": returned_model, "approved_prefix": APPROVED_PREFIX,
                "ts": _ts(), "redaction": "request scanned, no secret transmitted",
                "response_sha256": resp_hash, "raw_artifact": f"{PRIVATE_DIR}/{package_id}-deepseek-raw.md"}
    ev = write_evidence(package_id, manifest, "\n".join(f"- {x}" for x in files), "(see raw artifact)", resp_hash)
    return {"status": "BUNDLE_OK", "model": model, "evidence": ev, "files_detected": len(files)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--package-id")
    ap.add_argument("--definition-pack")
    ap.add_argument("--request")
    ap.add_argument("--validate-only", action="store_true")
    a = ap.parse_args()
    try:
        out = run(a.package_id, a.definition_pack, a.request, a.validate_only)
        print(json.dumps(out, indent=2))
    except RouteBlocked as e:
        print(f"MODEL_ROUTE_BLOCKED: {e}", file=sys.stderr)
        sys.exit(2)
    except urllib.error.URLError as e:
        print(f"CALL_FAILED: {e}", file=sys.stderr)
        sys.exit(5)


if __name__ == "__main__":
    main()
