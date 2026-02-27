# Trajectory Developer Guide

This document describes the current codebase (as implemented), with a focus on how data flows from local activity files into the Tauri/Rust backend and React UI.

## 1. Project Purpose and Current Scope

Trajectory is a local-first desktop app for analyzing activity files.

Current implementation:

- Tauri v2 shell (desktop app, no HTTP server)
- Rust backend for scanning/parsing/indexing/querying
- React + TypeScript frontend for dashboard/list/detail/heatmap/settings UI
- SQLite + JSON settings stored in OS app data/config directories

Supported import file types in the current codebase:

- `.tcx`
- `.txc` (accepted alias)
- `.fit`

Important behavior:

- The user-owned import folder is read-only from the app's perspective (Trajectory does not modify source files).
- The app maintains its own DB/cache/settings under Tauri app data/config paths.

## 2. Repository Layout

Top-level:

- `src/`: React frontend
- `src-tauri/`: Tauri shell + Rust backend
- `docs/DEVELOPER_GUIDE.md`: this guide
- `README.md`: user-facing usage/build/release notes
- `.github/workflows/release.yml`: tag-based macOS release build/publish workflow
- `import_example/`: sample import folder contents
- `test/`: sample FIT files used for manual verification (not an automated test suite)

Frontend (`src/`):

- `src/App.tsx`: route gating, startup scan trigger, layout, lazy routes
- `src/main.tsx`: React bootstrap + global CSS + MapLibre CSS
- `src/pages/`: route screens (`Dashboard`, `Activities`, `Activity Detail`, `Heatmap`, `Advanced Analytics`, `Settings`, `Onboarding`)
- `src/components/`: reusable UI pieces (`Sidebar`, `MetricCard`, `ScanStatusCard`, map frame)
- `src/store/`: Zustand stores (app/runtime state, persisted UI state, advanced analytics definitions)
- `src/lib/`: Tauri bridge, analytics/formatting helpers, central chart plotting engine (`src/lib/charts/plottingEngine.ts`), map styles, theming, MapLibre hook
- `src/types.ts`: TypeScript command/event payload contracts

Central plotting engine:

- `src/lib/charts/plottingEngine.ts` centralizes shared plotting behavior used by both Activity Detail and Advanced Analytics.
- Shared exports include chart visual constants (axis/grid/tooltip styles, selection/cursor defaults, and animation defaults), pointer parsing helpers, and the reusable `usePlotDragZoom` hook.
- Both `src/pages/ActivityDetailPage.tsx` and `src/components/analytics/AnalyticsPreview.tsx` consume the same drag-to-zoom and click-to-reset interaction core.
- `src/index.css` applies a global Recharts `user-select: none` rule (`.recharts-responsive-container` and descendants) so drag operations do not accidentally select chart text, including on newly added plots.

Backend (`src-tauri/src/`):

- `main.rs`: Tauri app bootstrap + command handlers
- `scanner.rs`: import folder scan / incremental indexing / progress events
- `parser.rs`: TCX + FIT parsing and derived metric computation
- `db.rs`: SQLite schema, migrations, upsert/query logic
- `analytics.rs`: advanced analytics rule evaluation (custom metrics/streaks/charts)
- `settings.rs`: JSON settings persistence
- `models.rs`: Rust command/event DTOs and parser/db shared structs

Tauri/build config:

- `src-tauri/tauri.conf.json`: bundle/window/build settings
- `src-tauri/capabilities/default.json`: Tauri capability permissions
- `src-tauri/Cargo.toml`: Rust dependencies and app version
- `vite.config.ts`: Vite config + `@` alias + Tauri dev port
- `tailwind.config.cjs`: Tailwind theme tokens mapped to CSS variables

## 3. Runtime Architecture

High-level flow:

1. React UI calls typed wrappers in `src/lib/tauri.ts`.
2. Wrappers call Tauri `invoke(...)` commands handled in `src-tauri/src/main.rs`.
3. Backend commands open/query SQLite or run scan/parse work.
4. Long-running scan work emits Tauri events (`scan:progress`, `scan:done`).
5. Zustand app store (`src/store/useAppStore.ts`) tracks settings and scan status.
6. UI pages fetch summaries/details/heatmap data directly via command wrappers.

Concurrency behavior:

- DB and scan commands are run in `tauri::async_runtime::spawn_blocking(...)` from `main.rs` to avoid blocking the UI thread.
- The UI listens to `scan:progress` events and updates progress state while scans run.

## 4. Backend Architecture (Rust)

