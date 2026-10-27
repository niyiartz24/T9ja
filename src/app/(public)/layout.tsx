import Link from "next/link";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4 text-sm">
          <Link href="/" className="text-base font-semibold tracking-tight">Ticket9ja</Link>
          <Link href="/orders/lookup" className="hover:underline">Find my order</Link>
          <Link href="/login" className="ml-auto text-muted-foreground hover:underline">Organizer sign in</Link>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t py-6 text-center text-sm text-muted-foreground">&copy; {new Date().getFullYear()} Ticket9ja</footer>
    </div>
  );
}
