#!/usr/bin/env python3
# One-off: run the report text through the approved Big-LLM (route-validated + redaction-scanned)
# for an honest assessment. Reuses the gateway's validation. NOT a code-author call.
import os, sys, importlib.util, json, hashlib
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("gw", os.path.join(HERE, "openrouter_bigllm_bundle.py"))
gw = importlib.util.module_from_spec(spec); spec.loader.exec_module(gw)

key = gw.load_key()
if not key:
    print("MODEL_ROUTE_BLOCKED: no key", file=sys.stderr); sys.exit(2)
model = gw.configured_model()
gw.validate_route(model, gw.http_get_models(key))

reports = ""
for f in ["reports/VERIDIAN-STATUS-REPORT.txt", "reports/VERIDIAN-TODO-LIST.txt"]:
    reports += f"\n\n===== {f} =====\n" + open(f, encoding="utf-8").read()

leak = gw.redaction_scan(reports)
if leak:
    print(f"REDACTION_ABORT: secret-shaped content ({leak}) — not sending", file=sys.stderr); sys.exit(4)

system = ("You are a senior engineering reviewer. Read this project status report and TODO board. "
          "Give an HONEST, concrete assessment in plain text (no code). Cover: (1) is the project on a "
          "sound path? (2) the single most important thing to do next and why, (3) the top 3 risks, "
          "(4) anything that looks mislabeled, over-claimed, or contradictory, (5) one thing being done "
          "well. Be blunt and specific. Keep under 400 words.")
body = {"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": reports}]}
resp = gw.http_post_chat(key, body)
returned = resp.get("model", "")
gw.verify_returned_model(returned, model)
content = (((resp.get("choices") or [{}])[0]).get("message") or {}).get("content", "").strip()

os.makedirs("docs/program-control/ai-evidence/ASSESS", exist_ok=True)
json.dump({"configured_model": model, "returned_model": returned,
           "response_sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
           "redaction": "scanned, no secret sent"},
          open("docs/program-control/ai-evidence/ASSESS/model-route-manifest.json", "w"), indent=2)
out = "================================================================================\n" \
      " VERIDIAN — PIPELINE ASSESSMENT (by " + returned + ")\n" \
      "================================================================================\n\n" + content + "\n"
open("reports/PIPELINE-ASSESSMENT.txt", "w", encoding="utf-8").write(out)
print(f"returned_model={returned}")
print(out)
