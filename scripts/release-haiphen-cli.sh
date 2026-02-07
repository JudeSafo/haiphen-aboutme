#!/usr/bin/env bash
set -euo pipefail

LOG="[release-haiphen-cli]"
say() { printf "%s %s\n" "$LOG" "$*"; }
die() { printf "%s ERROR: %s\n" "$LOG" "$*" >&2; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 || die "Missing dependency: $1"
}

# ---- config (override via env) ----
MONOREPO_DIR="${MONOREPO_DIR:-/Users/jks142857/Desktop/haiphen-aboutme}"
CLI_PREFIX="${CLI_PREFIX:-haiphen-cli}"                    # subtree prefix in monorepo
CLI_REMOTE="${CLI_REMOTE:-haiphen-cli}"                    # git remote name in monorepo for JudeSafo/haiphen-cli
CLI_REPO_SSH="${CLI_REPO_SSH:-git@github.com:JudeSafo/haiphen-cli.git}"
CLI_DEFAULT_BRANCH="${CLI_DEFAULT_BRANCH:-main}"

TAP_REPO_DIR="${TAP_REPO_DIR:-/tmp/homebrew-tap}"          # local clone path to tap repo
TAP_REPO_SSH="${TAP_REPO_SSH:-git@github.com:JudeSafo/homebrew-tap.git}"
TAP_FORMULA_PATH="${TAP_FORMULA_PATH:-Formula/haiphen.rb}"

FORMULA_NAME="${FORMULA_NAME:-haiphen}"

# If true, create a GH release with binaries and use release URLs in the formula.
# If false, formula will use source tarball URL.
PUBLISH_BINARIES="${PUBLISH_BINARIES:-1}"

# ---- args ----
usage() {
  cat <<EOF
Usage: $0 <version>

Example:
  $0 0.1.1

Env overrides:
  MONOREPO_DIR, CLI_PREFIX, CLI_REMOTE, CLI_REPO_SSH, CLI_DEFAULT_BRANCH
  TAP_REPO_DIR, TAP_REPO_SSH, TAP_FORMULA_PATH, FORMULA_NAME
  PUBLISH_BINARIES=0|1
EOF
}

VERSION="${1:-}"
[[ -n "$VERSION" ]] || { usage; exit 2; }

TAG="v$VERSION"
SRC_URL="https://github.com/JudeSafo/haiphen-cli/archive/refs/tags/${TAG}.tar.gz"

# ---- preflight ----
require git
require gh
require go
require shasum
require curl
require perl
require tar
require brew

say "Version: $VERSION (tag: $TAG)"
say "Monorepo: $MONOREPO_DIR"
say "Tap repo: $TAP_REPO_DIR"

# ---- ensure gh auth ----
gh auth status >/dev/null 2>&1 || die "gh not authenticated"

# ---- ensure tap repo exists locally ----
if [[ ! -d "$TAP_REPO_DIR/.git" ]]; then
  say "Cloning tap repo -> $TAP_REPO_DIR"
  rm -rf "$TAP_REPO_DIR"
  git clone "$TAP_REPO_SSH" "$TAP_REPO_DIR"
fi

# ---- operate inside monorepo ----
cd "$MONOREPO_DIR"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "Not a git repo: $MONOREPO_DIR"

# Ensure CLI prefix exists and is clean (only subtree scope must be clean)
[[ -d "$CLI_PREFIX" ]] || die "Missing prefix dir: $CLI_PREFIX"
if [[ -n "$(git status --porcelain=v1 --untracked-files=all "$CLI_PREFIX")" ]]; then
  die "Working tree under $CLI_PREFIX is not clean. Commit or stash first."
fi

# Ensure remote exists
if ! git remote get-url "$CLI_REMOTE" >/dev/null 2>&1; then
  say "Adding remote $CLI_REMOTE -> $CLI_REPO_SSH"
  git remote add "$CLI_REMOTE" "$CLI_REPO_SSH"
fi

# Ensure tag does not already exist remotely
if git ls-remote --tags "$CLI_REMOTE" | grep -q "refs/tags/${TAG}\$"; then
  die "Tag already exists on remote: $TAG"
fi

# ---- subtree split & push ----
SPLIT_BRANCH="split/${FORMULA_NAME}-${TAG}"
say "Creating subtree split branch: $SPLIT_BRANCH"
git subtree split --prefix="$CLI_PREFIX" -b "$SPLIT_BRANCH" >/dev/null

say "Pushing split -> ${CLI_REMOTE}/${CLI_DEFAULT_BRANCH}"
git push "$CLI_REMOTE" "$SPLIT_BRANCH:$CLI_DEFAULT_BRANCH"

say "Tagging split commit as $TAG"
git tag -a "$TAG" "$SPLIT_BRANCH" -m "${FORMULA_NAME} ${TAG}"
git push "$CLI_REMOTE" "$TAG"

# Get split commit SHA
SPLIT_SHA="$(git rev-parse "$SPLIT_BRANCH")"
say "Split SHA: $SPLIT_SHA"

# ---- optional: publish binaries + GH release ----
RELEASE_URL_DARWIN_ARM64=""
RELEASE_URL_DARWIN_AMD64=""
RELEASE_URL_LINUX_AMD64=""
SHA_DARWIN_ARM64=""
SHA_DARWIN_AMD64=""
SHA_LINUX_AMD64=""

