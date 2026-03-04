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
- Moving time is tracked separately from total duration (prefers FIT `total_timer_time`; otherwise estimated from sample movement), and computed avg speed/pace uses moving time when available
- Route-level lazy loading for faster initial app startup
- Workout category derivation (`Running`, `Biking`, `Strength`, etc.) from TCX/FIT sport + notes
- Workout titles stored for every activity (FIT session/workout names when available, otherwise generated fallback titles)
- Single visible workout category in UI (used for filtering)
- Activities filters auto-apply on change (no Apply button)
- Light mode by default with optional dark mode toggle in Settings
- Accent color themes selectable in Settings (applies across UI + route overlays/charts)
- Settings tabs for Import and Appearance
- Settings tab for Athlete Metrics with configurable heart-rate zone cutoffs (Z1-Z4 upper bounds; Z5 auto-derived)
- UI view/filter state is remembered across navigation (e.g. Settings tab, Dashboard calendar view, Heatmap filters); sidebar sections reopen the last route for Dashboard/Heatmap/Settings, while `Activities` always opens the list page
- Dashboard with a drill-down training calendar (year view -> month view -> activity links)
- Dashboard top summary cards include a weekly activity streak tile (consecutive active weeks)
- Calendar bars can switch between hours, kilometers, and activity count
- Hovering month or year bars uses horizontal cursor position (full-height hit area) and highlights the corresponding calendar day/month workout context with a quick pop animation
- Filterable/sortable activities table (uses stored imported elevation gain summaries for fast loading)
- Active sort direction indicators (`▲`/`▼`) in activities table headers
- In-memory activities list caching for snappy return navigation (no refetch unless filters/data change)
- Activity detail with a right-side metric rail (including duration + moving time), route map (when GPS is present), and switchable charts (distance-based when GPS track exists; time-based fallback when GPS is unavailable) with combined overlay or split plots, shared hover cursor/stats, elevation background in combined mode, zoom-aware adaptive vertical scaling for visible series, drag-to-zoom/click-to-reset, dedicated heart-rate metric card (avg/min/max), and elevation gain that prefers FIT-reported total ascent when available (otherwise summed positive ascent)
- Activity detail heart-rate zone pie chart + breakdown (time spent in configured zones for workouts with heart-rate samples)
- Activity detail charts automatically include cadence and power plots/toggles when those samples are present in imported TCX/FIT files
- Activity detail chart hover can highlight the corresponding GPS position on the route map with an animated moving dot (when sample coordinates are available)
- Adaptive chart sample loading by zoom window (configurable max visible chart samples in Settings)
- Continuous, Google Maps-style smooth zooming/panning on map views
- Toggling "Reduced complexity" preserves the current map viewport (pan/zoom)
- Map views support in-place maximize/minimize (with `Esc` to close expanded view)
- Global path-based heatmap page that overlays all matching GPS tracks
- Heatmap filters for time span (presets + custom), category, and sport type
- Advanced Analytics tab (prototype) with locally saved custom metrics, formula metrics, threshold streaks, and time-bucketed charts (bar/line/stacked bar), plus separate Configure/View tabs (View opens by default with an at-a-glance overview)
- Advanced Analytics Configure library supports per-section metric reordering (up/down controls for base metrics and formula metrics), and the saved order is used throughout previews and View cards
- Advanced Analytics cards (metrics, streaks, chart views) each have their own adjustable time range (including `7d`, `30d`, `90d`, `365d`, `all`, and custom dates), so different cards can be compared over different windows in the same View
- Advanced Analytics time ranges are configured in **Configure**; the **View** tab is read-only and shows the active range per card as an indicator
- Advanced Analytics View streak cards are compact and at-a-glance: they show current streak, longest streak (high score), status, a clear current day/week period label, and current period value
- Advanced Analytics supports title-based conditions (e.g. push/pull names), grouped conditions (`OR` between groups, `AND` within each group), and sample-derived metrics such as heart-rate zone time via `Sample time` rules, including a minimum continuous-match duration to ignore short fluctuations
- Advanced Analytics streaks can require multiple metrics at once (`AND`): for example, a weekly streak can require both a `pull` metric and a `push` metric to each meet the same threshold in the same week
- Metric Builder condition UIs use a flatter layout for complex logic (fewer nested containers and per-group condition counts) to keep dense AND/OR rule sets easier to scan
- `Sample time` metric previews include an activity-level timeline strip that highlights which contiguous sub-intervals were included vs filtered out by the minimum continuous-match threshold, with progressive “Show more” expansion and a one-click “Show all” option for larger activity sets
- `Sample time` metric preview activities are clickable: selecting a row opens Activity Detail, and returning to Advanced Analytics preserves the analytics view context (including the active Configure/View tab)
- Advanced Analytics metric builders use a predefined unit-display dropdown with `Auto` as the default (for example `Auto`, `%`, `s`, `count`, `km`, `bpm`) instead of free-form text input, and metric values/series are converted to the selected compatible display unit (including ratio-to-percent scaling, e.g. `0.5` -> `50%`)
- Advanced Analytics metric/chart plots support Activity Detail-style interactions and visual treatment: drag-to-zoom on x-axis buckets, click-to-reset, zoom-window rendering so y-axes re-fit to the visible range, matching tooltip/axis/grid styling, no chart animations, multi-series legends, and stacked bars that round only the true stack top (internal segment joins stay square)
- Advanced Analytics keeps an in-memory result cache (keyed by analytics definitions + per-card request range + last scan timestamp), so revisiting the page feels instant when nothing changed; recomputation only runs when definitions/range/data version change or when you press `Recompute`
- Chart text/number labels inside plot surfaces are non-selectable to avoid accidental text highlighting during drag-to-zoom
- Standardized display formatting: durations/times render as `HH:mm:ss`, dates as `dd.MM.yyyy` (or `dd.MM.yyyy HH:mm:ss` where date+time is shown), and distances in kilometers (`km`)
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
   - **Appearance** tab for dark mode, accent color theme, chart sample cap, and heatmap rendering preferences (including optional 100% heatmap opacity).
   - **Athlete Metrics** tab for heart-rate zone cutoffs used in workout zone breakdowns.
   - If you imported activities before adaptive chart sampling was added, run **Clear Cache + Full Rescan** once so chart zoom can use denser stored samples.
