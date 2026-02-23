# Trajectory

Trajectory is a macOS-first desktop app for local TCX/FIT activity analysis.
It is inspired by Strava-style training dashboards, but runs fully offline: no server, no cloud sync, no account required.

## Status

Prototype (actively evolving).

## Highlights

- Local-only app (Tauri + Rust + React)
- Import an existing folder of `.tcx` and/or `.fit` files (optionally recursive)
- Incremental rescans using file path + mtime + size
- Normal rescans prune deleted files from the database cache
- Optional "Clear Cache + Full Rescan" for a full rebuild from disk
- Background parsing with progress events
- Summary-only `.fit` exports (no per-point records) are imported when session/activity totals exist, with no map/track charts
- Route-level lazy loading for faster initial app startup
- Workout category derivation (`Running`, `Biking`, `Strength`, etc.) from TCX/FIT sport + notes
- Workout titles stored for every activity (FIT session/workout names when available, otherwise generated fallback titles)
- Single visible workout category in UI (used for filtering)
- Activities filters auto-apply on change (no Apply button)
- Light mode by default with optional dark mode toggle in Settings
- Accent color themes selectable in Settings (applies across UI + route overlays/charts)
- Settings tabs for Import and Appearance
- UI view/filter state is remembered across navigation (e.g. Settings tab, Dashboard calendar view, Heatmap filters); sidebar sections reopen the last route for Dashboard/Heatmap/Settings, while `Activities` always opens the list page
- Dashboard with a drill-down training calendar (year view -> month view -> activity links)
- Dashboard top summary cards include a weekly activity streak tile (consecutive active weeks)
- Calendar bars can switch between hours, kilometers, and activity count
- Hovering month or year bars uses horizontal cursor position (full-height hit area) and highlights the corresponding calendar day/month workout context with a quick pop animation
- Filterable/sortable activities table
- Active sort direction indicators (`▲`/`▼`) in activities table headers
- In-memory activities list caching for snappy return navigation (no refetch unless filters/data change)
- Activity detail with a right-side metric rail, route map, and switchable distance-based charts (combined overlay or split plots, shared hover cursor/stats, elevation background in combined mode, adaptive vertical scaling for visible series)
- Continuous, Google Maps-style smooth zooming/panning on map views
- Toggling "Reduced complexity" preserves the current map viewport (pan/zoom)
- Map views support in-place maximize/minimize (with `Esc` to close expanded view)
- Global path-based heatmap page that overlays all matching GPS tracks
- Heatmap filters for time span (presets + custom), category, and sport type
- Appearance settings for accent theme selection and optional full-opacity heatmap routes (100% opacity)
- "Reduced complexity" toggle on map views for a grayscale, lower-noise basemap with stronger route contrast
- Map controls (including reduced-complexity toggles/legend) are overlaid on maps so they remain visible in maximized map mode

## Tech Stack

- Shell: Tauri v2
- Backend: Rust, `quick-xml`, `fitparser`, `rusqlite`, `chrono`, `serde`
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
2. On first launch, select an existing import folder containing `.tcx` and/or `.fit` files.
3. After selecting a folder (and on every app startup), Trajectory automatically runs a background scan.
4. Open **Settings** any time to run:
   - **Rescan** for a normal incremental pass.
   - **Clear Cache + Full Rescan** when you want to wipe cached activities and re-import everything.
   - **Appearance** tab for dark mode, accent color theme, and heatmap rendering preferences (including optional 100% heatmap opacity).
5. Explore:
   - **Dashboard** for yearly calendar overview, month drill-down, clickable activity entries, and a weekly streak indicator
   - Use dashboard arrows to move between years/months, click metric cards to switch bar mode (hours/km/activities), click year bars to drill into a month, and click month bars to open an activity from that day
   - In month view, move horizontally across daily bars to see a quick popover and auto-highlight the corresponding workout day and all visible workout cards
   - In year view, move horizontally across weekly bars to preview that week and auto-highlight all matching days in that week across month/day mini-bars
   - **Activities** for filtering/sorting workouts (category + distance filters auto-apply)
   - **Heatmap** for a global path heatmap (overlapping GPS tracks; filter by time span/category/sport)
   - Enable **Reduced complexity (grayscale)** in Heatmap to declutter the map and emphasize route overlap
   - **Activity Detail** for metrics/map plus a distance-based chart area that can switch between combined overlay and split plots
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
- CI uses macOS ad-hoc signing (`APPLE_SIGNING_IDENTITY="-"`) and does not attempt Apple Developer ID signing or notarization.
- No Apple signing/notarization GitHub secrets are required for the current release workflow.
- Builds are expected to run on macOS (including Apple Silicon), but Gatekeeper warnings will still appear on first launch.

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

### First launch warnings (expected for ad-hoc signed builds)

Because CI uses ad-hoc signing and no notarization, users may see "can't be opened" / "unidentified developer" warnings on first launch.

User workaround (expected):
1. Right-click the app, choose **Open**, then click **Open** again.
2. Or open **System Settings** -> **Privacy & Security** and click **Open Anyway**.

## Architecture

- `src/`: React frontend (routes/pages/components/store)
- `src-tauri/src/`: Rust backend (TCX/FIT parsers, scan pipeline, DB, commands)
- `src-tauri/tauri.conf.json`: Tauri app/bundle configuration

## Developer Documentation

For a codebase-level walkthrough (module responsibilities, key functions, scan/data flow, DB model, and extension patterns), see:

- `docs/DEVELOPER_GUIDE.md`

## Tauri Command API

Implemented commands:

- `get_settings()`
- `set_import_folder(path, recursive)`
- `set_dark_mode(dark_mode)`
- `set_accent_theme(accent_theme)`
- `set_heatmap_full_opacity(heatmap_full_opacity)`
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
- Editing activity source files (`.tcx` / `.fit`)
- Mobile app
