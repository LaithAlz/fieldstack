#!/usr/bin/env bash
# Set up labels, milestones, F0 standards doc, and one GitHub issue per
# ISSUE-FX.Y entry in fieldstack-app/docs/fieldstack-issues.md.
#
# Idempotent: re-running skips existing issues, updates labels in place,
# and re-checks milestones. Standards doc is regenerated each run from the
# source doc — edit the F0 section in fieldstack-issues.md, not the output.
#
# Usage:
#   scripts/setup-github-issues.sh
#
# Env overrides:
#   ISSUES_DOC     — path to issues markdown    (default: fieldstack-app/docs/fieldstack-issues.md)
#   STANDARDS_OUT  — path to standards markdown (default: fieldstack-app/docs/standards.md)

set -euo pipefail

ISSUES_DOC="${ISSUES_DOC:-fieldstack-app/docs/fieldstack-issues.md}"
STANDARDS_OUT="${STANDARDS_OUT:-fieldstack-app/docs/standards.md}"

if [[ ! -f "$ISSUES_DOC" ]]; then
  echo "Issues doc not found: $ISSUES_DOC" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Auth
# ---------------------------------------------------------------------------
echo "==> Verifying gh auth"
gh auth status >/dev/null

REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
echo "    repo: $REPO"

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

# ---------------------------------------------------------------------------
# 2. Labels (idempotent via --force, which creates or updates)
# ---------------------------------------------------------------------------
echo "==> Labels"
ensure_label() {
  local name=$1 color=$2 desc=$3
  gh label create "$name" --description "$desc" --color "$color" --force >/dev/null
  printf "    %s\n" "$name"
}

ensure_label "phase:f1"        "5319E7" "F1 — project setup"
ensure_label "phase:f2"        "0052CC" "F2 — venue list"
ensure_label "phase:f3"        "0E8A16" "F3 — venue detail"
ensure_label "phase:f4"        "FBCA04" "F4 — field search"
ensure_label "phase:f5"        "D93F0B" "F5 — field detail + map"
ensure_label "type:setup"      "C2E0C6" "Project scaffolding / build infra"
ensure_label "type:screen"     "C5DEF5" "Screen-level work"
ensure_label "type:component"  "BFD4F2" "Shared UI component"
ensure_label "type:hook"       "FEF2C0" "Custom React hook"
ensure_label "type:foundation" "F9D0C4" "Tokens, types, API client"
ensure_label "priority:p1"     "B60205" "Must-have for v1"
ensure_label "priority:p2"     "FBCA04" "Nice-to-have"
ensure_label "v2-deferred"     "EEEEEE" "Deferred to v2"

# ---------------------------------------------------------------------------
# 3. Milestones (idempotent via existence check)
# ---------------------------------------------------------------------------
echo "==> Milestones"
ensure_milestone() {
  local title=$1
  local existing
  existing=$(gh api "repos/$REPO/milestones?state=all" \
    --jq ".[] | select(.title == \"$title\") | .number" 2>/dev/null || true)
  if [[ -z "$existing" ]]; then
    gh api -X POST "repos/$REPO/milestones" -f title="$title" >/dev/null
    printf "    + %s\n" "$title"
  else
    printf "    = %s (exists)\n" "$title"
  fi
}

ensure_milestone "F1"
ensure_milestone "F2"
ensure_milestone "F3"
ensure_milestone "F4"
ensure_milestone "F5"

# ---------------------------------------------------------------------------
# 4. F0 cross-cutting → standards.md (always regenerated from issues doc)
# ---------------------------------------------------------------------------
echo "==> Writing $STANDARDS_OUT"
mkdir -p "$(dirname "$STANDARDS_OUT")"
{
  printf "# FieldStack — Engineering standards\n\n"
  printf "Cross-cutting requirements that every screen and component must satisfy. Issue bodies link here rather than duplicating these.\n\n"
  printf "_Generated from %s — edit the F0 section there, not this file._\n\n" "$ISSUES_DOC"
  awk '
    /^# F0 — Cross-cutting/{flag=1; next}
    /^# F1 —/{flag=0}
    flag {print}
  ' "$ISSUES_DOC"
} > "$STANDARDS_OUT"

STANDARDS_LINK="https://github.com/$REPO/blob/main/$STANDARDS_OUT"

# ---------------------------------------------------------------------------
# 5. Issues — split doc by `## ISSUE-` and create one per chunk
# ---------------------------------------------------------------------------
echo "==> Issues"

awk -v dir="$WORKDIR" '
  /^## ISSUE-/{
    if (out) close(out)
    match($0, /ISSUE-(F[0-9]+\.[0-9]+)/, m)
    out = dir "/" m[1] ".md"
  }
  /^# Build order$/{
    if (out) close(out)
    out = ""
    exit
  }
  out {print > out}
' "$ISSUES_DOC"

issue_exists() {
  local title=$1
  gh issue list --state all --limit 200 --json title --jq '.[].title' \
    | grep -Fxq "$title"
}

create_issue() {
  local id=$1 chunk=$2

  local first_line short_id story_name title labels_line labels milestone body_file
  first_line=$(head -1 "$chunk")
  short_id=$(sed -E 's/^## ISSUE-(F[0-9]+\.[0-9]+).*/\1/' <<< "$first_line")
  story_name=$(sed -E 's/^## ISSUE-F[0-9]+\.[0-9]+ — //' <<< "$first_line")
  title="[$short_id] $story_name"

  labels_line=$(grep -m1 '^\*\*Labels:\*\*' "$chunk")
  labels=$(sed -E 's/^\*\*Labels:\*\* *//; s/`//g; s/, /,/g' <<< "$labels_line")

  milestone=$(grep -m1 '^\*\*Milestone:\*\*' "$chunk" \
    | sed -E 's/^\*\*Milestone:\*\* *//')

  body_file="$WORKDIR/$id.body.md"
  awk '
    /^\*\*Milestone:\*\*/{found=1; next}
    found {print}
  ' "$chunk" > "$body_file"

  # Strip trailing `---` separator lines, then append standards link.
  {
    sed -E '/^---[[:space:]]*$/d' "$body_file"
    printf "\n---\n\n"
    printf "_See [engineering standards](%s) for cross-cutting requirements._\n" "$STANDARDS_LINK"
  } > "$body_file.tmp" && mv "$body_file.tmp" "$body_file"

  if issue_exists "$title"; then
    printf "    = %s\n" "$title"
    return
  fi
  gh issue create \
    --title "$title" \
    --milestone "$milestone" \
    --label "$labels" \
    --body-file "$body_file" >/dev/null
  printf "    + %s\n" "$title"
}

shopt -s nullglob
for chunk in "$WORKDIR"/F[0-9]*.md; do
  [[ "$chunk" == *.body.md ]] && continue
  id=$(basename "$chunk" .md)
  create_issue "$id" "$chunk"
done

# ---------------------------------------------------------------------------
# 6. Summary
# ---------------------------------------------------------------------------
echo
echo "==> Summary"
gh issue list --limit 200 --state all --json milestone --jq '
  group_by(.milestone.title // "(none)")
  | map({milestone: .[0].milestone.title // "(none)", count: length})
  | sort_by(.milestone)
  | .[]
  | "    \(.milestone): \(.count) issues"
' | tr -d '"'

total=$(gh issue list --limit 200 --state all --json number --jq 'length')
echo "    Total: $total issues"
echo "==> Done"
