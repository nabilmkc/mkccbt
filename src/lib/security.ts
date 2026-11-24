import crypto from 'node:crypto';

function getSessionSecret(): string {
  return (
    process.env.SESSION_SECRET ||
    process.env.SQL_PASSWORD ||
    'sakaujian-cbt-default-dev-secret-change-in-prod'
  );
}

export interface SessionPayload {
  userId: number;
  uid: string;
  username: string;
  name: string;
  role: 'super_admin' | 'guru' | 'siswa';
  exp: number;
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function base64UrlDecode(input: string): string {
  const padded = input.replaceAll('-', '+').replaceAll('_', '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64').toString('utf8');
}

export function signSessionToken(
  payload: Omit<SessionPayload, 'exp'>,
  ttlSeconds = 60 * 60 * 12
): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = base64UrlEncode(JSON.stringify(fullPayload));
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(`cbt.${encoded}`)
    .digest();
  return `cbt.${encoded}.${base64UrlEncode(sig)}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token.startsWith('cbt.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [, encoded, providedSig] = parts;
  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', getSessionSecret()).update(`cbt.${encoded}`).digest()
  );

  const providedBuf = Buffer.from(providedSig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (providedBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as SessionPayload;
    if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function issueCsrfToken(subjectKey: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = Math.floor(Date.now() / 1000).toString();
  const data = `${subjectKey}.${ts}.${nonce}`;
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', getSessionSecret()).update(`csrf.${data}`).digest()
  );
  return `${ts}.${nonce}.${sig}`;
}

export function verifyCsrfToken(token: string | undefined, subjectKey: string): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [tsStr, nonce, providedSig] = parts;
  const ts = Number(tsStr);
  if (!Number.isFinite(ts)) return false;
  // Valid for 24 hours
  if (Math.floor(Date.now() / 1000) - ts > 60 * 60 * 24) return false;

  const data = `${subjectKey}.${tsStr}.${nonce}`;
  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', getSessionSecret()).update(`csrf.${data}`).digest()
  );
  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function sanitizeText(value: unknown, maxLength = 5000): string {
  if (typeof value !== 'string') return '';
  return value
    .replaceAll('\0', '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .trim()
    .slice(0, maxLength);
}

export function normalizeExamCode(value: unknown): string {
  return sanitizeText(value, 32)
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '');
}
