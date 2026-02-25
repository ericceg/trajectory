import type { TrackPoint } from '@/types';

interface BuildTrackGpxParams {
  name: string;
  points: TrackPoint[];
  generatedAt?: Date;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeRouteName(name: string): string {
  const trimmed = name.trim();
  return trimmed || 'Trajectory Route';
}

export function buildTrackGpx({ name, points, generatedAt = new Date() }: BuildTrackGpxParams): string {
  if (points.length < 2) {
    throw new Error('A GPX export requires at least two route points.');
  }

  const safeName = normalizeRouteName(name);
  const trkPoints = points
    .map(
      (point) =>
        `      <trkpt lat="${point.lat.toFixed(6)}" lon="${point.lon.toFixed(6)}"></trkpt>`
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="Trajectory" xmlns="http://www.topografix.com/GPX/1/1">',
    '  <metadata>',
    `    <name>${escapeXml(safeName)}</name>`,
    `    <time>${generatedAt.toISOString()}</time>`,
    '  </metadata>',
    '  <trk>',
    `    <name>${escapeXml(safeName)}</name>`,
    '    <trkseg>',
    trkPoints,
    '    </trkseg>',
    '  </trk>',
    '</gpx>',
    ''
  ].join('\n');
}

export function sanitizeGpxFilename(name: string, generatedAt = new Date()): string {
  const trimmed = name.trim();
  const stem = (trimmed || `trajectory-route-${generatedAt.toISOString().slice(0, 10)}`)
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .toLowerCase();

  const finalStem = stem || `trajectory-route-${generatedAt.toISOString().slice(0, 10)}`;
  return finalStem.endsWith('.gpx') ? finalStem : `${finalStem}.gpx`;
}
