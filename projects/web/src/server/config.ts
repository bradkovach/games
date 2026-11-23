import { randomBytes } from 'node:crypto';

export interface ServerConfig {
  /** Host names Angular SSR may render for (SSRF guard). */
  allowedHosts: string[];
  dataDir: string;
  oidc: {
    clientId: string;
    clientSecret: string;
    issuer: string;
  };
  publicUrl: string;
  secret: string;
}

export function loadConfig(): ServerConfig {
  // Blank values (e.g. `KEY=` in compose) count as unset.
  const secret =
    process.env['SESSION_SECRET']?.trim() || undefined;
  if (!secret) {
    console.warn(
      'SESSION_SECRET is not set; sessions reset on restart.',
    );
  }
  const publicUrl = env('PUBLIC_URL', 'http://localhost:4200');
  const extraHosts = (process.env['ALLOWED_HOSTS'] ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  return {
    allowedHosts: [
      new URL(publicUrl).hostname,
      'localhost',
      ...extraHosts,
    ],
    dataDir: env('DATA_DIR', 'data'),
    oidc: {
      clientId: env('OIDC_CLIENT_ID', 'acquire'),
      clientSecret: env(
        'OIDC_CLIENT_SECRET',
        'acquire-dev-secret',
      ),
      issuer: env('OIDC_ISSUER', 'http://localhost:5556/dex'),
    },
    publicUrl,
    secret: secret ?? randomBytes(32).toString('hex'),
  };
}

function env(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}