### 4.1 `src-tauri/src/main.rs`

Responsibilities:

- Resolve/create app data and app config directories using Tauri path APIs
- Initialize SQLite (`db::init_db`)
- Ensure a default settings file exists
- Register command handlers and the dialog plugin
- Hold shared `AppState { db_path, settings_path }`

Key helpers:

- `init_state(app)` sets up app-owned directories and files
- `update_app_settings(...)` centralizes read-modify-write settings updates
- `is_supported_accent_theme(...)` validates allowed accent theme IDs from the frontend
- `validate_heart_rate_zone_upper_bounds_bpm(...)` validates user-configured HR zone cutoffs (4 ascending bpm thresholds)

Implemented Tauri commands (current):

- `get_settings()`
- `set_import_folder(path, recursive)`
- `set_dark_mode(dark_mode)`
- `set_accent_theme(accent_theme)`
- `set_heatmap_full_opacity(heatmap_full_opacity)`
- `set_chart_max_samples(chart_max_samples)`
- `set_heart_rate_zone_upper_bounds_bpm(upper_bounds_bpm)`
- `scan_import_folder(full_rescan?)`
- `list_activities(filters)`
- `get_activity(id)`
- `get_activity_samples(id, query?)`
- `get_heatmap_data(filters)`
- `run_advanced_analytics(request)`

Notes:

- `scan_import_folder` supports an optional `full_rescan` boolean (defaults to `false`).
- `run_advanced_analytics(request)` evaluates custom metric/streak/chart definitions in one backend roundtrip and returns per-item errors/warnings when possible instead of failing the whole page.

### 4.2 `src-tauri/src/models.rs`

Defines serialized command/event payloads and internal parser/scanner types.

Important serialized types:

- `Settings`
  - `import_folder_path`, `scan_recursive`, `last_scan_timestamp`
  - `dark_mode`, `accent_theme`, `heatmap_full_opacity`
  - `chart_max_samples`, `heart_rate_zone_upper_bounds_bpm`
- `ActivityFilters`
  - `start_date`, `end_date`, `category`, `sport_type`, `min_distance`, `max_distance`, `day`
- `ActivitySummary`
  - list/dashboard row payload used across multiple pages
- `ActivityDetail`
  - `summary`, `track`, `samples`, `original_sample_count`
- `HeatmapFilters` / `HeatmapData`
- `AdvancedAnalytics*`
  - request/definition/result DTOs for custom metrics, streaks, and chart views
- `ScanProgressEvent` / `ScanDoneEvent`

Internal/shared (lower-level/internal structs):

- `ActivitySampleQuery`
- `ActivitySamplesResponse`
- `ParsedActivity`
- `SourceFileMeta`

`serde(rename_all = "camelCase")` is used so Rust snake_case fields map cleanly to frontend camelCase interfaces.

### 4.3 `src-tauri/src/settings.rs`

Simple JSON settings persistence:

- `load_settings(path)` returns defaults if file is missing
- `save_settings(path, settings)` creates parent dirs and writes pretty JSON

The settings file lives in the Tauri app config directory (e.g. macOS `~/Library/Application Support/...` via Tauri path APIs, depending on app identifier/platform conventions).

### 4.4 `src-tauri/src/scanner.rs`

Responsible for import folder enumeration, incremental change detection, parsing, DB upserts, and progress events.

Key behaviors:

- Accepts `.tcx`, `.txc`, and `.fit` files (`is_activity_file`)
- Supports recursive and non-recursive scans
- Recursive scans use `walkdir` and skip hidden entries (`.` prefix)
- Canonicalizes discovered file paths when possible
- Uses `(source_path, source_mtime, source_size)` for change detection
- Emits progress on every processed/skipped file
- Updates `last_scan_timestamp` after scan completion

Incremental and full-rescan behavior:

- Normal rescan:
  - deletes DB rows for source files no longer present on disk
  - skips unchanged files by size + mtime
  - parses/upserts changed/new files only
- Full rescan (`full_rescan = true`):
  - clears cached activities and samples (`db::clear_activity_cache`)
  - reimports all discovered activity files

Error handling:

- Parser errors are collected into `ScanDoneEvent.errors`
- "No trackpoints" parser errors are treated as skipped (not fatal), enabling summary-only or unsupported-record edge cases to fail gracefully depending on parser outcome

Events emitted:

- `scan:progress` `{ parsed, total, currentFile }`
- `scan:done` `{ added, updated, skipped, errors }`

