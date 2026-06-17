/**
 * Broadcast and message-verification tools.
 *
 * This MCP server has NO signing capability and never holds or contacts a
 * private key / signer. It only broadcasts transactions that were signed
 * out-of-band (wherever the user manages their keys) and verifies message
 * signatures (a read-only operation).
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
}
