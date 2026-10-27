export type EmailMessage = { to: string; subject: string; html: string; text: string };

/** Throws on failure so callers can decide how to recover. */
export async function sendEmail(msg: EmailMessage): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV === "production") throw new Error("Email provider is not configured");
    console.log(`[email:dev] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text }),
  });
  if (!res.ok) throw new Error(`Email provider responded ${res.status}`);
}

export function invitationEmail(link: string): Omit<EmailMessage, "to"> {
  return {
    subject: "You're invited to organize events on Ticket9ja",
    text: `You've been invited to join Ticket9ja as an organizer.\n\nAccept your invitation: ${link}\n\nThis link is single-use and expires in 7 days. If you weren't expecting it, ignore this email.`,
    html: `<p>You've been invited to join Ticket9ja as an organizer.</p><p><a href="${link}">Accept your invitation</a></p><p>This link is single-use and expires in 7 days. If you weren't expecting it, ignore this email.</p>`,
  };
}
