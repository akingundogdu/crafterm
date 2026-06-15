#!/usr/bin/env bash
#
# ios-worktree.sh — Build, install and launch an iOS app from the CURRENT git
# worktree under a per-worktree bundle identifier, so several feature worktrees
# can run side-by-side on one simulator (or device) without overwriting each
# other. Shipped inside Crafterm and driven by Settings → iOS Mobile Development.
#
# The per-worktree identity is applied purely via xcodebuild command-line build
# settings — no committed app source (pbxproj / xcconfig) is modified.
#
# Run from a worktree directory. Subcommands:
#   run       build + install + launch on a simulator (default)
#   device    same, on a connected physical device (-allowProvisioningUpdates)
#   status    list this repo's worktrees + installed variants on the booted sim
#   clean     uninstall this worktree's variant + remove its build/ directory
#
# Configuration comes from the environment (Crafterm exports the non-empty
# Settings values); every value is auto-detected when its variable is empty:
#   IOSWT_REPO_ROOT      main checkout path (source of files to copy)
#   IOSWT_PROJECT        .xcodeproj/.xcworkspace name or path
#   IOSWT_SCHEME         build scheme
#   IOSWT_BUNDLE_ID      base bundle identifier (suffix is appended per worktree)
#   IOSWT_DISPLAY_PREFIX home-screen name prefix
#   IOSWT_SIMULATOR      simulator name
#   IOSWT_COPY_FILES     ':'-separated gitignored files to seed into the worktree
#   IOSWT_WORKTREES_DIR  worktrees directory (informational)
#
set -euo pipefail

SUBCOMMAND="${1:-run}"

# --- Locate the worktree + main checkout ------------------------------------
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git worktree: $PWD"
  exit 1
fi
WORKTREE_ROOT="$(git rev-parse --show-toplevel)"
cd "$WORKTREE_ROOT"

MAIN_CHECKOUT="${IOSWT_REPO_ROOT:-}"
if [ -z "$MAIN_CHECKOUT" ]; then
  MAIN_CHECKOUT="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
fi

# --- Resolve the Xcode container (project vs workspace) ---------------------
CONTAINER="${IOSWT_PROJECT:-}"
if [ -z "$CONTAINER" ]; then
  CONTAINER="$(find . -maxdepth 2 -name '*.xcworkspace' -not -path '*/.*' 2>/dev/null | head -1)"
  [ -z "$CONTAINER" ] && CONTAINER="$(find . -maxdepth 2 -name '*.xcodeproj' -not -path '*/.*' 2>/dev/null | head -1)"
fi
if [ -z "$CONTAINER" ]; then
  echo "No .xcworkspace/.xcodeproj found. Set the project in Settings → iOS Mobile Development."
  exit 1
fi
case "$CONTAINER" in
  *.xcworkspace) CONTAINER_FLAG="-workspace" ;;
  *)            CONTAINER_FLAG="-project" ;;
esac

# --- Resolve scheme + base bundle id (cached; xcodebuild is slow) -----------
# Detection via xcodebuild -list / -showBuildSettings is slow, and `report` is
# polled for live status. Cache the resolved values in the shared .git dir,
# invalidated when the project's pbxproj changes, so polls stay cheap.
SCHEME="${IOSWT_SCHEME:-}"
BASE_BUNDLE_ID="${IOSWT_BUNDLE_ID:-}"
CACHE_FILE="$(git rev-parse --path-format=absolute --git-common-dir)/ioswt-cache"
PBXPROJ="$(find "$WORKTREE_ROOT" -maxdepth 3 -name project.pbxproj -not -path '*/.*' 2>/dev/null | head -1)"

if [ -z "$SCHEME" ] || [ -z "$BASE_BUNDLE_ID" ]; then
  if [ -f "$CACHE_FILE" ] && { [ -z "$PBXPROJ" ] || [ "$CACHE_FILE" -nt "$PBXPROJ" ]; }; then
    CACHED_SCHEME=""; CACHED_BASE=""
    # shellcheck disable=SC1090
    . "$CACHE_FILE" 2>/dev/null || true
    [ -z "$SCHEME" ] && SCHEME="$CACHED_SCHEME"
    [ -z "$BASE_BUNDLE_ID" ] && BASE_BUNDLE_ID="$CACHED_BASE"
  fi
fi

