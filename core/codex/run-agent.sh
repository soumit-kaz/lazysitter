#!/usr/bin/env bash
# AET agent runner (Codex adapter).
# Launches ONE context-isolated `codex exec` for a single AET agent, so that
# no agent shares context with another. The orchestrator skill calls this once
# per agent it spawns.
#
# Usage: ./run-agent.sh <agent-name> <inputs-file> <output-file>
#   <agent-name>   e.g. aet-architect  (matches agents/<name>.md + agents/<name>.meta)
#   <inputs-file>  file containing the inputs this agent is permitted to see
#   <output-file>  receives the agent's final report (via codex --output-last-message)
#
# Env:
#   AET_AUTO_GIT=1   downgrade on-request approval to `never` (headless auto-merge)
#   AET_DRY_PRINT=1  print the resolved codex command instead of running it
set -euo pipefail

AGENT="${1:?usage: run-agent.sh <agent-name> <inputs-file> <output-file>}"
INPUTS="${2:?missing <inputs-file>}"
OUT="${3:?missing <output-file>}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROLE="$DIR/agents/$AGENT.md"
META="$DIR/agents/$AGENT.meta"

[ -f "$ROLE" ] || { echo "aet: unknown agent '$AGENT' (no $ROLE)" >&2; exit 2; }
[ -f "$META" ] || { echo "aet: missing meta for '$AGENT' ($META)" >&2; exit 2; }
[ -f "$INPUTS" ] || { echo "aet: inputs file not found: $INPUTS" >&2; exit 2; }

# Defaults, then overridden by the generated meta file.
SANDBOX="read-only"; APPROVAL="never"; TIER="mid"; DISTINCT_MODEL="0"
# shellcheck disable=SC1090
source "$META"

# Model slugs (user-editable). Blank => omit -m and use Codex's default model.
MODEL_HIGH=""; MODEL_HIGH_ALT=""; MODEL_MID=""; MODEL_LOW=""
[ -f "$DIR/models.env" ] && { # shellcheck disable=SC1091
  source "$DIR/models.env"; }

case "$TIER" in
  high) MODEL="$MODEL_HIGH" ;;
  mid)  MODEL="$MODEL_MID" ;;
  low)  MODEL="$MODEL_LOW" ;;
  *)    MODEL="" ;;
esac
if [ "${DISTINCT_MODEL:-0}" = "1" ]; then
  MODEL="${MODEL_HIGH_ALT:-$MODEL_HIGH}"
fi

# Headless auto-merge: git-mutating agents can't answer an interactive approval.
if [ "$APPROVAL" = "on-request" ] && [ "${AET_AUTO_GIT:-0}" = "1" ]; then
  APPROVAL="never"
fi

ARGS=( exec --sandbox "$SANDBOX" --ask-for-approval "$APPROVAL" --skip-git-repo-check --output-last-message "$OUT" )
[ -n "$MODEL" ] && ARGS+=( --model "$MODEL" )

# Compose the full prompt: role system-prompt + the task inputs, on stdin.
PROMPT="$(cat "$ROLE"; printf '\n\n---\n\n# YOUR TASK INPUTS\n\n'; cat "$INPUTS")"

if [ "${AET_DRY_PRINT:-0}" = "1" ]; then
  printf 'codex'; printf ' %q' "${ARGS[@]}" -; printf '\n'
  exit 0
fi

printf '%s' "$PROMPT" | codex "${ARGS[@]}" -
