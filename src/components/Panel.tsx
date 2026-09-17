export function Panel({
  title,
  subtitle,
  actions,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            {title ? <h2 className="text-sm font-bold uppercase tracking-[0.14em]">{title}</h2> : null}
            {subtitle ? <p className="mt-1 text-xs text-charcoal/60">{subtitle}</p> : null}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="px-5 py-16 text-center">
      <p className="font-display text-lg uppercase tracking-tight text-charcoal">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-charcoal/60">{body}</p>
    </div>
  );
}
