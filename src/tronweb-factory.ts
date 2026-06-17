import { TronWeb } from 'tronweb';
import { config, NETWORKS } from './config.js';

/** Create a read-only TronWeb instance for the given network/host (no private key). */
export function createTronWeb(network?: string): TronWeb {
  const fullHost = network
    ? (NETWORKS[network] ?? network)
    : config.fullHost;

  const headers: Record<string, string> = {};
  if (config.apiKey) headers['TRON-PRO-API-KEY'] = config.apiKey;

  return new TronWeb({ fullHost, headers });
}

// Cached read-only instance for the default network
let _readonly: TronWeb | null = null;

/** Return a shared read-only TronWeb instance (no private key). */
export function getReadonly(network?: string): TronWeb {
  if (!network || network === config.defaultNetwork) {
    _readonly ??= createTronWeb(config.defaultNetwork);
    return _readonly;
  }
  return createTronWeb(network);
}

/** 1 TRX = 1,000,000 SUN */
export const SUN_PER_TRX = 1_000_000;

/** Convert TRX (floating-point) to integer SUN. */
export const toSun = (trx: number): number => Math.round(trx * SUN_PER_TRX);

/** Standard MCP error response. */
export function errorResult(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    content: [{ type: 'text' as const, text: `Error: ${msg}` }],
    isError: true as const,
  };
}

/** Standard MCP success response. */
export function okResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}
