import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  throw new Error('Generating the macOS icon requires Apple iconutil on macOS.');
}

const root = fileURLToPath(new URL('../', import.meta.url));
const icons = join(root, 'src-tauri/icons');
const temporary = mkdtempSync(join(tmpdir(), 'trajectory-macos-icon-'));

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}).`);
}

function render(source, sizes, output) {
  const svg = readFileSync(join(icons, source), 'utf8');
  const originalViewBox = 'viewBox="0 0 256 256"';
  if (!svg.includes(originalViewBox)) throw new Error(`Unexpected viewBox in ${source}.`);

  // The tile spans 248 source units. Give it an 824px body on a 1024px
  // macOS canvas, with 100px of transparent padding on each side.
  const span = 248 * 1024 / 824;
  const origin = (256 - span) / 2;
  const padded = join(temporary, source);
  writeFileSync(padded, svg.replace(originalViewBox, `viewBox="${origin} ${origin} ${span} ${span}"`));
  run('npm', ['run', 'tauri', '--', 'icon', padded, '--output', output,
    ...sizes.flatMap((size) => ['--png', String(size)])]);
}

try {
  const small = join(temporary, 'small');
  const full = join(temporary, 'full');
  render('trajectory-app-icon-small.svg', [16, 32, 64], small);
  render('trajectory-app-icon.svg', [128, 256, 512, 1024], full);

  const iconset = join(temporary, 'Trajectory.iconset');
  mkdirSync(iconset);
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = size * scale;
      const source = join(pixels <= 64 ? small : full, `${pixels}x${pixels}.png`);
      const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`;
      copyFileSync(source, join(iconset, name));
    }
  }
  const output = join(temporary, 'icon.icns');
  run('iconutil', ['-c', 'icns', '-o', output, iconset]);
  copyFileSync(output, join(icons, 'icon.icns'));
  console.log('Updated macOS icon with 100px padding at 1024px.');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
