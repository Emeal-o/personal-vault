import bcrypt from "bcryptjs";

export async function verifyMasterPin(pin: unknown): Promise<boolean> {
  if (!pin || typeof pin !== "string") return false;
  const hash = process.env.MASTER_PIN_HASH;
  if (!hash) return false;
  return bcrypt.compare(pin, hash);
}