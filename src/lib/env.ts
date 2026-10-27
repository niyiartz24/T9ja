import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  APP_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().min(3),
  PAYMENT_PROVIDER: z.string().optional(),
  PAYMENT_SECRET_KEY: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
});

let cached: z.infer<typeof schema> | undefined;

/** Server-only. Validated lazily so builds without secrets still work. */
export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const keys = Object.keys(parsed.error.flatten().fieldErrors).join(", ");
      throw new Error(`Invalid environment configuration: ${keys}`);
    }
    cached = parsed.data;
  }
  return cached;
}
