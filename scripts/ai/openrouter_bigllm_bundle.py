#!/usr/bin/env python3
"""
Veridian central Big-LLM code-bundle gateway (config-driven; supersedes the
DeepSeek-specific gateway, which is preserved at openrouter_deepseek_bundle.py).

The configured model is read from VERIDIAN_BIG_CODE_MODEL and must be on the
allowlist (VERIDIAN_BIG_CODE_ALLOWLIST, default = the configured model). The
gateway validates the route against live OpenRouter metadata, runs an
authenticated structured-output preflight, rejects Qwen / fallback / unknown /
missing, redaction-scans the request, verifies the returned model, validates a
strict bundle schema, writes raw output to git-ignored .ai-private/ and redacted
evidence to docs/program-control/ai-evidence/<id>/.

Per VERIDIAN — PURPOSE-FIRST EXECUTION CONSTITUTION §4-§5.

Commands:
  python scripts/ai/openrouter_bigllm_bundle.py --verify-route
  python scripts/ai/openrouter_bigllm_bundle.py --preflight
  python scripts/ai/openrouter_bigllm_bundle.py --package-id <ID> --definition-pack <PATH> [--request <PATH>]

Exit: 0 ok · 2 MODEL_ROUTE_BLOCKED · 3 usage · 4 redaction abort · 5 call/verify · 6 bundle-invalid
"""
import argparse, hashlib, json, os, re, sys, urllib.request, urllib.error
from datetime import datetime, timezone

# UTF-8-safe console so model/exception content with em dash / smart quotes can't
# raise UnicodeEncodeError on a Windows cp1252 console (FIX-REPORT-UTF8-01).
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

