import { hash, verify } from "@node-rs/argon2";

export const hashPassword = (pw: string) => hash(pw);

export async function verifyPassword(hashed: string, pw: string) {
  try {
    return await verify(hashed, pw);
  } catch {
    return false;
  }
}
