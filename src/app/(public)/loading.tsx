export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-6 py-10" aria-busy="true" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="h-4 w-full max-w-md animate-pulse rounded-md bg-muted" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
