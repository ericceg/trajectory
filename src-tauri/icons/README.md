# App icons

The SVG files are the editable masters; the six PNG, ICNS, and ICO exports are
used by `src-tauri/tauri.conf.json` for desktop and installer icons.

When updating the artwork, preserve the simplified drawing at small sizes and
include the platform icon layers. Rebuild the app to apply the updated exports.

The macOS icon adds transparent padding so the tile occupies 824px of a 1024px
canvas. Regenerate it on macOS with `npm run icons:macos`; this preserves the
simplified artwork at small sizes. Other platform exports use the unpadded
masters.
