#!/bin/sh
set -e
missing=""
command -v semgrep >/dev/null 2>&1 || missing="$missing semgrep"
command -v gitleaks >/dev/null 2>&1 || missing="$missing gitleaks"
command -v osv-scanner >/dev/null 2>&1 || missing="$missing osv-scanner"
if [ -n "$missing" ]; then
  echo "ERROR: 以下のツールがインストールされていません:$missing"
  echo "  brew install$missing"
  exit 1
fi
SEMGREP_ARGS="--config p/typescript --config p/react --config p/nextjs --config p/owasp-top-ten --config p/javascript --config p/secrets"
echo "Running semgrep..."
semgrep $SEMGREP_ARGS --error .
echo "Running gitleaks..."
gitleaks detect --config .gitleaks.toml --no-git
echo "Running osv-scanner..."
osv-scanner scan --lockfile=package-lock.json
echo "All security scans passed."
