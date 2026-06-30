def f11_verdict(evidence: dict) -> dict:
    """
    Evaluate evidence against F11 hard rules and return verdict dict.
    """
    # Rule 1: secret in inputs blocks everything
    if evidence.get("secret_in_inputs", False):
        return {
            "verdict": "BLOCKED",
            "reasons": ["secret in F11 inputs"],
            "required_relabel": None,
            "commit_allowed": False,
        }

    # Rule 2: real file replaced by skeleton requires repair
    if evidence.get("diff_clobbers_real_file", False):
        return {
            "verdict": "REPAIR REQUIRED",
            "reasons": ["real file replaced by skeleton"],
            "required_relabel": None,
            "commit_allowed": False,
        }

    # Rule 3: non-zero command exit code (masked success) requires repair
    cmd_exit = evidence.get("command_exit_code")
    if cmd_exit not in (None, 0):
        return {
            "verdict": "REPAIR REQUIRED",
            "reasons": [f"non-zero exit code {cmd_exit} — exit must not be masked even if a file was written"],
            "required_relabel": None,
            "commit_allowed": False,
        }

    # Rule 4: tsc failure requires repair
    tsc_exit = evidence.get("tsc_exit")
    if tsc_exit not in (None, 0):
        return {
            "verdict": "REPAIR REQUIRED",
            "reasons": ["tsc failed"],
            "required_relabel": None,
            "commit_allowed": False,
        }

    # Rule 5: RUNTIME VERIFIED withdrawn when only negative/error path proven
    claimed_label = evidence.get("claimed_label")
    positive_path = evidence.get("positive_path")
    if claimed_label == "RUNTIME VERIFIED" and positive_path != "PROVEN":
        required_relabel = (
            "BLOCKED" if positive_path == "NOT_PROVEN" else "LOCAL TESTED"
        )
        return {
            "verdict": "PASS WITH RELABEL",
            "reasons": ["only negative/error path proven — RUNTIME VERIFIED withdrawn"],
            "required_relabel": required_relabel,
            "commit_allowed": True,
        }

    # Rule 6: default PASS - all reality checks passed
    return {
        "verdict": "PASS",
        "reasons": ["all reality checks passed"],
        "required_relabel": None,
        "commit_allowed": True,
    }


def commit_allowed(verdict: str) -> bool:
    """
    Determine if a commit is allowed based solely on the verdict.
    Only PASS and PASS WITH RELABEL permit a commit.
    """
    return verdict in ("PASS", "PASS WITH RELABEL")
