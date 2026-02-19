# Trajectory Developer Guide

This document explains the codebase for developers who want to maintain or extend the app.

## 1. Project purpose and constraints

Trajectory is a local-first TCX activity analysis desktop app built with:

- Tauri v2 shell
- Rust backend (TCX parsing, indexing, SQLite queries)
- React + TypeScript frontend (dashboard/list/detail/stats/settings UI)

The app has no server. All reads/writes happen locally:

- User-owned import folder: source `.tcx` files only (never modified)
- App-owned storage:
  - SQLite DB in app data dir (`activities.sqlite`)
  - Settings JSON in app config dir (`settings.json`)

## 2. Repository layout

Top-level:

- `src/`: React app
- `src-tauri/src/`: Rust backend modules and Tauri commands
- `src-tauri/tauri.conf.json`: Tauri build and bundle config
- `.github/workflows/release.yml`: tag-based macOS release workflow
- `import_example/`: sample TCX import folder

Frontend directories:

- `src/pages/`: route screens
- `src/components/`: shared UI components
- `src/store/`: global app state (Zustand)
- `src/lib/`: Tauri invoke/event bindings + formatters
- `src/types.ts`: API contracts used in UI

Backend files:

- `src-tauri/src/main.rs`: app bootstrap + Tauri command handlers
- `src-tauri/src/parser.rs`: TCX XML parser + derived metric logic
- `src-tauri/src/scanner.rs`: folder scan/index pipeline + progress events
- `src-tauri/src/db.rs`: SQLite schema + upsert + list/detail/stats queries
- `src-tauri/src/settings.rs`: settings file load/save
- `src-tauri/src/models.rs`: shared Rust DTOs for commands/events

## 3. Runtime architecture

High-level data flow:

1. UI calls Rust commands via `invoke` wrappers in `src/lib/tauri.ts`.
2. Rust commands run in `src-tauri/src/main.rs`.
3. Heavy DB/scan work runs in `spawn_blocking` to avoid UI blocking.
4. Scan emits progress and completion events:
   - `scan:progress`
   - `scan:done`
5. Zustand store (`src/store/useAppStore.ts`) listens for progress events and refreshes settings after scan command completion.

## 4. Backend architecture (Rust)

### 4.1 `src-tauri/src/main.rs`

Core responsibilities:

- Initializes app-owned paths and resources (`init_state`)
- Registers Tauri command handlers
- Manages shared app state (`AppState`)

Important items:

- `AppState { db_path, settings_path }`
  - Shared through `tauri::State`
- `init_state(app: &AppHandle) -> Result<AppState>`
  - Resolves/creates app data + app config dirs
  - Initializes DB (`db::init_db`)
  - Creates default settings file if missing

Tauri command handlers:

- `get_settings(state) -> Settings`
  - Reads settings JSON from config dir
- `set_import_folder(path, recursive, state) -> Settings`
  - Canonicalizes and validates directory path
  - Persists `import_folder_path` and `scan_recursive`
- `set_dark_mode(dark_mode, state) -> Settings`
  - Updates `dark_mode` flag in settings
- `scan_import_folder(app, state) -> ScanDoneEvent`
  - Runs scanner in `spawn_blocking`
- `list_activities(filters, state) -> Vec<ActivitySummary>`
  - DB query in `spawn_blocking`
- `get_activity(id, state) -> ActivityDetail`
  - DB detail query in `spawn_blocking`
- `get_stats(range, state) -> StatsResponse`
  - DB aggregate query in `spawn_blocking`

### 4.2 `src-tauri/src/models.rs`

Defines command/event payloads and internal models.

Important types:

- `Settings`
  - `import_folder_path`, `scan_recursive`, `last_scan_timestamp`, `dark_mode`
- `ActivityFilters`
  - Date range, category/sport, distance range, day exact match
- `ActivitySummary`
  - Row used by dashboard/list/stats summaries
- `ActivityDetail`
  - `summary + track + samples + original_sample_count`
- `StatsResponse`
  - Totals + histogram bins + weekly/monthly trend points
- `ScanProgressEvent`, `ScanDoneEvent`
  - Event payloads for scanner UI updates
- `ParsedActivity`
  - Parser output used by DB upsert
- `SourceFileMeta`
  - `source_mtime + source_size` for change detection

