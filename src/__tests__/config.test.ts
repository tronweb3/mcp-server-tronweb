/**
 * Tests for config.ts.
 *
 * config.ts reads process.env at import time, so each test that needs a
 * different env must use vi.resetModules() + dynamic import.
 *
 * dotenv/config is mocked as a no-op so the local .env file is never loaded
 * during tests — all env vars are controlled via vi.stubEnv().
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// Prevent dotenv from loading the .env file during tests.
// Vitest hoists vi.mock() calls above imports automatically.
vi.mock('dotenv/config', () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('config', () => {
  it('defaults defaultNetwork to mainnet when TRON_NETWORK is absent', async () => {
    // intentionally NOT stubbing TRON_NETWORK so it stays undefined
    const { config } = await import('../config.js');
    expect(config.defaultNetwork).toBe('mainnet');
  });

  it('reads defaultNetwork from TRON_NETWORK env', async () => {
    vi.stubEnv('TRON_NETWORK', 'shasta');
    const { config } = await import('../config.js');
    expect(config.defaultNetwork).toBe('shasta');
  });

  it('defaults fullHost to the mainnet TronGrid URL', async () => {
    const { config } = await import('../config.js');
    expect(config.fullHost).toBe('https://api.trongrid.io');
  });
});
