#!/usr/bin/env python3
"""Mock-only tests for the DeepSeek gateway. No network. Run: python scripts/ai/test_gateway.py"""
import os, sys, importlib.util, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("gw", os.path.join(HERE, "openrouter_deepseek_bundle.py"))
gw = importlib.util.module_from_spec(spec); spec.loader.exec_module(gw)

fails = 0
ORIG_CWD = os.getcwd()
def ok(name, cond):
    global fails
    print(("  ok   " if cond else "  FAIL ") + name)
    if not cond: fails += 1

MODELS = {"data": [{"id": "deepseek/deepseek-v4-pro"}, {"id": "deepseek/deepseek-v4-flash"},
                   {"id": "deepseek/deepseek-chat"}, {"id": "qwen/qwen3-coder"}]}
def chat_for(model):  # minimal OpenRouter-shaped response
    return {"model": model, "choices": [{"message": {"content": "# File: a.ts\nexport const x=1;\n"}}]}

def with_env(**kw):
    for k, v in kw.items():
        if v is None: os.environ.pop(k, None)
        else: os.environ[k] = v

# 1. Approved DeepSeek V4 route validates
with_env(VERIDIAN_DEEPSEEK_CODE_MODEL="deepseek/deepseek-v4-pro", VERIDIAN_DEEPSEEK_APPROVED_PREFIX="deepseek/deepseek-v4")
r = gw.run(validate_only=True, key="k", models_payload=MODELS)
ok("approved deepseek-v4 route validates", r["status"] == "ROUTE_OK")

# 2. Qwen route BLOCKED
with_env(VERIDIAN_DEEPSEEK_CODE_MODEL="qwen/qwen3-coder")
try: gw.run(validate_only=True, key="k", models_payload=MODELS); ok("qwen blocked", False)
except gw.RouteBlocked: ok("qwen route BLOCKED", True)

# 3. Non-V4 deepseek BLOCKED (approved prefix is v4)
with_env(VERIDIAN_DEEPSEEK_CODE_MODEL="deepseek/deepseek-chat")
try: gw.run(validate_only=True, key="k", models_payload=MODELS); ok("non-v4 blocked", False)
except gw.RouteBlocked: ok("non-v4 deepseek BLOCKED (prefix enforced)", True)

# 4. Unknown model (not in metadata) BLOCKED — can't prove it exists
with_env(VERIDIAN_DEEPSEEK_CODE_MODEL="deepseek/deepseek-v4-ghost")
try: gw.run(validate_only=True, key="k", models_payload=MODELS); ok("ghost blocked", False)
except gw.RouteBlocked: ok("unknown model BLOCKED (not in live metadata)", True)

# 5. Missing config BLOCKED — no guessing
with_env(VERIDIAN_DEEPSEEK_CODE_MODEL=None)
try: gw.run(validate_only=True, key="k", models_payload=MODELS); ok("missing blocked", False)
except gw.RouteBlocked: ok("missing model config BLOCKED (no guess)", True)

# 6. Response-model substitution detected -> BLOCKED
with_env(VERIDIAN_DEEPSEEK_CODE_MODEL="deepseek/deepseek-v4-pro")
with tempfile.TemporaryDirectory() as d:
    dp = os.path.join(d, "VC.md"); open(dp, "w").write("benign feature intake, no secrets")
    os.environ["VERIDIAN_AI_PRIVATE_ARTIFACT_DIR"] = os.path.join(d, ".ai-private")
    os.chdir(d)  # evidence writes are relative; isolate
    try:
        gw.run(package_id="VC", definition_pack=dp, key="k", models_payload=MODELS,
               chat_response=chat_for("qwen/qwen3-coder"))
        ok("substitution blocked", False)
    except gw.RouteBlocked: ok("response-model substitution BLOCKED", True)

    # 7. Happy path writes evidence + detects files
    out = gw.run(package_id="VC", definition_pack=dp, key="k", models_payload=MODELS,
                 chat_response=chat_for("deepseek/deepseek-v4-pro"))
    ok("bundle ok writes evidence", out["status"] == "BUNDLE_OK" and out["files_detected"] >= 1)
    ok("manifest evidence exists", os.path.exists(os.path.join("docs/program-control/ai-evidence/VC/model-route-manifest.json")))

    # 8. Redaction abort: a secret in the definition pack must abort (SystemExit 4)
    leakdp = os.path.join(d, "leak.md"); open(leakdp, "w").write("token sk-or-v1-" + "a"*40)
    try:
        gw.run(package_id="VC2", definition_pack=leakdp, key="k", models_payload=MODELS,
               chat_response=chat_for("deepseek/deepseek-v4-pro"))
        ok("redaction abort", False)
    except SystemExit as e: ok("redaction ABORT on secret in request", e.code == 4)
    os.chdir(ORIG_CWD)  # restore so the tempdir can be cleaned

print()
if fails: print(f"test_gateway: {fails} FAILED"); sys.exit(1)
print("test_gateway: route validation + qwen/fallback/substitution rejection + redaction abort all pass")