if [ -z "$SCHEME" ]; then
  SCHEME="$(xcodebuild "$CONTAINER_FLAG" "$CONTAINER" -list -json 2>/dev/null \
    | /usr/bin/python3 -c 'import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    sys.exit(0)
schemes=(d.get("workspace") or d.get("project") or {}).get("schemes") or []
print(schemes[0] if schemes else "")')"
fi
if [ -z "$SCHEME" ]; then
  echo "No scheme found. Set the scheme in this project's Settings → iOS tab."
  exit 1
fi

if [ -z "$BASE_BUNDLE_ID" ]; then
  BASE_BUNDLE_ID="$(xcodebuild "$CONTAINER_FLAG" "$CONTAINER" -scheme "$SCHEME" \
    -showBuildSettings 2>/dev/null \
    | awk -F' = ' '/ PRODUCT_BUNDLE_IDENTIFIER =/{print $2; exit}')"
fi
if [ -z "$BASE_BUNDLE_ID" ]; then
  echo "Could not resolve a base bundle identifier. Set it in this project's Settings → iOS tab."
  exit 1
fi
printf 'CACHED_SCHEME=%q\nCACHED_BASE=%q\n' "$SCHEME" "$BASE_BUNDLE_ID" > "$CACHE_FILE" 2>/dev/null || true
DISPLAY_PREFIX="${IOSWT_DISPLAY_PREFIX:-$SCHEME}"

# --- Per-worktree identity from the branch ----------------------------------
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
SUFFIX="$(printf '%s' "$BRANCH" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
if [ -z "$SUFFIX" ]; then
  echo "Could not derive a bundle suffix from branch '$BRANCH'."
  exit 1
fi
BUNDLE_ID="${BASE_BUNDLE_ID}.${SUFFIX}"
DISPLAY_NAME="${BRANCH##*/} ${DISPLAY_PREFIX}"
DERIVED_DATA="$WORKTREE_ROOT/build"

# To stderr so `report` keeps stdout as pure JSON; still visible in run/device panes.
echo "Worktree : $WORKTREE_ROOT" >&2
echo "Container: $CONTAINER ($SCHEME)" >&2
echo "Bundle ID: $BUNDLE_ID" >&2
echo "Name     : $DISPLAY_NAME" >&2

# --- Resolve a simulator UDID (by name, else booted, else first iPhone) ------
resolve_sim() {
  /usr/bin/python3 - "${IOSWT_SIMULATOR:-}" <<'PY'
import json, subprocess, sys
want = sys.argv[1]
data = json.loads(subprocess.check_output(["xcrun", "simctl", "list", "-j", "devices", "available"]))
devs = [d for lst in data["devices"].values() for d in lst if d.get("isAvailable", True)]
def pick():
    if want:
        return next((d for d in devs if d["name"] == want), None)
    booted = [d for d in devs if d.get("state") == "Booted"]
    if booted:
        return booted[0]
    iphones = [d for d in devs if d["name"].startswith("iPhone")]
    return iphones[0] if iphones else (devs[0] if devs else None)
d = pick()
if d:
    print(d["udid"])
PY
}

# --- Resolve a connected physical device UDID -------------------------------
# An explicit IOSWT_DEVICE_UDID (chosen from the Crafterm "Build & Run" picker)
# wins; otherwise fall back to the first reachable paired device.
resolve_device() {
  if [ -n "${IOSWT_DEVICE_UDID:-}" ]; then
    printf '%s' "$IOSWT_DEVICE_UDID"
    return
  fi
  local json udid
  json="$(mktemp -t ioswt-devices)"
  xcrun devicectl list devices --json-output "$json" >/dev/null 2>&1 || true
  udid="$(/usr/bin/python3 - "$json" <<'PY'
import json, sys
try:
    devices = json.load(open(sys.argv[1]))["result"]["devices"]
except Exception:
    sys.exit(0)
def reachable(d):
    cp = d.get("connectionProperties", {}); hw = d.get("hardwareProperties", {})
    return (hw.get("platform") == "iOS" and cp.get("pairingState") == "paired"
            and cp.get("tunnelState") != "unavailable")
cands = sorted((d for d in devices if reachable(d)),
               key=lambda d: 0 if d.get("connectionProperties", {}).get("tunnelState") == "connected" else 1)
if cands:
    print(cands[0]["hardwareProperties"]["udid"])
PY
)"
  rm -f "$json"
  printf '%s' "$udid"
}

