import { afterEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { generateTotpSecret, verifyTotp } from "@/lib/totp";

// A from-scratch RFC 6238 implementation is exactly the kind of code that's
// easy to get subtly wrong (off-by-one on the byte offset, wrong endianness,
// etc.), so this is tested directly against a second, independent
// computation of the same algorithm rather than just round-tripping through
// the same functions.
function referenceHotp(secretBase32: string, counter: number): string {
  const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secretBase32.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of clean) bits += BASE32.indexOf(ch).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const key = Buffer.from(bytes);

  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, "0");
}

describe("TOTP (admin MFA)", () => {
  it("generates a secret that's valid base32 (only A-Z2-7)", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(32); // 160 bits base32-encoded
  });

  it("accepts the correct current code", () => {
    const secret = generateTotpSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const code = referenceHotp(secret, counter);
    expect(verifyTotp(secret, code)).toBe(true);
  });

  it("rejects an incorrect code", () => {
    const secret = generateTotpSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const real = referenceHotp(secret, counter);
    // Flip the code to something guaranteed different.
    const wrong = String((Number(real) + 1) % 1_000_000).padStart(6, "0");
    expect(verifyTotp(secret, wrong)).toBe(false);
  });

  it("rejects malformed input (not 6 digits)", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "12345")).toBe(false);
    expect(verifyTotp(secret, "1234567")).toBe(false);
    expect(verifyTotp(secret, "abcdef")).toBe(false);
    expect(verifyTotp(secret, "")).toBe(false);
  });

  it("tolerates one 30s step of clock drift either direction", () => {
    const secret = generateTotpSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const prevStepCode = referenceHotp(secret, counter - 1);
    const nextStepCode = referenceHotp(secret, counter + 1);
    expect(verifyTotp(secret, prevStepCode)).toBe(true);
    expect(verifyTotp(secret, nextStepCode)).toBe(true);
  });

  it("rejects a code from two steps away (outside the drift window)", () => {
    const secret = generateTotpSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const farCode = referenceHotp(secret, counter + 2);
    expect(verifyTotp(secret, farCode)).toBe(false);
  });

  it("two different secrets never accept each other's code (sanity check against a trivially-broken implementation)", () => {
    const secretA = generateTotpSecret();
    const secretB = generateTotpSecret();
    const counter = Math.floor(Date.now() / 1000 / 30);
    const codeForA = referenceHotp(secretA, counter);
    expect(verifyTotp(secretB, codeForA)).toBe(false);
  });
});

describe("checkAdminTotp (adminAuth integration)", () => {
  afterEach(() => {
    delete process.env.ADMIN_TOTP_SECRET;
  });

  it("doesn't require a code when ADMIN_TOTP_SECRET isn't set (safe rollout default)", async () => {
    delete process.env.ADMIN_TOTP_SECRET;
    const { checkAdminTotp, adminTotpConfigured } = await import("@/lib/adminAuth");
    expect(adminTotpConfigured()).toBe(false);
    expect(checkAdminTotp(undefined)).toBe(true);
    expect(checkAdminTotp("000000")).toBe(true);
  });

  it("requires a correct code once ADMIN_TOTP_SECRET is set", async () => {
    const secret = generateTotpSecret();
    process.env.ADMIN_TOTP_SECRET = secret;
    const { checkAdminTotp, adminTotpConfigured } = await import("@/lib/adminAuth");
    expect(adminTotpConfigured()).toBe(true);
    expect(checkAdminTotp(undefined)).toBe(false);
    expect(checkAdminTotp("000000")).toBe(false);

    const counter = Math.floor(Date.now() / 1000 / 30);
    const validCode = referenceHotp(secret, counter);
    expect(checkAdminTotp(validCode)).toBe(true);
  });
});
