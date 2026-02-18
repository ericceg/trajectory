# Trajectory

Trajectory is a macOS-first desktop app for local TCX activity analysis.
It is inspired by Strava-style training dashboards, but runs fully offline: no server, no cloud sync, no account required.

## Status

Prototype (actively evolving).

## Highlights

- Local-only app (Tauri + Rust + React)
- Import an existing folder of `.tcx` files (optionally recursive)
- Incremental rescans using file path + mtime + size
- Background parsing with progress events
- Workout category derivation (`Running`, `Biking`, `Strength`, etc.) from TCX sport + notes
- Single visible workout category in UI (used for filtering)
- Activities filters auto-apply on change (no Apply button)
- Light mode by default with optional dark mode toggle in Settings
- Dashboard with calendar, weekly rollups, and year-to-date totals
- Filterable/sortable activities table
- Activity detail with metrics, route map, and charts
- Statistics view with aggregate metrics, histograms, and trends

## Tech Stack

- Shell: Tauri v2
- Backend: Rust, `quick-xml`, `rusqlite`, `chrono`, `serde`
- Frontend: React + TypeScript + Vite + TailwindCSS
- UI/Data libs: React Router, Zustand, TanStack Table, Recharts, date-fns, Leaflet
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
3. Open **Settings** and click **Rescan**.
4. Explore:
   - **Dashboard** for calendar + weekly/year summaries
   - **Activities** for filtering/sorting workouts (category + distance filters auto-apply)
   - **Activity Detail** for metrics/map/charts
   - **Statistics** for aggregate trends and histograms


## Build

```bash
npm run tauri build
```

Expected macOS artifacts are generated under `src-tauri/target/release/bundle/`, including:

- `.app`
- `.dmg`

## Release Process

A GitHub Actions workflow builds and publishes macOS artifacts on version tags (`v*`).

1. Update version in:
   - `package.json`
   - `src-tauri/tauri.conf.json`
2. Create and push a matching tag: `vX.Y.Z`
3. The workflow uploads build artifacts to GitHub Releases

Workflow file: `.github/workflows/release.yml`

## Architecture

- `src/`: React frontend (routes/pages/components/store)
- `src-tauri/src/`: Rust backend (TCX parser, scan pipeline, DB, commands)
- `src-tauri/tauri.conf.json`: Tauri app/bundle configuration

## Tauri Command API

Implemented commands:

- `get_settings()`
- `set_import_folder(path, recursive)`
- `set_dark_mode(dark_mode)`
- `scan_import_folder()`
- `list_activities(filters)`
- `get_activity(id)`
- `get_stats(range)`

`list_activities(filters)` supports:
- `startDate`, `endDate`
- `category` (normalized workout category)
- `minDistance`, `maxDistance`
- `day`

Progress events:

- `scan:progress` `{ parsed, total, current_file }`
- `scan:done` `{ added, updated, skipped, errors }`

## Non-Goals (Current Prototype)

- Strava API integration
- Cloud sync
- User accounts/login
- Editing TCX files
- Mobile app