if [[ "$PUBLISH_BINARIES" == "1" ]]; then
  say "Building release artifacts"
  WORK="/tmp/haiphen-cli-release-$VERSION"
  rm -rf "$WORK"
  mkdir -p "$WORK"
  git clone "$CLI_REPO_SSH" "$WORK/repo" >/dev/null
  cd "$WORK/repo"
  git checkout "$TAG" >/dev/null

  mkdir -p dist
  # macOS arm64
  GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags="-s -w" -o dist/haiphen ./cmd/haiphen
  (cd dist && tar -czf "haiphen_${VERSION}_darwin_arm64.tar.gz" haiphen)
  rm -f dist/haiphen

  # macOS amd64
  GOOS=darwin GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o dist/haiphen ./cmd/haiphen
  (cd dist && tar -czf "haiphen_${VERSION}_darwin_amd64.tar.gz" haiphen)
  rm -f dist/haiphen

  # linux amd64 (optional but useful)
  GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o dist/haiphen ./cmd/haiphen
  (cd dist && tar -czf "haiphen_${VERSION}_linux_amd64.tar.gz" haiphen)
  rm -f dist/haiphen

  SHA_DARWIN_ARM64="$(shasum -a 256 "dist/haiphen_${VERSION}_darwin_arm64.tar.gz" | awk '{print $1}')"
  SHA_DARWIN_AMD64="$(shasum -a 256 "dist/haiphen_${VERSION}_darwin_amd64.tar.gz" | awk '{print $1}')"
  SHA_LINUX_AMD64="$(shasum -a 256 "dist/haiphen_${VERSION}_linux_amd64.tar.gz" | awk '{print $1}')"

  say "SHA darwin arm64: $SHA_DARWIN_ARM64"
  say "SHA darwin amd64: $SHA_DARWIN_AMD64"
  say "SHA linux  amd64: $SHA_LINUX_AMD64"

  say "Creating/Updating GitHub release $TAG"
  # create release (idempotent-ish: if exists, upload will fail unless --clobber; we use --clobber)
  gh release view "$TAG" -R JudeSafo/haiphen-cli >/dev/null 2>&1 || \
    gh release create "$TAG" -R JudeSafo/haiphen-cli --title "$TAG" --notes "Release $TAG" >/dev/null

  gh release upload "$TAG" -R JudeSafo/haiphen-cli --clobber \
    "dist/haiphen_${VERSION}_darwin_arm64.tar.gz" \
    "dist/haiphen_${VERSION}_darwin_amd64.tar.gz" \
    "dist/haiphen_${VERSION}_linux_amd64.tar.gz" >/dev/null

  RELEASE_URL_DARWIN_ARM64="https://github.com/JudeSafo/haiphen-cli/releases/download/${TAG}/haiphen_${VERSION}_darwin_arm64.tar.gz"
  RELEASE_URL_DARWIN_AMD64="https://github.com/JudeSafo/haiphen-cli/releases/download/${TAG}/haiphen_${VERSION}_darwin_amd64.tar.gz"
  RELEASE_URL_LINUX_AMD64="https://github.com/JudeSafo/haiphen-cli/releases/download/${TAG}/haiphen_${VERSION}_linux_amd64.tar.gz"

  cd "$MONOREPO_DIR"
else
  say "Skipping binary publish; formula will build from source tarball"
fi

# ---- compute source tarball sha (always) ----
say "Fetching source tarball to compute sha256: $SRC_URL"
TARBALL="/tmp/haiphen-cli-${TAG}.tar.gz"
rm -f "$TARBALL"
curl -fsSL -L "$SRC_URL" -o "$TARBALL"
SRC_SHA="$(shasum -a 256 "$TARBALL" | awk '{print $1}')"
say "Source sha256: $SRC_SHA"

# ---- update tap formula ----
cd "$TAP_REPO_DIR"

[[ -f "$TAP_FORMULA_PATH" ]] || die "Missing formula: $TAP_REPO_DIR/$TAP_FORMULA_PATH"

say "Updating formula version/sha/url in $TAP_FORMULA_PATH"

# Strategy:
# - if PUBLISH_BINARIES=1: rewrite formula to use release assets per-arch
# - else: update url+sha256 to the source tarball

if [[ "$PUBLISH_BINARIES" == "1" ]]; then
  cat > "$TAP_FORMULA_PATH" <<RUBY
class Haiphen < Formula
  desc "Local gateway + CLI for Haiphen"
  homepage "https://github.com/JudeSafo/haiphen-cli"
  version "${VERSION}"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "${RELEASE_URL_DARWIN_ARM64}"
      sha256 "${SHA_DARWIN_ARM64}"
    else
      url "${RELEASE_URL_DARWIN_AMD64}"
      sha256 "${SHA_DARWIN_AMD64}"
    end
  end

  on_linux do
    url "${RELEASE_URL_LINUX_AMD64}"
    sha256 "${SHA_LINUX_AMD64}"
  end

  def install
    bin.install Dir["haiphen"].first => "haiphen"
  end

  test do
    assert_match "Haiphen", shell_output("#{bin}/haiphen --help")
  end
end
RUBY
else
  # patch in place for source tarball formula
  perl -0777 -i -pe "s|^\\s*url\\s+\"[^\"]+\"\\s*\$|  url \"${SRC_URL}\"|m" "$TAP_FORMULA_PATH"
  perl -0777 -i -pe "s|^\\s*sha256\\s+\"[^\"]+\"\\s*\$|  sha256 \"${SRC_SHA}\"|m" "$TAP_FORMULA_PATH"
fi

git add "$TAP_FORMULA_PATH"

if git diff --cached --quiet; then
  die "No changes staged in tap formula; refusing to continue."
fi

git commit -m "${FORMULA_NAME}: ${TAG}" >/dev/null
git push origin HEAD >/dev/null

say "Running brew audit (strict/online) for the tap formula"
brew audit --strict --online "JudeSafo/tap/${FORMULA_NAME}"

say "Done."
say "Next:"
say "  brew update"
say "  brew upgrade ${FORMULA_NAME}   # or brew reinstall ${FORMULA_NAME}"
say "  ${FORMULA_NAME} --help"