BASE_URL = os.environ.get("VERIDIAN_OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
PRIVATE_DIR = os.environ.get("VERIDIAN_AI_PRIVATE_ARTIFACT_DIR", ".ai-private")
EVIDENCE_ROOT = os.path.join("docs", "program-control", "ai-evidence")

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


def configured_model():
    m = os.environ.get("VERIDIAN_BIG_CODE_MODEL", "").strip()
    if not m:
        raise RouteBlocked("VERIDIAN_BIG_CODE_MODEL not set — refusing to guess a model id")
    return m


def allowlist():
    raw = os.environ.get("VERIDIAN_BIG_CODE_ALLOWLIST", "").strip()
    if raw:
        return [x.strip() for x in raw.split(",") if x.strip()]
    return [configured_model()]  # default: only the configured model is allowed


# --- HTTP seams (monkeypatched in tests) -------------------------------------
def http_get_models(key):
    req = urllib.request.Request(f"{BASE_URL}/models", headers={"Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def http_post_chat(key, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions", data=data,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json", "X-Title": "Veridian-BigLLM"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def validate_route(model, models_payload):
    low = model.lower()
    if "qwen" in low:
        raise RouteBlocked(f"Qwen route forbidden: {model}")
    al = allowlist()
    if model not in al:
        raise RouteBlocked(f"model {model} is not on the allowlist {al}")
    ids = {m.get("id") for m in (models_payload or {}).get("data", [])}
    if model not in ids:
        raise RouteBlocked(f"model {model} not found in live OpenRouter metadata — cannot prove it exists")
    return True


def redaction_scan(text):
    hit = SECRET_RE.search(text or "")
    return (hit.group(0)[:6] + "…") if hit else None


def verify_returned_model(returned, configured, manifest_snapshot=None):
    if returned == configured:
        return True
    snap = manifest_snapshot or os.environ.get("VERIDIAN_BIG_CODE_SNAPSHOT", "")
    if snap and returned == snap:
        return True
    raise RouteBlocked(f"response model '{returned}' != configured '{configured}' (no documented snapshot mapping)")


# --- structured-output preflight ---------------------------------------------
def preflight(key=None, models_payload=None, chat_response=None):
    key = key if key is not None else load_key()
    if not key:
        raise RouteBlocked("no OpenRouter API key available")
    model = configured_model()
    models_payload = models_payload if models_payload is not None else http_get_models(key)
    validate_route(model, models_payload)
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Return ONLY a compact JSON object, no prose."},
            {"role": "user", "content": 'Reply with exactly this JSON: {"ok": true, "probe": "veridian"}'},
        ],
        "response_format": {"type": "json_object"},
    }
    mode = "native-json"
    try:
        resp = chat_response if chat_response is not None else http_post_chat(key, body)
    except urllib.error.HTTPError as e:
        # Model may not support response_format -> degrade to prompt-enforced JSON.
        del body["response_format"]
        mode = "prompt-json"
        resp = http_post_chat(key, body)
    returned = (resp or {}).get("model", "")
    verify_returned_model(returned, model)
    content = (((resp.get("choices") or [{}])[0]).get("message") or {}).get("content", "").strip()
    # tolerate code fences
    content = re.sub(r"^```[a-z]*\n?|\n?```$", "", content).strip()
    try:
        parsed = json.loads(content)
        ok = parsed.get("ok") is True
    except Exception:
        ok = False
    verdict = "PASS" if ok else "DEGRADED"
    return {"status": verdict, "mode": mode, "model": model, "returned_model": returned, "ts": _ts()}


# --- evidence ----------------------------------------------------------------
def write_evidence(pkg, manifest, proposed_files, resp_hash):
    d = os.path.join(EVIDENCE_ROOT, pkg)
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, "model-route-manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    with open(os.path.join(d, "bigllm-response-hash.txt"), "w", encoding="utf-8") as f:
        f.write(resp_hash + "\n")
    with open(os.path.join(d, "bigllm-proposed-files.md"), "w", encoding="utf-8") as f:
        f.write("# Proposed files (Big-LLM bundle)\n\n" + (proposed_files or "(none parsed)") + "\n")
    return d


# --- bundle schema validation ------------------------------------------------
def validate_bundle(content):
    """Reject pseudo-code / TODO stubs / skeletons; require file blocks + tests."""
    problems = []
    if re.search(r"\bTODO\b|\bFIXME\b|implement similarly|pseudo-?code|\.\.\.\s*$", content, re.I | re.M):
        problems.append("contains TODO/pseudo-code/ellipsis stub")
    files = re.findall(r"(?:^|\n)#{1,4}\s*File:\s*(\S+)", content)
    if not files:
        problems.append("no '### File: <path>' blocks found")
    if "test" not in content.lower():
        problems.append("no tests present")
    return files, problems


def run_bundle(package_id, definition_pack, request_path=None, key=None, models_payload=None, chat_response=None):
    key = key if key is not None else load_key()
    if not key:
        raise RouteBlocked("no OpenRouter API key available")
    model = configured_model()
    models_payload = models_payload if models_payload is not None else http_get_models(key)
    validate_route(model, models_payload)
    if not package_id or not definition_pack or not os.path.exists(definition_pack):
        raise SystemExit("usage: --package-id and an existing --definition-pack required")
    req_text = open(request_path, encoding="utf-8").read() if request_path else open(definition_pack, encoding="utf-8").read()
    leak = redaction_scan(req_text)
    if leak:
        print(f"REDACTION_ABORT: request appears to carry a secret ({leak}) — not sending", file=sys.stderr)
        sys.exit(4)
    system = ("You are the Big-LLM code AUTHOR for Veridian. Return a COMPLETE structured bundle: "
              "exact file list, full file contents or minimal unified diffs (NEVER rewrite a real "
              "integration file into a skeleton), complete tests + negative tests, loading/error/"
              "empty/unavailable states, rollback notes, risks. No pseudo-code, no TODO, no invented "
              "APIs. Use '### File: <path>' before each file's fenced code block.")
    body = {"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": req_text}]}
    resp = chat_response if chat_response is not None else http_post_chat(key, body)
    returned = (resp or {}).get("model", "")
    verify_returned_model(returned, model)
    content = (((resp.get("choices") or [{}])[0]).get("message") or {}).get("content", "")
    files, problems = validate_bundle(content)
    os.makedirs(PRIVATE_DIR, exist_ok=True)
    with open(os.path.join(PRIVATE_DIR, f"{package_id}-bigllm-raw.md"), "w", encoding="utf-8") as f:
        f.write(content)
    resp_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
    manifest = {"package_id": package_id, "provider": "openrouter", "configured_model": model,
                "returned_model": returned, "allowlist": allowlist(), "ts": _ts(),
                "redaction": "request scanned, no secret transmitted", "response_sha256": resp_hash,
                "bundle_problems": problems, "raw_artifact": f"{PRIVATE_DIR}/{package_id}-bigllm-raw.md"}
    write_evidence(package_id, manifest, "\n".join(f"- {x}" for x in files), resp_hash)
    if problems:
        print(f"BUNDLE_INVALID: {problems}", file=sys.stderr)
        sys.exit(6)
    return {"status": "BUNDLE_OK", "model": model, "files_detected": len(files)}


def run_verify_route(key=None, models_payload=None):
    key = key if key is not None else load_key()
    if not key:
        raise RouteBlocked("no OpenRouter API key available")
    model = configured_model()
    models_payload = models_payload if models_payload is not None else http_get_models(key)
    validate_route(model, models_payload)
    return {"status": "ROUTE_OK", "model": model, "allowlist": allowlist(), "ts": _ts()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify-route", action="store_true")
    ap.add_argument("--preflight", action="store_true")
    ap.add_argument("--package-id")
    ap.add_argument("--definition-pack")
    ap.add_argument("--request")
    a = ap.parse_args()
    try:
        if a.verify_route:
            print(json.dumps(run_verify_route(), indent=2))
        elif a.preflight:
            print(json.dumps(preflight(), indent=2))
        else:
            print(json.dumps(run_bundle(a.package_id, a.definition_pack, a.request), indent=2))
    except RouteBlocked as e:
        print(f"MODEL_ROUTE_BLOCKED: {e}", file=sys.stderr)
        sys.exit(2)
    except urllib.error.URLError as e:
        print(f"CALL_FAILED: {e}", file=sys.stderr)
        sys.exit(5)


if __name__ == "__main__":
    main()
