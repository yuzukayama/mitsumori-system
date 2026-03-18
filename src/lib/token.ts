import { randomBytes } from "crypto";

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

export function getTokenExpiryDate(deadline: Date, bufferDays = 7): Date {
  const expiry = new Date(deadline);
  expiry.setDate(expiry.getDate() + bufferDays);
  return expiry;
}
