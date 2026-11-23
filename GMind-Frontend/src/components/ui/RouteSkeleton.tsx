export default function RouteSkeleton({ label }: { label: string }) {
  return (
    <div role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-6">
        <div className="h-8 w-1/3 rounded-lg bg-surface-subtle motion-safe:animate-pulse" />
        <div className="h-4 w-1/2 rounded-lg bg-surface-subtle motion-safe:animate-pulse" />
        <div className="h-40 rounded-xl border border-line bg-surface p-4">
          <div className="h-full rounded-lg bg-surface-subtle motion-safe:animate-pulse" />
        </div>
        <div className="h-64 rounded-xl border border-line bg-surface p-4">
          <div className="h-full rounded-lg bg-surface-subtle motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  );
}
