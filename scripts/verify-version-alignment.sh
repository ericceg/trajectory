#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <version>" >&2
  exit 1
fi

expected_version="$1"
package_version="$(node -p "require('./package.json').version")"
tauri_version="$(node -p "require('./src-tauri/tauri.conf.json').version")"
cargo_version="$(sed -n 's/^version = "\(.*\)"/\1/p' src-tauri/Cargo.toml | head -n 1)"

if [[ "$expected_version" != "$package_version" ]] || [[ "$expected_version" != "$tauri_version" ]] || [[ "$expected_version" != "$cargo_version" ]]; then
  echo "Version mismatch detected." >&2
  echo "Expected: $expected_version" >&2
  echo "package.json: $package_version" >&2
  echo "src-tauri/tauri.conf.json: $tauri_version" >&2
  echo "src-tauri/Cargo.toml: $cargo_version" >&2
  exit 1
fi
