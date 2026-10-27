export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local[0] ?? ""}${"*".repeat(Math.max(3, local.length - 1))}@${domain}`;
}
