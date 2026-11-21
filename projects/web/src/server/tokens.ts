import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

export const INVITE_TTL_MS = 15 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newId(bytes = 12): string {
  return randomBytes(bytes).toString('base64url');
}

/** Nine digits formatted as `123-456-789`. */
export function newPin(): string {
  const digits = String(randomInt(0, 1e9)).padStart(9, '0');
  return digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1-$2-$3');
}

export function normalizePin(input: string): null | string {
  const digits = input.replace(/\D/g, '');
  return digits.length === 9
    ? digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1-$2-$3')
    : null;
}

/** Uniform float in [0, 1) from the CSPRNG, for tile draws. */
export function secureRandom(): number {
  return randomInt(0, 2 ** 48 - 1) / 2 ** 48;
}

/** `gameId.expiresAt.signature`, used in invite QR codes. */
export function signInvite(
  secret: string,
  gameId: string,
  expiresAt: number,
): string {
  const payload = `${gameId}.${expiresAt}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function verifyInvite(
  secret: string,
  token: string,
  now = Date.now(),
): null | string {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [gameId, expires, signature] = parts;
  const expected = Buffer.from(
    sign(secret, `${gameId}.${expires}`),
  );
  const actual = Buffer.from(signature);
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(expected, actual)
  ) {
    return null;
  }
  return Number(expires) >= now ? gameId : null;
}

function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');
}
