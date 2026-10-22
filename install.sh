#!/usr/bin/env bash
# Fallback installer: symlink skills and agents into ~/.claude (bare command names).
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: install.sh [--dry-run] [--force] [--uninstall] [-h|--help]

Symlinks skills/<name> and agents/<name>.md from this repo into $CLAUDE_HOME
(default: $HOME/.claude).

  --dry-run    print actions, change nothing
  --force      move a conflicting path to <path>.bak-<timestamp> first
  --uninstall  remove only symlinks that point into this repo
  -h, --help   show this help
USAGE
}

dry=0
force=0
uninstall=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry=1 ;;
    --force) force=1 ;;
    --uninstall) uninstall=1 ;;
    -h | --help) usage; exit 0 ;;
    *) echo "unknown option: $arg" >&2; usage >&2; exit 2 ;;
  esac
done

resolve_dir() {
  local src="$1" dir
  while [ -L "$src" ]; do
    dir="$(cd -P "$(dirname "$src")" && pwd)"
    src="$(readlink "$src")"
    case "$src" in /*) ;; *) src="$dir/$src" ;; esac
  done
  cd -P "$(dirname "$src")" && pwd
}

repo="$(resolve_dir "${BASH_SOURCE[0]}")"
claude_home="${CLAUDE_HOME:-$HOME/.claude}"
stamp="$(date +%Y%m%d%H%M%S)"

installed=0
ok=0
skipped=0
removed=0
conflicts=()
pairs=()

for dir in "$repo"/skills/*/; do
  [ -d "$dir" ] || continue
  name="$(basename "$dir")"
  pairs+=("$repo/skills/$name|$claude_home/skills/$name")
done
for file in "$repo"/agents/*.md; do
  [ -f "$file" ] || continue
  name="$(basename "$file")"
  pairs+=("$repo/agents/$name|$claude_home/agents/$name")
done

run() {
  if [ "$dry" -eq 1 ]; then
    echo "dry-run: $*"
  else
    "$@"
  fi
}

points_into_repo() {
  local target
  target="$(readlink "$1")"
  case "$target" in "$repo"/*) return 0 ;; *) return 1 ;; esac
}

if [ "$uninstall" -eq 1 ]; then
  for pair in "${pairs[@]}"; do
    dest="${pair#*|}"
    if [ -L "$dest" ] && points_into_repo "$dest"; then
      echo "remove: $dest"
      run rm "$dest"
      removed=$((removed + 1))
    else
      skipped=$((skipped + 1))
    fi
  done
  echo "uninstall: removed=$removed skipped=$skipped"
  exit 0
fi

for pair in "${pairs[@]}"; do
  src="${pair%%|*}"
  dest="${pair#*|}"
  if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$src" ]; then
    echo "ok: $dest"
    ok=$((ok + 1))
  elif [ -e "$dest" ] || [ -L "$dest" ]; then
    if [ "$force" -eq 1 ]; then
      echo "backup: $dest -> $dest.bak-$stamp"
      run mv "$dest" "$dest.bak-$stamp"
    else
      conflicts+=("$dest")
    fi
  fi
done

if [ "${#conflicts[@]}" -gt 0 ]; then
  echo "conflicts (existing files or links elsewhere); rerun with --force to back them up:" >&2
  for item in "${conflicts[@]}"; do echo "  $item" >&2; done
  exit 1
fi

run mkdir -p "$claude_home/skills" "$claude_home/agents"

for pair in "${pairs[@]}"; do
  src="${pair%%|*}"
  dest="${pair#*|}"
  if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$src" ]; then
    continue
  fi
  echo "link: $dest -> $src"
  run ln -s "$src" "$dest"
  installed=$((installed + 1))
done

echo "summary: installed=$installed ok=$ok skipped=$skipped"
echo "Installed as personal skills: use /start, /feature, /adopt (bare names). Do not also install the plugin, or you get duplicates."

plugins_file="$HOME/.claude/plugins/installed_plugins.json"
if [ -f "$plugins_file" ] && grep -q 'agents@team' "$plugins_file"; then
  echo "warning: the plugin agents@team is also installed; uninstall it to avoid duplicate commands." >&2
fi
