import importlib.util
import os
import sys


def _load_f11_check_module():
    """Load f11_check.py from the same directory using importlib."""
    module_path = os.path.join(os.path.dirname(__file__), "f11_check.py")
    spec = importlib.util.spec_from_file_location("f11_check", module_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


module = _load_f11_check_module()
f11_verdict = module.f11_verdict
commit_allowed = module.commit_allowed


def run_tests() -> int:
    """Execute all canonical fixtures and return the number of failures."""
    failures = 0

    # Helper to assert and count
    def assert_condition(cond, msg):
        nonlocal failures
        if not cond:
            failures += 1
            print(f"FAIL: {msg}")

    # Fixture 1 - non-zero exit (even if file written)
    evidence = {"command_exit_code": 1, "output_file_written": True}
    result = f11_verdict(evidence)
    assert_condition(result["verdict"] == "REPAIR REQUIRED", "exit1_but_file_written verdict mismatch")
    assert_condition(result["commit_allowed"] is False, "exit1_but_file_written commit_allowed mismatch")

    # Fixture 2 - negative-only run mislabeled RUNTIME VERIFIED
    evidence = {
        "claimed_label": "RUNTIME VERIFIED",
        "positive_path": "NOT_PROVEN",
        "negative_path": "PROVEN"
    }
    result = f11_verdict(evidence)
    assert_condition(result["verdict"] == "PASS WITH RELABEL", "negative_only_runtime_verified verdict mismatch")
    assert_condition(result["required_relabel"] == "BLOCKED", "negative_only_runtime_verified required_relabel mismatch")
    assert_condition(result["commit_allowed"] is True, "negative_only_runtime_verified commit_allowed mismatch")

    # Fixture 3 - real file clobbered by skeleton
    evidence = {"diff_clobbers_real_file": True}
    result = f11_verdict(evidence)
    assert_condition(result["verdict"] == "REPAIR REQUIRED", "clobbered_real_file verdict mismatch")
    assert_condition(result["commit_allowed"] is False, "clobbered_real_file commit_allowed mismatch")

    # Fixture 4 - secret present in inputs
    evidence = {"secret_in_inputs": True}
    result = f11_verdict(evidence)
    assert_condition(result["verdict"] == "BLOCKED", "secret_in_inputs verdict mismatch")
    assert_condition(result["commit_allowed"] is False, "secret_in_inputs commit_allowed mismatch")

    # Fixture 5 - clean scenario
    evidence = {
        "command_exit_code": 0,
        "tsc_exit": 0,
        "positive_path": "PROVEN",
        "claimed_label": "RUNTIME VERIFIED"
    }
    result = f11_verdict(evidence)
    assert_condition(result["verdict"] == "PASS", "clean verdict mismatch")
    assert_condition(result["commit_allowed"] is True, "clean commit_allowed mismatch")

    # Fixture 6 - commit gate check
    assert_condition(commit_allowed("REPAIR REQUIRED") is False, "commit_allowed REPAIR REQUIRED should be False")
    assert_condition(commit_allowed("PASS") is True, "commit_allowed PASS should be True")
    assert_condition(commit_allowed("PASS WITH RELABEL") is True, "commit_allowed PASS WITH RELABEL should be True")
    assert_condition(commit_allowed("BLOCKED") is False, "commit_allowed BLOCKED should be False")

    return failures


if __name__ == "__main__":
    failures = run_tests()
    print(f"TOTAL FAILS: {failures}")
    sys.exit(0 if failures == 0 else 1)