### 4.5 `src-tauri/src/parser.rs`

Parses activity files and computes derived metrics.

Supported parser entrypoints:

- `parse_activity_file(path)` dispatches by extension
- `parse_tcx_file(path)`
- `parse_fit_file(path)`

#### TCX parsing

Uses `quick-xml` streaming parsing to extract:

- sport type (`Activity@Sport`)
- activity start time (`Lap@StartTime`, fallbacks to `Id` / trackpoint time)
- notes
- trackpoints with time, lat/lon, altitude, distance, speed, HR
- lap totals (distance/time) as fallbacks

#### FIT parsing

Uses `fitparser` and processes multiple record types (`record`, `session`, `activity`, `sport`, `workout`).

Extracts when present:

- timestamp / start time
- lat/lon (including semicircle normalization)
- altitude, HR, speed, distance
- sport / sub-sport
- workout/session title fields
- summary totals (distance, duration, ascent, avg/max speed, HR)

Important FIT behavior:

- If no point records exist, the parser can still build a **summary-only** activity (`build_summary_only_activity`) using session/activity totals.
- Summary-only FIT activities have no GPS track and no chart samples.

#### Derived metrics and normalization

`build_parsed_activity(...)` computes:

- duration (timestamp delta with fallback to summary/lap duration)
- distance (reported distance delta > GPS haversine > fallback totals)
- elevation gain (positive deltas > 1m)
- avg/max speed (reported/derived)
- avg/max heart rate
- category (normalized bucket: Running/Biking/Strength/etc.)
- title (explicit title/notes/sport/file-name fallback)

Downsampling behavior in parser:

- `MAX_UI_POINTS = 2000`
- `track` is downsampled before storing in `activities.track_json`
- `samples` are **not** downsampled in the parser (full parsed sample list is passed to DB upsert)

### 4.6 `src-tauri/src/db.rs`

Owns SQLite schema creation, lightweight migrations/backfills, upsert logic, and all query paths used by Tauri commands.

Schema:

- `activities`
  - source metadata (`source_path`, `source_mtime`, `source_size`)
  - summary metrics (time/distance/elevation/speed/HR)
  - display fields (`title`, `category`, `sport_type`)
  - map payload (`track_json`)
  - `original_sample_count`
- `activity_samples`
  - time-series rows for charting (`elapsed_seconds`, distance/speed/hr/altitude/lat/lon/time)
  - FK `activity_id -> activities.id ON DELETE CASCADE`

Connection/bootstrap:

- `open_connection(...)` enables WAL + foreign keys
- `init_db(...)` creates tables/indexes and runs compatibility helpers

Compatibility helpers (idempotent):

- `ensure_activity_category_column(...)`
  - adds/backfills `category`
  - creates category index
- `ensure_activity_title_column(...)`
  - adds/backfills `title`

Scan/index support:

- `source_file_meta_map(...)`
- `delete_activity_by_source_path(...)`
- `clear_activity_cache(...)`
- `upsert_activity(...)`
  - upserts `activities` by unique `source_path`
  - rewrites all `activity_samples` rows for the activity inside a transaction

Query functions used by Tauri commands:

- `list_activities(conn, filters)`
  - supports date range, `category`, `sport_type`, distance min/max, exact day
  - orders by `activity_start DESC`
- `get_activity(conn, id)`
  - loads summary + `track_json` + `original_sample_count`
  - loads all samples
  - returns a **downsampled default chart window** for `samples` (uses internal sampling helper)
- `get_heatmap_data(conn, filters)`
  - filters GPS activities and returns `track_json` tracks
  - downscales aggregate heatmap point volume via stride if needed

Internal sampling helpers (currently not exposed as a Tauri command):

- `get_activity_samples(conn, id, query)`
- `sample_activity_window(...)`
- `ActivitySampleQuery` supports distance-window filtering + `max_samples`
- sample count clamp: `50..=20_000`, default `2000`

This internal API is a good starting point if the UI later needs server-side chart zoom/window requests instead of loading `get_activity(...)` samples up front.

## 5. Frontend Architecture (React + TypeScript)

### 5.1 Entry and app shell

`src/main.tsx`:

- imports MapLibre CSS (`maplibre-gl/dist/maplibre-gl.css`)
- imports global styles (`src/index.css`)
- mounts `<App />` in `React.StrictMode`

`src/App.tsx`:

