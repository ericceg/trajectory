import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));

test('production map worker indexes GPS routes without references to bundler helpers', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'trajectory-map-worker-'));
  let workerUrl;
  try {
    // Use the app's production target/minifier and the shared map hook, including
    // its worker initialization. A development-only import misses this regression.
    await build({
      root,
      logLevel: 'silent',
      plugins: [{
        name: 'map-worker-regression-entry',
        resolveId(id) { if (id === 'map-worker-test') return '\0map-worker-test'; },
        load(id) {
          if (id === '\0map-worker-test') {
            return `import '@/lib/useManagedMapLibre';
              import maplibregl from 'maplibre-gl';
              export default maplibregl.getWorkerUrl();`;
          }
        }
      }],
      build: {
        outDir,
        emptyOutDir: true,
        rollupOptions: {
          input: 'map-worker-test',
          preserveEntrySignatures: 'strict',
          output: { entryFileNames: 'worker-test.mjs' }
        }
      }
    });
    const previousWindow = globalThis.window;
    globalThis.window = { URL };
    try {
      ({ default: workerUrl } = await import(pathToFileURL(path.join(outDir, 'worker-test.mjs'))));
    } finally {
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
    const source = await (await fetch(workerUrl)).text();
    let receive;
    let resolveResponse;
    const response = new Promise(resolve => { resolveResponse = resolve; });
    const self = {
      addEventListener(type, listener) { if (type === 'message') receive = listener; },
      removeEventListener() {},
      postMessage(message) { resolveResponse(message); },
      importScripts() {}
    };
    // Execute the exact emitted blob in an isolated worker-like global scope.
    // These browser stubs are unused for GeoJSON but required by its serializer.
    const context = vm.createContext({
      self, location: { origin: 'tauri://localhost' }, navigator: { userAgent: 'node' },
      console, setTimeout, clearTimeout, AbortController, performance, TextDecoder,
      TextEncoder, URL, Blob, fetch, WorkerGlobalScope: Object,
      ImageData: class ImageData {}, ImageBitmap: class ImageBitmap {}
    });
    vm.runInContext(source, context, { filename: 'map-worker.js' });
    assert.equal(typeof receive, 'function');
    receive({ data: {
      id: 'gps-route', type: 'LD', sourceMapId: 1, origin: 'tauri://localhost',
      data: {
        type: 'geojson', source: 'route',
        data: { type: 'Feature', properties: {}, geometry: {
          type: 'LineString', coordinates: [[8.95, 46.98], [9.05, 47.02]]
        } },
        geojsonVtOptions: { extent: 8192, maxZoom: 18, tolerance: 6, buffer: 2048 }
      }
    } });
    let timeout;
    try {
      const result = await Promise.race([response, new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Map worker did not respond')), 5000);
      })]);
      assert.equal(result.id, 'gps-route');
      assert.equal(result.type, '<response>');
      assert.equal(result.error, null, result.error?.message);
      assert.ok(result.data, 'GeoJSON indexing should complete');
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    await rm(outDir, { recursive: true, force: true });
  }
});
