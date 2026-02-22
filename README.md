# Trajectory

Trajectory is a macOS-first desktop app for local TCX activity analysis.
It is inspired by Strava-style training dashboards, but runs fully offline: no server, no cloud sync, no account required.

## Status

Prototype (actively evolving).

## Highlights

- Local-only app (Tauri + Rust + React)
- Import an existing folder of `.tcx` files (optionally recursive)
- Incremental rescans using file path + mtime + size
- Normal rescans prune deleted files from the database cache
- Optional "Clear Cache + Full Rescan" for a full rebuild from disk
- Background parsing with progress events
- Route-level lazy loading for faster initial app startup
- Workout category derivation (`Running`, `Biking`, `Strength`, etc.) from TCX sport + notes
- Single visible workout category in UI (used for filtering)
- Activities filters auto-apply on change (no Apply button)
- Light mode by default with optional dark mode toggle in Settings
- Dashboard with a drill-down training calendar (year view -> month view -> activity links)
- Calendar bars can switch between hours, kilometers, and activity count
- Hovering month or year bars uses horizontal cursor position (full-height hit area) and highlights the corresponding calendar day/month workout context with a quick pop animation
- Filterable/sortable activities table
- Active sort direction indicators (`▲`/`▼`) in activities table headers
- In-memory activities list caching for snappy return navigation (no refetch unless filters/data change)
- Activity detail with metrics, route map, and charts
- Continuous, Google Maps-style smooth zooming/panning on map views
- Toggling "Reduced complexity" preserves the current map viewport (pan/zoom)
- Map views support in-place maximize/minimize (with `Esc` to close expanded view)
- Global path-based heatmap page that overlays all matching GPS tracks
- Heatmap filters for time span (presets + custom), category, and sport type
- "Reduced complexity" toggle on map views for a grayscale, lower-noise basemap with stronger route contrast
- Map controls (including reduced-complexity toggles/legend) are overlaid on maps so they remain visible in maximized map mode

## Tech Stack

- Shell: Tauri v2
- Backend: Rust, `quick-xml`, `rusqlite`, `chrono`, `serde`
- Frontend: React + TypeScript + Vite + TailwindCSS
- UI/Data libs: React Router, Zustand, TanStack Table, Recharts, date-fns, MapLibre GL JS
- Storage: SQLite + JSON settings in OS app data/config directories

## Quick Start

### Prerequisites

- Node.js 22+
- Rust stable toolchain
- Xcode Command Line Tools (macOS)

### Run in Development

```bash
npm install
npm run tauri dev
```

## Usage

1. Launch Trajectory.
2. On first launch, select an existing import folder containing `.tcx` files.
3. After selecting a folder (and on every app startup), Trajectory automatically runs a background scan.
4. Open **Settings** any time to run:
   - **Rescan** for a normal incremental pass.
   - **Clear Cache + Full Rescan** when you want to wipe cached activities and re-import everything.
5. Explore:
   - **Dashboard** for yearly calendar overview, month drill-down, and clickable activity entries
   - Use dashboard arrows to move between years/months and click metric cards to switch bar mode (hours/km/activities)
   - In month view, move horizontally across daily bars to see a quick popover and auto-highlight the corresponding workout day and all visible workout cards
   - In year view, move horizontally across weekly bars to preview that week and auto-highlight all matching days in that week across month/day mini-bars
   - **Activities** for filtering/sorting workouts (category + distance filters auto-apply)
   - **Heatmap** for a global path heatmap (overlapping GPS tracks; filter by time span/category/sport)
   - Enable **Reduced complexity (grayscale)** in Heatmap to declutter the map and emphasize route overlap
   - **Activity Detail** for metrics/map/charts
   - Use the **Maximize** button on maps (Route + Heatmap) to expand them, then press **Esc** or **Minimize** to close


## Build

```bash
npm run tauri build
```

Expected macOS artifacts are generated under `src-tauri/target/release/bundle/`, including:

- `.app`
- `.dmg`

## App Icons

For this macOS-first prototype, keep exactly one icon file in `src-tauri/icons/`:

- `icon.png` (used for app/runtime icon and bundle icon source)

If you replace the icon, keep it as a single square PNG in that same path.

## Release Process

A GitHub Actions workflow builds and publishes macOS artifacts on version tags (`v*`).

Workflow file: `.github/workflows/release.yml`

Release guardrails:
- The pushed tag version must match all of:
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- The workflow must successfully generate both:
  - `.app` bundle
  - `.dmg` installer
- The workflow requires macOS signing/notarization secrets so release builds are trusted by Gatekeeper.

Required GitHub secrets for signed/notarized macOS releases:
- `APPLE_CERTIFICATE` (base64-encoded `Developer ID Application` certificate `.p12`)
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_ID`
- `APPLE_PASSWORD` (app-specific password)
- `APPLE_TEAM_ID`
- Optional: `APPLE_SIGNING_IDENTITY` (if you need to force a specific identity)

### First release (`v0.1.0`)

Versions are already set to `0.1.0`, so the first release can be created with:

```bash
git checkout main
git pull --ff-only
git tag -a v0.1.0 -m "Trajectory v0.1.0"
git push origin main
git push origin v0.1.0
```

After pushing the tag:
1. Open GitHub Actions and confirm the `Release` workflow for `v0.1.0` is green.
2. Open the GitHub Release `v0.1.0` and confirm release assets include the macOS installer (`.dmg`).

### If macOS says "is damaged and can't be opened"

That usually means the app was not signed/notarized (or notarization did not validate), not that the binary is corrupted.

For a one-off local unblock while testing:

```bash
xattr -dr com.apple.quarantine /Applications/Trajectory.app
```

For shipped releases, fix the pipeline by configuring the signing/notarization secrets above.

## Architecture

- `src/`: React frontend (routes/pages/components/store)
- `src-tauri/src/`: Rust backend (TCX parser, scan pipeline, DB, commands)
- `src-tauri/tauri.conf.json`: Tauri app/bundle configuration

## Developer Documentation

For a codebase-level walkthrough (module responsibilities, key functions, scan/data flow, DB model, and extension patterns), see:

- `docs/DEVELOPER_GUIDE.md`

## Tauri Command API

Implemented commands:

- `get_settings()`
- `set_import_folder(path, recursive)`
- `set_dark_mode(dark_mode)`
- `scan_import_folder(full_rescan?)`
- `list_activities(filters)`
- `get_activity(id)`
- `get_heatmap_data(filters)`

`list_activities(filters)` supports:
- `startDate`, `endDate`
- `category` (normalized workout category)
- `minDistance`, `maxDistance`
- `day`

`get_heatmap_data(filters)` supports:
- `startDate`, `endDate`
- `category`
- `sportType`
- `activityIds` (optional explicit subset)
- `maxPoints` (optional cap for returned GPS points)

Progress events:

- `scan:progress` `{ parsed, total, currentFile }`
- `scan:done` `{ added, updated, skipped, errors }`

## Non-Goals (Current Prototype)

- Strava API integration
- Cloud sync
- User accounts/login
- Editing TCX files
- Mobile app