- initializes app store (`init()`) on mount
- applies light/dark mode via `document.documentElement.dataset.theme`
- applies accent theme CSS variables (`applyAccentThemeToDocument`)
- triggers one automatic startup scan per selected import folder path
- lazy-loads all routes with `React.lazy` + `Suspense`
- gates routing based on settings state:
  - loading -> loading screen
  - no import folder -> onboarding page
  - otherwise -> main app layout + `HashRouter`

Routes currently implemented:

- `/` -> `DashboardPage`
- `/activities` -> `ActivitiesPage`
- `/activities/:id` -> `ActivityDetailPage`
- `/heatmap` -> `HeatmapPage`
- `/settings` -> `SettingsPage`

`NavigationMemoryTracker` persists the last visited route for sidebar sections (`dashboard`, `heatmap`, `settings`) using the UI state store.

### 5.2 Tauri bridge (`src/lib/tauri.ts`)

This file is the frontend source of truth for command and event string names.

Wrappers:

- `getSettings`
- `setImportFolder`
- `setDarkMode`
- `setAccentTheme`
- `setHeatmapFullOpacity`
- `scanImportFolder(fullRescan?)`
- `listActivities(filters?)`
- `getActivity(id)`
- `getHeatmapData(filters?)`
- `onScanProgress(handler)`

### 5.3 Global state stores

#### `src/store/useAppStore.ts` (runtime/app state)

Tracks:

- backend `settings`
- scan lifecycle state (`scanning`, `scanProgress`, `scanDone`)
- in-memory `activitiesCache` keyed by filter/import-folder/scan timestamp

Actions:

- `init()` loads settings and installs scan listeners once
- settings mutators (`updateImportFolder`, `setScanRecursive`, `updateDarkMode`, `updateAccentTheme`, `updateHeatmapFullOpacity`)
- `runScan(fullRescan?)` runs scan, refreshes settings, clears activities cache, and normalizes error state
- cache helpers (`getCachedActivities`, `setCachedActivities`, `clearActivitiesCache`)

#### `src/store/useUiStateStore.ts` (persisted UI/view state)

Uses `zustand/middleware/persist` under key `trajectory-ui-state`.

Persists UI preferences/navigation state for:

- active settings tab
- dashboard mode/year/month/bar metric
- activities filters + sorting
- sidebar last-route memory
- heatmap time span/custom dates/category/sport/reduced map complexity

This store intentionally contains view state only (not backend data).

#### `src/store/useAdvancedAnalyticsStore.ts` (persisted analytics definitions)

Uses `zustand/middleware/persist` under key `trajectory-advanced-analytics`.

Persists:

- custom metric definitions (base + formula)
- custom streak definitions
- chart view definitions
- selected analytics item
- advanced analytics time range / custom dates / auto-run toggle

Computed analytics results are **not** persisted.

### 5.4 Pages (`src/pages/`)

#### `OnboardingPage.tsx`

- first-launch folder selection using `@tauri-apps/plugin-dialog`
- recursive scan toggle before saving
- persists import folder settings via app store

#### `SettingsPage.tsx`

Tabbed settings UI:

- `Import` tab
  - choose import folder
  - toggle recursive scans
  - `Rescan`
  - `Clear Cache + Full Rescan` (with inline confirmation)
  - scan status card and scan error list
- `Appearance` tab
  - dark mode toggle
  - accent theme selection
  - heatmap opacity preference (`heatmapFullOpacity`)

#### `DashboardPage.tsx`

Current dashboard implementation is more advanced than the original simple month grid prototype.

Key behaviors:

- Loads summary cards using multiple `listActivities(...)` queries (last 7 days, YTD, all-time for streak)
- Loads all activities for the selected year for calendar drill-down rendering
- Computes:
  - weekly summary totals
  - yearly summary totals
  - weekly activity streak
  - monthly/day/weekly aggregates in-memory
- Supports two calendar modes:
  - `year` (weekly bars across the year)
  - `month` (daily bars for selected month)
- Supports bar metrics:
  - hours
  - kilometers
  - activity count
- Hover/click interactions:
  - year bars preview weeks and drill into month mode
  - month bars preview days and navigate to the primary activity for that day

#### `ActivitiesPage.tsx`

- Fetches activities via `listActivities(...)`
- Uses app-store cache for faster back/forward navigation
- Filters (auto-apply):
  - category
  - min distance (km)
  - max distance (km)
- Sortable table via TanStack Table
- Row click/keyboard navigation to activity detail route
- Sorting state persisted in UI store

#### `ActivityDetailPage.tsx`

Loads one activity via `getActivity(id)` and renders:

