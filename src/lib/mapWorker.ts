import maplibregl from 'maplibre-gl';
import workerSource from 'maplibre-gl/dist/maplibre-gl-csp-worker.js?raw';

// MapLibre's default bundle builds its worker with Function.toString(). Vite's
// production transforms can introduce helpers outside those serialized functions,
// leaving GeoJSON processing with undefined variables in the packaged app.
// Keep the standalone worker intact; a blob also works with Tauri's custom scheme.
maplibregl.setWorkerUrl(
  URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }))
);