### 4.3 `src-tauri/src/settings.rs`

Simple JSON settings persistence.

- `load_settings(path) -> Settings`
  - Returns defaults if file does not exist
  - Reads/parses JSON with context-rich errors
- `save_settings(path, settings) -> Result<()>`
  - Ensures parent directory exists
  - Writes pretty JSON

### 4.4 `src-tauri/src/scanner.rs`

Folder scan/index orchestration.

Important functions:

- `is_activity_file(path) -> bool`
  - Accepts `.tcx` and `.txc` extensions (case-insensitive)
- `collect_activity_files(root, recursive) -> Vec<PathBuf>`
  - Validates folder exists and is directory
  - Recursive mode uses `walkdir`, skipping hidden entries (`.` prefix)
  - Non-recursive mode scans direct children only
  - Sorts final file list for stable processing order
- `scan_import_folder(app, db_path, settings_path) -> ScanDoneEvent`
  - Loads settings and import folder path
  - Collects candidate files
  - Loads known file metadata map from DB
  - For each file:
    - canonicalizes path
    - checks metadata
    - skips unchanged files by `(source_size, source_mtime)`
    - parses changed/new file (`parser::parse_tcx_file`)
    - upserts parsed activity (`db::upsert_activity`)
    - emits `scan:progress`
  - Updates `last_scan_timestamp`
  - Emits `scan:done` with counts and error list

### 4.5 `src-tauri/src/parser.rs`

TCX parser and derived metrics.

Key constants and structs:

- `MAX_UI_POINTS = 2000`: max downsampled points stored for track/samples
- `RawTrackPoint`: per-trackpoint accumulator while parsing XML

Helper functions:

- `normalize_tag(bytes) -> String`
  - Strips XML namespace prefix (`ns:Tag` -> `Tag`)
- `parse_time(value) -> Option<DateTime<Utc>>`
  - RFC3339 parser
- `parse_f64(value) -> Option<f64>`
  - Numeric parsing helper
- `contains_any(haystack, needles) -> bool`
  - Keyword matching helper
- `derive_activity_category(sport_type, notes) -> String`
  - Maps freeform TCX sport/notes into one UI category:
    - Running, Biking, Hiking, Walking, Swimming, Rowing, Strength, Mobility, Other
- `haversine_m(lat1, lon1, lat2, lon2) -> f64`
  - GPS distance between coordinates in meters
- `downsample(items, max) -> Vec<T>`
  - Uniform stride sampling that keeps first and last points

Main function:

- `parse_tcx_file(path) -> ParsedActivity`
  - Stream-parses TCX XML with `quick-xml`
  - Extracts activity metadata:
    - sport type (`Activity@Sport`)
    - start time (`Lap@StartTime`, fallback to `Id` or first trackpoint time)
    - notes
  - Extracts trackpoint fields:
    - time, lat/lon, altitude, distance, speed, HR
  - Computes derived metrics:
    - duration from timestamps (fallback to lap totals)
    - distance priority:
      1) reported distance delta
      2) accumulated GPS distance
      3) lap distance total
    - elevation gain from positive altitude deltas over 1 meter
    - derived speed from distance/time deltas when missing
    - avg/max speed
    - avg/max HR
  - Builds:
    - `track` (GPS polyline points)
    - `samples` (time series entries)
  - Downsamples track and samples to `MAX_UI_POINTS`
  - Returns `ParsedActivity` with `original_sample_count`

### 4.6 `src-tauri/src/db.rs`

SQLite schema, migrations, and all query logic.

Important enum:

- `UpsertResult`
  - `Added` or `Updated`

Connection/bootstrap:

- `open_connection(db_path) -> Connection`
  - Opens SQLite DB with path-aware error context
- `init_db(db_path) -> Result<()>`
  - Creates DB directory if needed
  - Applies schema for:
    - `activities`
    - `activity_samples`
    - indexes
  - Enables `WAL` journal mode and foreign keys
  - Calls `ensure_activity_category_column`

Schema migration helper:

- `ensure_activity_category_column(conn) -> Result<()>`
  - Adds `category` column if missing
  - Backfills category from existing `sport_type`
  - Ensures category index exists

Scan support:

