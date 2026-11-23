import { loadConfig } from './config';

describe('loadConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('treats blank variables as unset', () => {
    vi.stubEnv('SESSION_SECRET', '');
    vi.stubEnv('OIDC_ISSUER', ' ');
    vi.spyOn(console, 'warn').mockImplementation(
      () => undefined,
    );
    const config = loadConfig();
    expect(config.secret).toMatch(/^[0-9a-f]{64}$/);
    expect(config.oidc.issuer).toBe('http://localhost:5556/dex');
  });
});
