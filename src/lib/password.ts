import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

type ScryptOptions = { N: number; r: number; p: number };

// promisify collapses the overloads and drops the options argument, so the
// wrapper is typed by hand rather than casting at each call site.
const scrypt = promisify(scryptCb) as unknown as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/**
 * Password storage.
 *
 * scrypt from Node's standard library rather than bcrypt or argon2, because
 * neither ships as pure JavaScript and native modules are the usual cause of a
 * serverless build that works locally and fails on deploy. scrypt is a
 * recognised password KDF and the parameters below are deliberately explicit,
 * so they can be raised later without breaking existing hashes: the cost is
 * stored alongside each one.
 */

const KEYLEN = 64;
const COST = 16384; // 2^14
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plain.normalize("NFKC"), salt, KEYLEN, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
  });

  return ["scrypt", COST, BLOCK_SIZE, PARALLELISM, salt.toString("base64"), derived.toString("base64")].join("$");
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const [scheme, cost, blockSize, parallelism, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;

    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const derived = await scrypt(plain.normalize("NFKC"), salt, expected.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelism),
    });

    // Constant time, so the comparison does not leak how much of the hash matched.
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- strength

export type PasswordProblem = string;

/**
 * Length does more for password strength than character class rules, which
 * mostly push people towards predictable substitutions. Twelve characters is
 * the floor, with a check against the handful of passwords everyone tries.
 */
const OBVIOUS = [
  "password", "12345678", "qwerty", "letmein", "welcome", "admin",
  "hudabeauty", "changeme", "iloveyou", "password1", "abc123",
];

export function checkPasswordStrength(password: string, email?: string): PasswordProblem[] {
  const problems: PasswordProblem[] = [];
  const value = password.trim();

  if (value.length < 12) problems.push("Use at least 12 characters");
  if (value.length > 200) problems.push("That is longer than 200 characters");

  const lower = value.toLowerCase();
  if (OBVIOUS.some((o) => lower.includes(o))) {
    problems.push("It contains a word that is guessed early in any attack");
  }

  if (email) {
    const localPart = email.split("@")[0]?.toLowerCase();
    if (localPart && localPart.length > 2 && lower.includes(localPart)) {
      problems.push("Do not include your email address");
    }
  }

  if (/^(.)\1+$/.test(value)) problems.push("Do not repeat a single character");

  return problems;
}

// ---------------------------------------------------------------- tokens

/**
 * Returns the token to put in a link, and the hash to store. The plain token
 * is never written down anywhere, so a database leak cannot be used to reset
 * anyone's password.
 */
export function createToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * A readable temporary password, for the case where email is not working and a
 * buyer has to read one out. Avoids characters that are misheard or misread.
 */
export function generateTemporaryPassword(): string {
  const words = [
    "amber", "basalt", "cedar", "dahlia", "ember", "fennel", "garnet", "harbour",
    "indigo", "juniper", "kestrel", "lantern", "marble", "nectar", "opal", "pewter",
    "quartz", "rosewood", "saffron", "thistle", "umber", "velvet", "willow", "zephyr",
  ];
  const pick = () => words[randomBytes(1)[0] % words.length];
  const digits = String(randomBytes(2).readUInt16BE(0) % 10000).padStart(4, "0");
  return `${pick()}-${pick()}-${pick()}-${digits}`;
}

/** Failed sign-in throttling. Escalates so a typo costs nothing but a script stalls. */
export function lockoutFor(failedCount: number): Date | null {
  if (failedCount < 5) return null;
  const minutes = Math.min(60, 2 ** (failedCount - 5));
  return new Date(Date.now() + minutes * 60_000);
}
