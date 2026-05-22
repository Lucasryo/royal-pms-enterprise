export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent ${className}`}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex h-full min-h-screen items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
