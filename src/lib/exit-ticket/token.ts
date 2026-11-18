/**
 * Exit Ticket Token Utilities
 *
 * Pure functions for token generation, URL construction, format validation,
 * and expiry checking. Only `generateAndSaveToken` imports Prisma — all other
 * exports are free of database dependencies.
 */

import crypto from 'crypto';
import { prisma } from '@/lib/db/client';

// ─── Constants ────────────────────────────────────────────────────────────────

const TOKEN_REGEX = /^[a-zA-Z0-9-]{8,128}$/;
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
const FALLBACK_BASE_URL = 'https://remediaide.app';

// ─── 2.1 generateToken ────────────────────────────────────────────────────────

/**
 * Generate a cryptographically secure token.
 * Returns a 64-character lowercase hex string derived from 32 random bytes.
 */
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

// ─── 2.2 generateAndSaveToken ─────────────────────────────────────────────────

/**
 * Generate a token and persist it to the database.
 * Throws if the database write fails.
 */
export async function generateAndSaveToken(params: {
  sessionPinId: string;
  remedialGroupId: string;
  schoolId: string;
}): Promise<string> {
  const token = generateToken();

  await prisma.exitTicketToken.create({
    data: {
      token,
      sessionPinId: params.sessionPinId,
      remedialGroupId: params.remedialGroupId,
      schoolId: params.schoolId,
      status: 'UNUSED',
    },
  });

  return token;
}

// ─── 2.3 buildQrUrl ───────────────────────────────────────────────────────────

/**
 * Build a fully-qualified QR code URL for an exit ticket token.
 *
 * - Strips all trailing slashes from `baseUrl`.
 * - Falls back to `https://remediaide.app` and logs a warning when `baseUrl`
 *   is absent or empty.
 * - Throws if the resulting URL does not begin with `http://` or `https://`.
 */
export function buildQrUrl(token: string, baseUrl?: string): string {
  const trimmed = (baseUrl ?? '').trim();

  let base: string;
  if (!trimmed) {
    console.warn(
      '[exit-ticket] buildQrUrl: baseUrl is empty or undefined — falling back to ' +
        FALLBACK_BASE_URL
    );
    base = FALLBACK_BASE_URL;
  } else {
    base = trimmed;
  }

  // Strip all trailing slashes
  const normalizedBase = base.replace(/\/+$/, '');
  const url = `${normalizedBase}/exit-ticket/${token}`;

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error(`[exit-ticket] buildQrUrl: invalid URL produced: "${url}"`);
  }

  return url;
}

// ─── 2.4 isValidTokenFormat ───────────────────────────────────────────────────

/**
 * Return `true` when `token` matches the accepted token format:
 * 8–128 characters, only `[a-zA-Z0-9-]`.
 *
 * The regex intentionally accepts a wider character set than the 64-char hex
 * tokens currently generated, for forward-compatibility with alternative
 * generation schemes.
 */
export function isValidTokenFormat(token: string): boolean {
  return TOKEN_REGEX.test(token);
}

// ─── 2.5 isTokenExpired ───────────────────────────────────────────────────────

/**
 * Return `true` when the token is older than 30 days.
 * Expiry is checked at the application layer (not via a database TTL).
 */
export function isTokenExpired(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > EXPIRY_MS;
}
