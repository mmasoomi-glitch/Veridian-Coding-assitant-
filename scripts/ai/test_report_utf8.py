#!/usr/bin/env python3
import subprocess, sys, os

unicode_string = "".join(chr(c) for c in (0x2014, 0x201C, 0x201D, 0x2018, 0x2019, 0x2011))

script1 = '''
import sys
unicode_string = "".join(chr(c) for c in (0x2014, 0x201C, 0x201D, 0x2018, 0x2019, 0x2011))
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass
print(unicode_string)
'''

script2 = '''
import sys
unicode_string = "".join(chr(c) for c in (0x2014, 0x201C, 0x201D, 0x2018, 0x2019, 0x2011))
print(unicode_string)
'''

env = os.environ.copy()
env["PYTHONIOENCODING"] = "cp1252"

result1 = subprocess.run([sys.executable, '-c', script1.strip()], env=env, capture_output=True)
assert result1.returncode == 0, f"Script1 failed with {result1.returncode}"
assert result1.stdout.decode('utf-8').rstrip() == unicode_string, "Script1 output mismatch"

result2 = subprocess.run([sys.executable, '-c', script2.strip()], env=env, capture_output=True)
assert result2.returncode != 0, f"Script2 should raise error, got {result2.returncode}"

print("test_report_utf8: 2 passed")
sys.exit(0)
