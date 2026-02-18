# TCX Desktop (macOS-first) – Prototype Specification (Rust + React + Tauri)

## 1) Goal

Build a **Strava-inspired** local desktop app that parses and analyzes **TCX** activity files.

Constraints:
- **No server** (no HTTP API, no local web server for users)
- Runs entirely **locally**
- **macOS first**, but architecture should be easily portable to Windows/Linux
- Stack: **Rust backend + React (Vite) frontend + Tauri shell**
- Users choose a single **Import Folder** that already exists on disk and contains their `.tcx` files

## 2) Import Folder Model

- User selects ONE folder: `Import Folder`
- The app reads `.tcx` files from that folder (optionally recursively)
- The app stores:
  - SQLite database
  - caches / derived data
  - app settings
  in the OS-standard app data locations (e.g. `~/Library/Application Support/<AppName>/`)

The import folder remains “owned” by the user and unchanged.

## 3) Installation Targets

Short term:
- Build & run locally from source

Medium term:
- **DMG** download artifact from GitHub Releases

Long term:
- **Homebrew cask** install (`brew install --cask <app>`)

Design the release pipeline so the same packaged artifacts can be used for DMG and brew cask.

## 4) Tech Stack

### Shell
- Tauri v2
- Rust stable

### Frontend
- React + TypeScript
- Vite
- TailwindCSS
- React Router
- Zustand (or equivalent minimal state store)
- Charts: Recharts
- Tables: TanStack Table
- Dates: date-fns
- Map: MapLibre GL (vector map) OR Leaflet (acceptable fallback)

### Backend (Rust)
- quick-xml (streaming TCX parsing)
- serde / serde_json
- chrono
- rusqlite (or sqlx + sqlite)
- anyhow / thiserror

## 5) Data Storage (App-owned)

### Locations (use Tauri path APIs / platform conventions)
- App data directory: DB, caches
- App config directory: settings

### Database
SQLite file stored in app data dir, e.g.
- `activities.sqlite`

### Settings
Store at least:
- `import_folder_path`
- `scan_recursive: bool`
- `last_scan_timestamp`


## 6) Core Features (Prototype Must Include)

### 6.1 Import Folder Selection & Permissions (macOS)
- On first launch, show a “Select Import Folder” screen
- Store the folder path in settings
- On macOS: ensure access continues to work after restart (use Tauri APIs/patterns; if persistent access is hard, re-prompt gracefully)

### 6.2 Folder Scanning & Indexing
- “Rescan” button
- Scan for `*.tcx` (optionally recursive; make it a toggle)
- Detect changes:
  - track file path + last modified time + size
  - re-parse only if changed
- Parse new/changed activities into DB
- Never block UI: run scans/parsing in background, report progress to UI

### 6.3 Main Dashboard (Strava-inspired)
Default route: Dashboard with:
- Calendar overview (month view)
- Weekly totals
- Year-to-date totals
- Recent activities list

Calendar requirements:
- Month grid
- Days with activities highlighted
- Clicking a day shows activities for that day
- Weekly rollups shown (distance/time)

### 6.4 Activity List View
Sortable + filterable table with columns:
- Date/time
- Sport type
- Distance
- Duration
- Avg speed / pace
- Elevation gain
- Avg HR

Filters:
- Date range
- Sport type
- Distance range

### 6.5 Activity Detail View
Click activity to open detail page with:
Top metric cards:
- Distance
- Duration
- Avg speed / pace
- Elevation gain
- Avg HR / Max HR (if present)

Map:
- Render GPS track if lat/lon exists
- Fit bounds to route
- If no GPS, show “No GPS track available”

Charts:
- Speed vs time (if available or computed)
- Heart rate vs time (if available)
- Elevation vs distance/time (if altitude present)

### 6.6 Statistics View
Tabs:
- Week
- Month
- Year
- All time

Metrics:
- Total distance
- Total time
- Total elevation
- Activity count

Charts:
- Histogram: workout duration
- Histogram: distance
- Trend line: weekly distance
- Trend line: monthly distance

## 7) TCX Parsing & Analytics (Rust)

### 7.1 Parse Requirements
Extract from TCX where possible:
- Activity start time
- Sport type
- Trackpoints:
  - time
  - lat/lon
  - altitude
  - heart rate
  - speed (if present)

### 7.2 Compute Derived Stats
Compute (robustly with missing data):
- Duration (from timestamps)
- Distance:
  - If TCX provides distance, use it
  - Else compute from GPS points (haversine)
- Elevation gain:
  - sum of positive deltas (with simple smoothing/threshold optional)
- Avg/max speed
- Avg/max HR
- Moving time (optional in prototype; OK to do later)

### 7.3 Store Strategy
Store:
- Activity summary row (fast to list/calendar)
- A compressed/simplified representation of the track for map display
- Timeseries samples for charts (downsample to avoid huge payloads)

Downsampling guidance:
- Keep <= ~2000 points per activity for UI charts/maps
- Store original count for reference

## 8) Tauri Command API (No HTTP)

Implement commands:
- `get_settings()`
- `set_import_folder(path, recursive)`
- `scan_import_folder() -> progress events + final summary`
- `list_activities(filters) -> summaries`
- `get_activity(id) -> detail (summary + samples)`
- `get_stats(range) -> aggregates + histogram bins`

Use Tauri event emission for progress:
- `scan:progress` { parsed, total, current_file }
- `scan:done` { added, updated, skipped, errors }


UX rules:
- Dark mode default
- Strava-inspired orange accent (#FC4C02)
- Card layout, clean typography, big metrics
- Sidebar navigation: Dashboard / Activities / Statistics / Settings

## 10) Build & Distribution

### 10.1 Local Dev
- `npm install`
- `npm run tauri dev`

### 10.2 Production Build
- `npm run tauri build`
Must produce:
- `.app`
- `.dmg` artifact

### 10.3 GitHub Actions (Prototype-level)
Set up CI that builds macOS artifacts on tag push:
- Upload DMG to Releases

Prepare for future brew cask:
- Ensure deterministic versioning
- Release artifacts named consistently

## 11) Non-Goals (Prototype)
- No Strava API integration
- No cloud sync
- No login/user accounts
- No editing TCX files
- No mobile app

## 12) Deliverables
Agent must deliver:
1. Tauri + React project scaffold
2. Rust TCX parser + analytics
3. SQLite database layer
4. Import Folder selection + rescan + progress UI
5. Dashboard with calendar overview + weekly/year summaries
6. Activity list page
7. Activity detail page with map + charts
8. Statistics page with histograms/trends
9. DMG build working
10. README with:
   - dev setup
   - build instructions
   - how to use (select folder, rescan, view)

## 13) Acceptance Criteria
Accepted if:
- I can launch the app on macOS
- Select an existing folder of `.tcx`
- Click “Rescan”
- See activities appear in calendar + list
- Open an activity and see metrics + (if available) map + charts
- Open stats view and see aggregates + histograms
- No server is required to run the app