# --- status / clean short-circuits ------------------------------------------
if [ "$SUBCOMMAND" = "status" ]; then
  echo "--- Worktrees ---"
  git worktree list
  SIM_UDID="$(resolve_sim)"
  if [ -n "$SIM_UDID" ]; then
    echo "--- Installed variants on simulator $SIM_UDID ---"
    xcrun simctl listapps "$SIM_UDID" 2>/dev/null \
      | grep -o "${BASE_BUNDLE_ID}[^\"]*" | sort -u || echo "(none)"
  fi
  exit 0
fi

if [ "$SUBCOMMAND" = "clean" ]; then
  SIM_UDID="$(resolve_sim)"
  [ -n "$SIM_UDID" ] && xcrun simctl uninstall "$SIM_UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  rm -rf "$DERIVED_DATA"
  echo "Cleaned $BUNDLE_ID and removed $DERIVED_DATA."
  exit 0
fi

if [ "$SUBCOMMAND" = "stop" ]; then
  SIM_UDID="$(resolve_sim)"
  [ -n "$SIM_UDID" ] && xcrun simctl terminate "$SIM_UDID" "$BUNDLE_ID" >/dev/null 2>&1 || true
  echo "Stopped $BUNDLE_ID."
  exit 0
fi

# Machine-readable status for the sidebar (one JSON object per call). Enumerates
# every worktree of this repo and reports each variant's built/installed/running
# state on the target simulator. Designed to be polled cheaply.
if [ "$SUBCOMMAND" = "report" ]; then
  SIM_UDID="$(resolve_sim)"
  INSTALLED=""; RUNNING=""
  if [ -n "$SIM_UDID" ]; then
    INSTALLED="$(xcrun simctl listapps "$SIM_UDID" 2>/dev/null \
      | grep -oE "${BASE_BUNDLE_ID//./\\.}[A-Za-z0-9._-]*" | sort -u || true)"
    RUNNING="$(xcrun simctl spawn "$SIM_UDID" launchctl list 2>/dev/null \
      | grep -oE "${BASE_BUNDLE_ID//./\\.}[A-Za-z0-9._-]*" | sort -u || true)"
  fi
  /usr/bin/python3 - "$BASE_BUNDLE_ID" "$DISPLAY_PREFIX" "$SIM_UDID" "$INSTALLED" "$RUNNING" "$SCHEME" <<'PY'
import sys, re, json, os, glob, subprocess
base, prefix, sim = sys.argv[1], sys.argv[2], sys.argv[3]
installed = set(sys.argv[4].split())
running = set(sys.argv[5].split())
scheme = sys.argv[6]
porcelain = subprocess.check_output(['git', 'worktree', 'list', '--porcelain']).decode()
entries, cur = [], {}
for line in porcelain.splitlines():
    if line.startswith('worktree '):
        if cur:
            entries.append(cur); cur = {}
        cur['path'] = line[len('worktree '):]
    elif line.startswith('branch '):
        cur['branch'] = line[len('branch '):].replace('refs/heads/', '')
    elif line.startswith('detached'):
        cur['branch'] = ''
if cur:
    entries.append(cur)
out = []
for e in entries:
    path = e.get('path', '')
    branch = e.get('branch', '') or os.path.basename(path)
    suffix = re.sub(r'-+$', '', re.sub(r'^-+', '', re.sub(r'[^a-z0-9]+', '-', branch.lower())))
    if not suffix:
        continue
    bundle = '%s.%s' % (base, suffix)
    built = bool(glob.glob(os.path.join(path, 'build', 'Build', 'Products', '*', '*.app')))
    out.append({
        'path': path, 'branch': branch, 'bundleId': bundle,
        'displayName': '%s %s' % (branch.split('/')[-1], prefix),
        'built': built, 'installed': bundle in installed, 'running': bundle in running
    })
print(json.dumps({'simUdid': sim, 'baseBundleId': base, 'scheme': scheme, 'worktrees': out}))
PY
  exit 0
fi

# --- Bootstrap: seed gitignored files into a fresh worktree -----------------
if [ -n "${IOSWT_COPY_FILES:-}" ]; then
  OLD_IFS="$IFS"; IFS=':'
  for rel in $IOSWT_COPY_FILES; do
    [ -z "$rel" ] && continue
    if [ ! -e "$WORKTREE_ROOT/$rel" ] && [ -e "$MAIN_CHECKOUT/$rel" ]; then
      mkdir -p "$WORKTREE_ROOT/$(dirname "$rel")"
      cp "$MAIN_CHECKOUT/$rel" "$WORKTREE_ROOT/$rel"
      echo "Copied $rel from main checkout."
    fi
  done
  IFS="$OLD_IFS"
fi

# Seed a real *.xcconfig from its committed *.xcconfig.template when the
# gitignored file is missing in a fresh worktree (e.g. Secrets.xcconfig — the
# template is committed, the real file isn't). todo16.
while IFS= read -r tmpl; do
  [ -z "$tmpl" ] && continue
  target="${tmpl%.template}"
  if [ ! -e "$target" ]; then
    cp "$tmpl" "$target"
    echo "Created $(basename "$target") from $(basename "$tmpl")."
  fi
done < <(find "$WORKTREE_ROOT" -maxdepth 3 -name '*.xcconfig.template' -not -path '*/.*' 2>/dev/null)

# --- Resolve target + destination -------------------------------------------
DEVICE_UDID=""
SIM_UDID=""
EXTRA_FLAGS=()
if [ "$SUBCOMMAND" = "device" ]; then
  DEVICE_UDID="$(resolve_device)"
  if [ -z "$DEVICE_UDID" ]; then
    echo "No usable iOS device found. Connect an unlocked, paired device and trust this Mac."
    exit 1
  fi
  echo "Device   : $DEVICE_UDID"
  DESTINATION="id=$DEVICE_UDID"
  EXTRA_FLAGS=(-allowProvisioningUpdates)
else
  SIM_UDID="$(resolve_sim)"
  if [ -z "$SIM_UDID" ]; then
    echo "No simulator found. Set one in Settings → iOS Mobile Development."
    exit 1
  fi
  echo "Simulator: $SIM_UDID"
  xcrun simctl boot "$SIM_UDID" >/dev/null 2>&1 || true
  xcrun simctl bootstatus "$SIM_UDID" >/dev/null 2>&1 || true
  open -a Simulator >/dev/null 2>&1 || true
  DESTINATION="platform=iOS Simulator,id=$SIM_UDID"
fi

# --- Build (isolated DerivedData + per-worktree identity overrides) ---------
# Share the Swift Package clone cache across this repo's worktrees so each one
# doesn't re-download SPM dependencies (todo24). Lives beside the checkouts.
SHARED_SPM="${IOSWT_SPM_CACHE:-$(dirname "$MAIN_CHECKOUT")/.crafterm-spm-cache}"
mkdir -p "$SHARED_SPM" 2>/dev/null || true
BUILD_SETTINGS=(
  "PRODUCT_BUNDLE_IDENTIFIER=$BUNDLE_ID"
  "INFOPLIST_KEY_CFBundleDisplayName=$DISPLAY_NAME"
)
echo "Building..."
xcodebuild "$CONTAINER_FLAG" "$CONTAINER" -scheme "$SCHEME" \
  -destination "$DESTINATION" \
  -derivedDataPath "$DERIVED_DATA" \
  -clonedSourcePackagesDirPath "$SHARED_SPM" \
  ${EXTRA_FLAGS[@]+"${EXTRA_FLAGS[@]}"} \
  "${BUILD_SETTINGS[@]}" \
  build

# --- Resolve the freshly built .app path ------------------------------------
APP_PATH="$(
  xcodebuild "$CONTAINER_FLAG" "$CONTAINER" -scheme "$SCHEME" \
    -destination "$DESTINATION" -derivedDataPath "$DERIVED_DATA" \
    -clonedSourcePackagesDirPath "$SHARED_SPM" \
    "${BUILD_SETTINGS[@]}" -showBuildSettings 2>/dev/null \
    | awk -F' = ' '/ BUILT_PRODUCTS_DIR =/{d=$2} / FULL_PRODUCT_NAME =/{n=$2} END{print d"/"n}'
)"
echo "App      : $APP_PATH"

# --- Install + launch -------------------------------------------------------
if [ "$SUBCOMMAND" = "device" ]; then
  echo "Installing on device..."
  xcrun devicectl device install app --device "$DEVICE_UDID" "$APP_PATH"
  echo "Launching..."
  xcrun devicectl device process launch --device "$DEVICE_UDID" "$BUNDLE_ID"
else
  echo "Installing on simulator..."
  xcrun simctl install "$SIM_UDID" "$APP_PATH"
  echo "Launching..."
  xcrun simctl launch --console "$SIM_UDID" "$BUNDLE_ID"
fi

echo "Done: $BUNDLE_ID"
