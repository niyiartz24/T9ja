import { LookupForm } from "./lookup-form";

export default function LookupPage() {
  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-2xl font-semibold">Find my order</h1>
      <p className="mt-2 text-sm text-muted-foreground">Enter the reference from your confirmation and the email you used.</p>
      <LookupForm />
    </main>
  );
}
