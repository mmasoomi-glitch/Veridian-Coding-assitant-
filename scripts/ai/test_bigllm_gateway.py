#!/usr/bin/env python3
"""Mock-only tests for the config-driven Big-LLM gateway. No network.
Run: python scripts/ai/test_bigllm_gateway.py"""
import os, sys, importlib.util, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("gw", os.path.join(HERE, "openrouter_bigllm_bundle.py"))
gw = importlib.util.module_from_spec(spec); spec.loader.exec_module(gw)

fails = 0
def ok(n, c):
    global fails
    print(("  ok   " if c else "  FAIL ") + n)
    if not c: fails += 1

MODELS = {"data": [{"id": "cohere/north-mini-code:free"}, {"id": "cohere/north-mini-code-20260617:free"},
                   {"id": "deepseek/deepseek-v4-pro"}, {"id": "qwen/qwen3-coder"}]}
def env(**kw):
    for k, v in kw.items():
        if v is None: os.environ.pop(k, None)
        else: os.environ[k] = v

# 1. allowlisted model validates
env(VERIDIAN_BIG_CODE_MODEL="cohere/north-mini-code:free", VERIDIAN_BIG_CODE_ALLOWLIST=None, VERIDIAN_BIG_CODE_SNAPSHOT=None)
ok("allowlisted model ROUTE_OK", gw.run_verify_route(key="k", models_payload=MODELS)["status"] == "ROUTE_OK")

# 2. Qwen blocked
env(VERIDIAN_BIG_CODE_MODEL="qwen/qwen3-coder")
try: gw.run_verify_route(key="k", models_payload=MODELS); ok("qwen blocked", False)
except gw.RouteBlocked: ok("qwen route BLOCKED", True)

# 3. non-allowlist model blocked (exists but not on allowlist)
env(VERIDIAN_BIG_CODE_MODEL="deepseek/deepseek-v4-pro", VERIDIAN_BIG_CODE_ALLOWLIST="cohere/north-mini-code:free")
try: gw.run_verify_route(key="k", models_payload=MODELS); ok("non-allowlist blocked", False)
except gw.RouteBlocked: ok("non-allowlist model BLOCKED", True)

# 4. unknown model blocked
env(VERIDIAN_BIG_CODE_MODEL="cohere/north-ghost", VERIDIAN_BIG_CODE_ALLOWLIST="cohere/north-ghost")
try: gw.run_verify_route(key="k", models_payload=MODELS); ok("ghost blocked", False)
except gw.RouteBlocked: ok("unknown model BLOCKED (not in metadata)", True)

# 5. missing config blocked
env(VERIDIAN_BIG_CODE_MODEL=None)
try: gw.run_verify_route(key="k", models_payload=MODELS); ok("missing blocked", False)
except gw.RouteBlocked: ok("missing model config BLOCKED", True)

# 6. returned-model snapshot mismatch blocked UNLESS documented
env(VERIDIAN_BIG_CODE_MODEL="cohere/north-mini-code:free", VERIDIAN_BIG_CODE_ALLOWLIST=None, VERIDIAN_BIG_CODE_SNAPSHOT=None)
try: gw.verify_returned_model("cohere/north-mini-code-20260617:free", "cohere/north-mini-code:free"); ok("undocumented snapshot blocked", False)
except gw.RouteBlocked: ok("undocumented returned-model BLOCKED", True)
env(VERIDIAN_BIG_CODE_SNAPSHOT="cohere/north-mini-code-20260617:free")
ok("documented snapshot accepted", gw.verify_returned_model("cohere/north-mini-code-20260617:free", "cohere/north-mini-code:free") is True)

# 7. bundle schema rejects pseudo-code / no-tests
files, probs = gw.validate_bundle("### File: a.ts\n```\nexport const x=1; // TODO finish\n```\n")
ok("bundle with TODO flagged", any("TODO" in p or "pseudo" in p for p in probs))
files2, probs2 = gw.validate_bundle("### File: a.ts\n```\nexport const x=1;\n```\nand a test block\ntest ok\n")
ok("clean bundle with file + test passes", probs2 == [])

# 8. redaction scan catches a secret-shaped string
ok("redaction scan flags a key", gw.redaction_scan("token sk-or-v1-" + "a"*40) is not None)

print()
if fails: print(f"test_bigllm_gateway: {fails} FAILED"); sys.exit(1)
print("test_bigllm_gateway: route allowlist + qwen/non-allowlist/unknown/missing rejection + snapshot + bundle schema + redaction all pass")