- `source_file_meta_map(conn) -> HashMap<String, SourceFileMeta>`
  - Loads source path -> `(mtime, size)` map for incremental scan checks
- `upsert_activity(conn, source_path, source_mtime, source_size, parsed) -> UpsertResult`
  - Inserts or updates `activities` by unique `source_path`
  - Stores `track_json`
  - Replaces all related `activity_samples` rows in a transaction

Activity list/detail:

- `map_summary_row(row) -> ActivitySummary`
  - Internal row mapper for summary selects
- `list_activities(conn, filters) -> Vec<ActivitySummary>`
  - Supports filters:
    - `start_date`, `end_date`, `category`, `sport_type`, `min_distance`, `max_distance`, `day`
  - Sorts newest first
- `get_activity(conn, id) -> ActivityDetail`
  - Fetches summary + `track_json` + `original_sample_count`
  - Loads ordered sample rows
  - Returns assembled `ActivityDetail`

Stats and analytics:

- `histogram(values, bins) -> Vec<HistogramBin>`
  - Creates equal-width bins
  - Handles empty/single-value edge cases
- `range_start_iso(range) -> Option<String>`
  - Converts `week|month|year|all` into optional start timestamp
- `distance_trends(conn, group_fmt, start_iso) -> Vec<TrendPoint>`
  - Buckets by SQLite `strftime` format
- `get_stats(conn, range) -> StatsResponse`
  - Aggregates totals (distance/time/elevation/count)
  - Builds duration and distance histograms
  - Builds weekly and monthly trend lines

## 5. Frontend architecture (React + TypeScript)

### 5.1 Entry and routing

`src/main.tsx`:

- Bootstraps React root
- Loads Leaflet CSS and global app CSS
- Renders `<App />` inside `React.StrictMode`

`src/App.tsx`:

- Calls `useAppStore().init()` on mount
- Applies document theme via `data-theme` from `settings.darkMode`
- Lazy-loads page routes with `React.lazy` + `Suspense` for route-level code splitting
- Route gate behavior:
  - while settings load: loading screen
  - missing import folder: show `OnboardingPage`
  - otherwise: `HashRouter` + app layout
- Triggers one automatic startup scan per selected import folder path
- Main routes:
  - `/` dashboard
  - `/activities`
  - `/activities/:id`
  - `/statistics`
  - `/settings`

### 5.2 Backend bridge (`src/lib/tauri.ts`)

Command wrappers:

- `getSettings()`
- `setImportFolder(path, recursive)`
- `setDarkMode(darkMode)`
- `scanImportFolder()`
- `listActivities(filters?)`
- `getActivity(id)`
- `getStats(range)`

Event subscriptions:

- `onScanProgress(handler)` listens to `scan:progress`

This file is the only place that should know command/event string names.

### 5.3 Global app store (`src/store/useAppStore.ts`)

Store state:

- `settings`, `loadingSettings`
- `scanning`, `scanProgress`, `scanDone`

Store actions:

- `init()`
  - Registers scan event listeners once (`listenersInitialized`)
  - Pulls latest settings from backend
- `updateImportFolder(path, recursive)`
  - Persists import folder settings
- `setScanRecursive(recursive)`
  - Reuses current import path while toggling recursive flag
- `updateDarkMode(darkMode)`
  - Persists theme preference
- `runScan()`
  - Starts scan
  - Updates progress/done state from command result + progress events
  - Refreshes settings after successful scan
  - On failure, stores synthetic `scanDone` with error payload

### 5.4 Pages (`src/pages/`)

`OnboardingPage.tsx`:

- First-launch folder selection flow
- Persists selected folder and recursive preference

`SettingsPage.tsx`:

- Import folder chooser
- Recursive scan toggle
- Dark mode toggle
- Rescan button
- Shows scan status and scan errors

`DashboardPage.tsx`:

- Loads:
  - weekly stats
  - yearly stats
  - recent activities
  - month activities for selected month
  - selected-day activities
- Recomputes weekly rollups from month activities
- Renders:
  - top metric cards
  - month calendar
  - scan status card
  - weekly rollup list
  - day and recent activity lists

`ActivitiesPage.tsx`:

- Filter state:
  - category
  - min/max distance (km)
- Auto-reloads data when filters change
- Uses TanStack Table for sorting/rendering
- Row click navigates to detail page