- header + metadata
- route map (MapLibre) with maximize/minimize frame
- right-side metric rail
- chart section with two modes:
  - combined normalized overlay chart
  - split synchronized charts (pace/speed/HR/elevation)

Chart behaviors:

- drag-to-zoom on distance axis
- click-to-reset zoom
- adaptive re-scaling to visible domain
- series toggles (combined mode)
- no-data handling for missing samples

Map behaviors:

- route GeoJSON line source/layer in MapLibre
- fit-to-track bounds
- reduced-complexity basemap toggle
- maximized overlay mode with `Esc` to close

#### `HeatmapPage.tsx`

Global route heatmap page built on MapLibre.

Data flow:

1. Build activity filter from persisted heatmap UI state.
2. Fetch matching activities via `listActivities(...)` (used to populate sport-type options).
3. Fetch route geometry via `getHeatmapData(...)`.
4. Render track overlays as GeoJSON line layers.

Filters:

- time span preset (`all`, `30d`, `90d`, `365d`, `custom`)
- custom start/end date
- category
- sport type

Rendering features:

- adaptive line width/opacity based on track count
- optional full-opacity mode (from app settings)
- reduced-complexity basemap toggle
- maximize/minimize frame
- point count summary (including downsampled count)

#### `AdvancedAnalyticsPage.tsx`

Prototype custom analytics builder page.

Key behaviors:

- Loads/saves analytics definitions from `useAdvancedAnalyticsStore`
- Runs analytics via `runAdvancedAnalytics(...)` (Tauri command `run_advanced_analytics`)
- Supports:
  - base metrics (summary aggregates + sample-time metrics)
  - formula metrics (`+`, `-`, `/`, `%`)
  - daily/weekly threshold streaks
  - time-bucketed chart views (`bar`, `line`, `stackedBar`)
- Guided builder UI only (no DSL), AND-only conditions
- UI separates analytics editing vs preview into Configure/View tabs (View is default and renders an at-a-glance overview); metrics include a persisted `showInView` toggle used to filter the View metrics section
- Uses Settings heart-rate zone cutoffs for HR-zone sample conditions

### 5.5 Shared components and utilities

Components:

- `src/components/Sidebar.tsx`
  - section navigation with last-route memory (except `Activities`, which always goes to `/activities`), including Advanced Analytics
- `src/components/analytics/*`
  - advanced analytics library list, builders, and preview UI (library can run in configure or view-only mode)
- `src/components/MetricCard.tsx`
  - reusable metric display card
- `src/components/ScanStatusCard.tsx`
  - scan idle/progress/done UI
- `src/components/MaximizableMapFrame.tsx`
  - expandable map container overlay with `Esc` support
- `src/components/MonthCalendar.tsx`
  - legacy/simple month calendar component (currently not used by `DashboardPage`)

Libraries/helpers:

- `src/lib/format.ts`
  - UI formatting helpers for distance/time/speed/pace/date values
- `src/lib/analytics/validation.ts`
  - frontend validation for definition shape and chart metric-count constraints
- `src/lib/analytics/formatting.ts`
  - formatting helpers for advanced analytics values/units and previews
- `src/lib/theme.ts`
  - accent theme IDs/palettes and CSS variable application
- `src/lib/mapStyles.ts`
  - raster MapLibre styles (OSM + reduced-complexity CARTO)
- `src/lib/useManagedMapLibre.ts`
  - reusable MapLibre lifecycle hook
  - preserves viewport across style/reduced-complexity toggles
  - adds navigation controls and resize observer support

Styling system:

- `src/index.css` defines CSS variables for light/dark themes and accent-driven glow variables
- `tailwind.config.cjs` maps Tailwind color tokens to those CSS variables (`bg`, `panel`, `muted`, `accent`, `border`, `foreground`)

## 6. API Contracts Between UI and Rust

Mirrored contract files:

- Rust: `src-tauri/src/models.rs`
- TypeScript: `src/types.ts`

When changing a Tauri payload field:

1. Update Rust model in `src-tauri/src/models.rs`
2. Update/implement backend logic (`main.rs`, `db.rs`, etc.)
3. Update TS interface in `src/types.ts`
4. Update wrapper in `src/lib/tauri.ts`
5. Update consuming UI code

Current command/event payloads are camelCase in the frontend and automatically mapped from Rust via serde config.

## 7. Data Storage and Query Shaping

App-owned storage:

- SQLite DB in app data dir: `activities.sqlite`
- JSON settings in app config dir: `settings.json`

