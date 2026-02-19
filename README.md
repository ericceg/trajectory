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
- Workout category derivation (`Running`, `Biking`, `Strength`, etc.) from TCX sport + notes
- Single visible workout category in UI (used for filtering)
- Activities filters auto-apply on change (no Apply button)
- Light mode by default with optional dark mode toggle in Settings
- Dashboard with a drill-down training calendar (year view -> month view -> activity links)
- Calendar bars can switch between hours, kilometers, and activity count
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
   - Use **Clear Cache + Full Rescan** when you want to wipe cached activities and re-import everything.
4. Explore:
   - **Dashboard** for yearly calendar overview, month drill-down, and clickable activity entries
   - Use dashboard arrows to move between years/months and click metric cards to switch bar mode (hours/km/activities)
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