`ActivityDetailPage.tsx`:

- Loads single activity by route `id`
- Builds chart datasets from samples:
  - speed vs time
  - heart rate vs time
  - elevation vs distance/time
- Renders map (Leaflet polyline + auto-fit bounds)
- Handles no-GPS and no-sample-data states

`StatisticsPage.tsx`:

- Range tabs: `week`, `month`, `year`, `all`
- Loads aggregate stats for selected range
- Builds:
  - workout duration histogram data
  - distance histogram data
  - merged weekly/monthly trend data
- Renders cards + bar charts + trend chart

### 5.5 Shared components (`src/components/`)

- `Sidebar.tsx`: left nav and route links
- `MetricCard.tsx`: simple label/value card component
- `ScanStatusCard.tsx`: scan idle/progress/done state renderer
- `MonthCalendar.tsx`:
  - month navigation
  - activity count by day
  - selected day highlight and callback

### 5.6 Formatting utilities (`src/lib/format.ts`)

- `formatDistanceKm(meters)`
- `formatDuration(seconds)`
- `formatSpeedKmh(mps)`
- `formatPaceMinKm(mps)`
- `formatDateTime(iso)`
- `formatDate(iso)`

These are UI-only formatting helpers and should not contain business logic.

## 6. API contracts between UI and Rust

Contract definitions are duplicated in:

- Rust: `src-tauri/src/models.rs` (serde with `camelCase`)
- TS: `src/types.ts`

When adding/changing fields:

1. Update Rust model
2. Update TypeScript interface
3. Update command implementation
4. Update all affected UI views

## 7. Database model

`activities` table stores summary/indexed data per source file.

Notable columns:

- source metadata: `source_path`, `source_mtime`, `source_size`
- summary metrics: start/category/sport/duration/distance/elevation/speed/hr
- map payload: `track_json`
- quality metadata: `has_gps`, `original_sample_count`

`activity_samples` table stores downsampled time-series points for charts.

Foreign key:

- `activity_samples.activity_id -> activities.id ON DELETE CASCADE`

## 8. Scan and indexing lifecycle

1. User clicks `Rescan`.
2. Frontend store calls `scan_import_folder`.
3. Scanner enumerates files in import folder.
4. For each file, unchanged files are skipped by mtime+size.
5. Changed files are parsed and upserted.
6. Progress events update UI in near real time.
7. Completion event returns counters and parse errors.
8. Settings `last_scan_timestamp` is updated.

## 9. Build, packaging, and release

Local:

- `npm install`
- `npm run tauri dev`
- `npm run tauri build`

Artifacts:

- macOS `.app` and `.dmg` under `src-tauri/target/release/bundle/`

CI release (`.github/workflows/release.yml`):

- Trigger: tag push `v*`
- Validates tag version matches:
  - `package.json`
  - `src-tauri/tauri.conf.json`
- Uses `tauri-apps/tauri-action` to build and publish artifacts to GitHub Releases

## 10. Extension guide

Add a new backend command:

1. Define request/response models in `src-tauri/src/models.rs` if needed.
2. Implement logic in `db.rs`, `parser.rs`, or new module.
3. Add `#[tauri::command]` function in `main.rs`.
4. Register in `generate_handler!`.
5. Add typed wrapper in `src/lib/tauri.ts`.
6. Add TS types in `src/types.ts`.
7. Wire UI page/store usage.

Add a new activity filter:

1. Add field in Rust `ActivityFilters` and TS `ActivityFilters`.
2. Extend SQL WHERE clause in `db::list_activities`.
3. Pass field from UI query builder in `ActivitiesPage`.
4. Add corresponding input control.

Add a new derived metric from TCX:

1. Extract raw value in `parser::parse_tcx_file`.
2. Add field to `ParsedActivity`.
3. Store field in `activities` table and migrations.
4. Include field in `ActivitySummary`/`ActivityDetail`.
5. Render in relevant UI cards/charts.

## 11. Known implementation notes

- The parser currently requires at least one `<Trackpoint>`; files without trackpoints are rejected.
- Scanner accepts `.txc` extension in addition to `.tcx`.
- `scan:progress` event payload uses `currentFile` (camelCase), matching the rest of the command payload contracts.
- There is currently no automated test suite in the repository.