Data shaping choices in current implementation:

- `activities.track_json` stores a downsampled polyline (map-friendly payload size)
- `activity_samples` stores per-sample rows for charting (not pre-downsampled at write time)
- `get_activity(...)` returns a downsampled sample set suitable for UI chart rendering
- `get_heatmap_data(...)` applies aggregate point downsampling when necessary via `max_points`

This split keeps detail views responsive while preserving raw-enough samples in SQLite for future windowed queries.

## 8. Scan / Index Lifecycle (End-to-End)

Typical paths:

### Automatic startup scan

1. App loads settings.
2. If an import folder exists, `App.tsx` triggers `runScan()` once for that folder path.
3. App store listens for `scan:progress` and updates UI scan state.
4. On completion, app store refreshes settings (`lastScanTimestamp`) and clears cached activity lists.

### Manual rescan (Settings)

1. User clicks `Rescan`.
2. `SettingsPage` calls `runScan(false)` via app store.
3. Scanner performs incremental scan with stale-file pruning.
4. Results appear in `ScanStatusCard` and optional error list.

### Clear Cache + Full Rescan

1. User confirms full rescan in `SettingsPage`.
2. `runScan(true)` calls `scan_import_folder(full_rescan: true)`.
3. Backend clears `activities` + `activity_samples` and rebuilds from disk.

## 9. Build, Packaging, and Release

Local development:

- `npm install`
- `npm run tauri dev`

Production build:

- `npm run tauri build`

Tauri config (`src-tauri/tauri.conf.json`) notes:

- frontend dev server expected at `http://127.0.0.1:1420`
- bundle targets enabled (`targets: "all"`)
- macOS minimum system version set to `12.0`
- icon source is `src-tauri/icons/icon.png`

GitHub release workflow (`.github/workflows/release.yml`):

- triggers on tag push `v*`
- verifies version alignment across:
  - tag
  - `package.json`
  - `src-tauri/tauri.conf.json`
  - `src-tauri/Cargo.toml`
- builds macOS `.app` and `.dmg`
- uses ad-hoc signing (`APPLE_SIGNING_IDENTITY="-"`)
- publishes artifacts to GitHub Releases via `tauri-apps/tauri-action`

## 10. Extension Guide

### Add a new Tauri command

1. Add/extend models in `src-tauri/src/models.rs`.
2. Implement logic in `src-tauri/src/db.rs`, `src-tauri/src/parser.rs`, or a new module.
3. Add `#[tauri::command]` function in `src-tauri/src/main.rs`.
4. Register it in `tauri::generate_handler![...]`.
5. Add a typed wrapper in `src/lib/tauri.ts`.
6. Add/extend TS types in `src/types.ts`.
7. Consume it from a page/store/component.

### Add a new persisted setting

1. Add field + default in Rust `Settings` (`src-tauri/src/models.rs`).
2. Add setter command in `main.rs` (or extend existing command path).
3. Mirror field in TS `Settings` (`src/types.ts`).
4. Add UI control in `SettingsPage.tsx` and app store updater in `useAppStore.ts`.
5. Apply behavior where needed (theme/map/filter/etc.).

### Add a new activity filter

1. Add field to Rust `ActivityFilters` and TS `ActivityFilters`.
2. Extend SQL predicates in `db::list_activities(...)`.
3. Pass it through `src/lib/tauri.ts` wrapper (if shape changed).
4. Add UI controls in the relevant page (`ActivitiesPage`, `DashboardPage`, `HeatmapPage`, etc.).

### Add a new chart/query optimization path

A likely next extension is reusing the new analytics evaluator infrastructure to add cached/precomputed custom analytics results (instead of recomputing everything on demand per run).

## 11. Known Implementation Notes / Gaps

Current codebase deviations from the original prototype spec in `AGENTS.md`:

- The app now includes an **Advanced Analytics** prototype page and `run_advanced_analytics(request)` command instead of a generic `get_stats()` API.
- Advanced Analytics is intentionally limited to a guided builder, AND-only conditions, simple title text matching (no regex), and time-series charts only in the current prototype.
- The app currently supports **FIT** in addition to TCX/TXC (an expansion beyond the original TCX-only spec).
- `MonthCalendar.tsx` is present but not used by the current dashboard implementation.
- There is no automated test suite in the repository yet (the `test/` folder contains sample FIT files, not test code).

Operational note:

- The app is local-first and has no backend server, but map basemaps are loaded from external tile providers (OSM/CARTO) when map views are displayed.