5. Explore:
   - **Dashboard** for yearly calendar overview, month drill-down, clickable activity entries, and a weekly streak indicator
   - Use dashboard arrows to move between years/months, click metric cards to switch bar mode (hours/km/activities), click year bars to drill into a month, and click month bars to open an activity from that day
   - In month view, move horizontally across daily bars to see a quick popover and auto-highlight the corresponding workout day and all visible workout cards
   - In year view, move horizontally across weekly bars to preview that week and auto-highlight all matching days in that week across month/day mini-bars
   - **Activities** for filtering/sorting workouts (category + distance filters auto-apply)
   - **Heatmap** for a global path heatmap (overlapping GPS tracks; filter by time span/category/sport)
   - Enable **Reduced complexity (grayscale)** in Heatmap to declutter the map and emphasize route overlap
   - **Advanced Analytics** to build custom metrics/streaks/charts (prototype): guided builder, grouped conditions (`OR` between groups, `AND` within each group), simple title text matching (no regex), optional minimum continuous-match time for `Sample time` metrics with activity timeline previews of included/filtered intervals, clickable preview activities that open Activity Detail, time-series charts by day/week/month, separate Configure/View tabs, and per-card time ranges; streak builders support multi-metric `AND` requirements (same threshold per required metric), View metric cards show scalar values only in a responsive grid, streak cards show current/longest streak plus clear current-period labels, charts appear only when explicitly configured under Chart Views, and `Sample time` activity previews remain configure-only
   - In **Advanced Analytics** metric/chart previews, click-drag across the plot to zoom the visible time buckets; single-click resets to full range
   - **Activity Detail** for metrics plus a route map (GPS activities) and a chart area that switches between distance-based plots (with GPS) and time-based plots (without GPS); split view hides unavailable metric panels and surfaces cadence/power panels when present
   - Hover **Activity Detail** charts to see the matching point on the route map highlighted with an animated moving dot (when GPS samples exist)
   - In **Activity Detail** charts, click-drag across the plot to zoom into the visible x-axis range (distance or elapsed time); chart Y-axes/overlay scaling automatically re-fit to the visible segment, and single-click resets back to the full range
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

### Cutting a release

1. Update the version in all three files so they match exactly:
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`
2. Commit the release changes on `main`.
3. Create and push an annotated version tag (`vX.Y.Z`):

```bash
git checkout main
git pull --ff-only
git tag -a v0.1.2 -m "Trajectory v0.1.2"
git push origin main
git push origin v0.1.2
```

After pushing the tag:
1. Open GitHub Actions and confirm the `Release` workflow for the tag (for example, `v0.1.2`) is green.
2. Open the GitHub Release for that tag and confirm release assets include the macOS installer (`.dmg`).

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
- `set_chart_max_samples(chart_max_samples)`
- `set_heart_rate_zone_upper_bounds_bpm(upper_bounds_bpm)`
- `scan_import_folder(full_rescan?)`
- `list_activities(filters)`
- `get_activity(id)`
- `get_activity_samples(id, query?)`
- `get_heatmap_data(filters)`
- `run_advanced_analytics(request)`

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

`get_activity_samples(id, query?)` supports:
- `distanceMinKm`, `distanceMaxKm` (optional visible chart window)
- `maxSamples` (optional cap for returned chart samples in that window)

`run_advanced_analytics(request)` supports:
- `startDate`, `endDate` (optional time-range bounds)
- `metrics` (base + formula metric definitions)
- base `sampleTime` metrics can set `minimumSampleMatchSeconds` to ignore short matching bursts
- `streaks` (daily/weekly threshold streak definitions)
- `charts` (bar/line/stacked-bar time-series chart definitions)

Progress events:

- `scan:progress` `{ parsed, total, currentFile }`
- `scan:done` `{ added, updated, skipped, errors }`

## Non-Goals (Current Prototype)

- Strava API integration
- Cloud sync
- User accounts/login
- Editing activity source files (`.tcx` / `.fit`)
- Mobile app
