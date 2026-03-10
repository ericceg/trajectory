# Trajectory

![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Desktop](https://img.shields.io/badge/desktop-Tauri%20v2-yellow)
![Backend](https://img.shields.io/badge/backend-Rust-orange)
![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20TypeScript-3178c6)


> **Lightweight local workout analyzer that keeps your data private**. 
A local-first desktop app for exploring `.tcx`/`.fit` activities with dashboard, maps, streaks and custom analytics.
No cloud sync, no account, no server. Just you and your training data.


## Why Trajectory

Trajectory is built for athletes who want full control of their training data.
You get
- a modern, responsive dashboard to get an overview of your activities
- a local-first architecture that keeps your data private and secure
- a powerful tool to explore your training history and build custom analytics (my favorite use case: time in aerobic zone).


## Download

1. Open the [latest release](https://github.com/ericceg/trajectory/releases/latest)
2. Download the `.dmg` asset
3. Install and launch the app

Notes:
- Current release builds are ad-hoc signed (not notarized), so macOS may show a security warning on first launch.
- If prompted, right-click the app, choose **Open**, then confirm.

## What You Can Do

- Import `.tcx` / `.fit` files from any local folder
- Keep your data fresh with incremental rescans (or full rebuilds when needed)
- Explore training from multiple angles: dashboard, activity list, and activity detail
- Visualize routes with per-activity maps and a global GPS heatmap
- Build your own advanced analytics: custom metrics, streaks, and charts

## Usage

1. Launch Trajectory.
2. Select your activity folder containing `.tcx` and/or `.fit` files.
3. Start in **Dashboard** for a quick overview of training load and history.
4. Use **Activities** to filter, sort, and inspect individual workouts.
5. Open **Heatmap** to spot route patterns across all GPS sessions.
6. Use **Advanced Analytics** to define custom metrics, streaks, and charts.
7. Open **Settings** to customize appearance, configure heart-rate zones, and run rescans.

## Privacy

- Your activity files stay local
- Data is processed on-device
- No account or telemetry backend required

## Platform Support

- macOS

## Developer Setup (Build From Source)

This section is for contributors and developers.

### Prerequisites

- Node.js 22+
- Rust stable

### Run in development

```bash
npm install
npm run tauri dev
```

### Quality checks

```bash
npm run check
```

### Build production artifacts locally

```bash
npm run tauri build
```

Output artifacts are generated under:

- `src-tauri/target/release/bundle/macos/*.app`
- `src-tauri/target/release/bundle/dmg/*.dmg`

## Documentation

- Developer guide: [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md)

## Tech Stack

- Tauri v2 + Rust
- React + TypeScript + Vite + Tailwind CSS
- SQLite (local app storage)

## License

MIT. See [`LICENSE`](LICENSE).
