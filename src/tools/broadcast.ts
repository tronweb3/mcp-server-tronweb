/**
 * Broadcast and message-verification tools.
 *
 * This MCP server has NO signing capability and never holds or contacts a
 * private key / signer. It only broadcasts transactions that were signed
 * out-of-band (wherever the user manages their keys) and verifies message
 * and typed-data signatures (read-only operations).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getReadonly, errorResult, okResult } from '../tronweb-factory.js';

const network = z
  .enum(['mainnet', 'shasta', 'nile'])
  .optional()
  .describe("Network: 'mainnet' (default), 'shasta', or 'nile'");

export function registerBroadcastTools(server: McpServer): void {
  // ── Broadcast ──────────────────────────────────────────────────────────────

  server.tool(
    'broadcast_transaction',
    "Broadcast a signed transaction to the TRON network. Returns the broadcast result including 'result' (bool) and 'txid'.",
    {
      signed_transaction: z
        .record(z.unknown())
        .describe('Signed transaction object (signed out-of-band by the user)'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await tw.trx.sendRawTransaction(p.signed_transaction as any);
        return okResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── Message verification (read-only, no private key) ───────────────────────

  server.tool(
    'verify_message',
    'Verify a signed message and recover the signer address. Returns the base58 TRON address that signed the message.',
    {
      message: z.string().describe('The original message that was signed'),
      signature: z.string().describe('Hex signature produced by signMessageV2 (signed out-of-band)'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        const addr = await tw.trx.verifyMessageV2(p.message, p.signature);
        return okResult({ message: p.message, signer_address: addr });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'verify_typed_data',
    'Verify an EIP-712 / TIP-712 typed-data signature against an expected signer address. Returns whether the signature was produced by that address. Read-only — no private key required.',
    {
      domain: z
        .record(z.unknown())
        .describe(
          'EIP-712 domain object, e.g. { name, version, chainId, verifyingContract }. Include only the fields that were actually signed.',
        ),
      types: z
        .record(z.unknown())
        .describe(
          'Type definitions: { TypeName: [{ name, type }, ...] }. Do NOT include EIP712Domain (it is derived from the domain fields).',
        ),
      value: z
        .record(z.unknown())
        .describe('The typed message object that was signed'),
      signature: z
        .string()
        .describe('Hex signature produced by _signTypedData (signed out-of-band)'),
      address: z
        .string()
        .describe('Expected signer address (base58) to verify the signature against'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        let valid: boolean;
        try {
          // verifyTypedData returns true on a match and throws 'Signature does not
          // match' otherwise; any other error means the domain/types/value were malformed.
          valid =
            tw.trx.verifyTypedData(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              p.domain as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              p.types as any,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              p.value as any,
              p.signature,
              p.address,
            ) === true;
        } catch (e) {
          if (e instanceof Error && e.message === 'Signature does not match') {
            valid = false;
          } else {
            throw e;
          }
        }
        return okResult({ valid, address: p.address });
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
