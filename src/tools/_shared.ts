/**
 * Shared Zod schemas and helpers for the read-only ("query") tools.
 *
 * `precise` selects between the two chain-reading facades TronWeb exposes:
 *   - `tronWeb.trx`     — regular reads; int64 fields arrive as JS numbers
 *   - `tronWeb.trx.raw` — GET reads with `int64_as_string=true` (java-tron #6699);
 *                         int64 fields arrive as decimal strings, so values above
 *                         2^53 - 1 survive without precision loss
 *
 * Both facades are backed by the same `AbstractTrx` logic (tronweb
 * `src/lib/trx/AbstractTrx.ts`); only the HTTP routing differs.
 */
import { z } from 'zod';
import type { TronWeb } from 'tronweb';
import { getReadonly } from '../tronweb-factory.js';

export const network = z
  .enum(['mainnet', 'shasta', 'nile'])
  .optional()
  .describe("Network: 'mainnet' (default), 'shasta', or 'nile'");

export const address = z
  .string()
  .describe("TRON address in base58 format (starts with 'T', 34 characters)");

export const precise = z
  .boolean()
  .optional()
  .describe(
    'Read through tronWeb.trx.raw (int64_as_string=true) so int64/uint64 fields are ' +
      'returned as decimal STRINGS instead of JS numbers — use it whenever a value may ' +
      'exceed 2^53-1 (balances, frozen amounts, timestamps) and precision matters. ' +
      'Requires a node running java-tron #6699 or later; older nodes silently ignore ' +
      'the flag. Values read this way must not be fed back into transaction-consuming ' +
      'endpoints. Default: false (numbers).',
  );

export const confirmed = z
  .boolean()
  .optional()
  .describe(
    'Query the solidity (confirmed) node instead of the full node. Default: true ' +
      '(confirmed). Set false to read unconfirmed/latest state from the full node.',
  );

/** The regular (`number`) chain-reading facade. */
export type RegularTrx = TronWeb['trx'];
/** The raw (`int64_as_string`) chain-reading facade. */
export type RawTrx = TronWeb['trx']['raw'];

/** The only network names a tool may pass on — see the `network` schema above. */
export type Network = z.infer<typeof network>;

/**
 * Pick the chain-reading facade for a tool call.
 *
 * Returned as `RawTrx` because the two classes share every method signature and
 * differ only in the declared *return* type (number vs string); tool handlers hand
 * the result straight to `okResult`, so the widened-to-string typing is the honest
 * one and keeps the union out of every call site.
 *
 * `net` is typed as the `network` enum rather than `string` on purpose: `createTronWeb`
 * falls back to treating an unrecognised value as a node URL (`NETWORKS[net] ?? net`),
 * so a tool that ever accepted a free-form network string would turn into a
 * host-controlling SSRF that also leaks TRON_API_KEY via the TRON-PRO-API-KEY header.
 * Keeping this parameter narrow makes such a tool fail to compile.
 */
export function trxRead(net?: Network, usePrecise?: boolean): RawTrx {
  const tw = getReadonly(net);
  return usePrecise ? tw.trx.raw : (tw.trx as unknown as RawTrx);
}

/**
 * Convert a SUN amount to TRX without losing precision.
 *
 * In `precise` mode the node returns int64 fields as decimal strings that may exceed
 * Number.MAX_SAFE_INTEGER, so the string path divides with BigInt and formats the
 * 6-digit fraction by hand (trailing zeros trimmed, no trailing '.0', never '-0').
 * The number path keeps the plain `sun / 1_000_000` float division the non-precise
 * tools have always used, so their output is unchanged.
 */
export function sunToTrx(sun: string | number): string | number {
  if (typeof sun !== 'string') return sun / 1_000_000;
  const negative = sun.trimStart().startsWith('-');
  const value = BigInt(negative ? sun.replace('-', '') : sun);
  const whole = (value / 1_000_000n).toString();
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  const sign = negative && value !== 0n ? '-' : '';
  return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}
