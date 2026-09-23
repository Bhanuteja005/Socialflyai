#!/bin/sh
# Pre-commit secret scan. Kept in a file rather than inline in lefthook.yml:
# lefthook on Windows mangles multi-statement shell in `run` and the if-block
# fails to parse.
if command -v gitleaks >/dev/null 2>&1; then
	exec gitleaks git --pre-commit --staged --redact --no-banner
fi
echo "gitleaks not installed - skipping local scan (CI still scans). Install: https://github.com/gitleaks/gitleaks"
