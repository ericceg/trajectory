import type { ScanDoneEvent, ScanProgressEvent } from '@/types';

interface ScanStatusCardProps {
  scanning: boolean;
  progress: ScanProgressEvent | null;
  done: ScanDoneEvent | null;
}

export function ScanStatusCard({ scanning, progress, done }: ScanStatusCardProps) {
  if (scanning && progress) {
    const percent = progress.total > 0 ? Math.round((progress.parsed / progress.total) * 100) : 0;
    return (
      <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Scan In Progress</p>
        <p className="mt-2 text-lg font-semibold text-white">
          {progress.parsed} / {progress.total} ({percent}%)
        </p>
        <p className="mt-1 truncate text-sm text-muted">{progress.current_file}</p>
      </section>
    );
  }

  if (done) {
    return (
      <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Last Scan</p>
        <p className="mt-2 text-sm text-white">
          Added: {done.added} · Updated: {done.updated} · Skipped: {done.skipped}
        </p>
        {done.errors.length > 0 ? (
          <p className="mt-1 text-sm text-accent">Errors: {done.errors.length}. See Settings.</p>
        ) : (
          <p className="mt-1 text-sm text-muted">No parse errors.</p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-4 shadow-card">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Scan</p>
      <p className="mt-2 text-sm text-muted">Run a scan from Settings to index activities.</p>
    </section>
  );
}
