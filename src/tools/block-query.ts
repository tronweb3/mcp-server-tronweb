/**
 * Block and transaction read APIs (AbstractTrx "Blocks" + "Transactions" sections).
 *
 * Everything here is read-only. Tools that hit a flag-honoring GET endpoint accept
 * `precise` (int64 fields come back as decimal strings); the ones documented in
 * AbstractTrx.ts as "Not flag-adapted" — the ref-block params used for local TAPOS
 * building and the two POST endpoints that consume a transaction object — are pinned
 * to the regular number facade and deliberately expose no `precise` parameter.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { errorResult, okResult } from '../tronweb-factory.js';
import { network, precise, trxRead } from './_shared.js';

/** Block number or block hash; `undefined` means "the chain's latest block". */
const blockId = z
  .union([z.string(), z.number().int().nonnegative()])
  .optional()
  .describe(
    'Block number (integer) or block hash / blockID (64-char hex string). ' +
      'Omit to use the latest block on the chain.',
  );

export function registerBlockQueryTools(server: McpServer): void {
  // ─── Blocks ────────────────────────────────────────────────────────────────

  server.tool(
    'get_confirmed_current_block',
    'Get the latest CONFIRMED block from the solidity node (walletsolidity) — its height lags the full node by roughly 20 blocks, so use it when you need irreversible state rather than the chain tip.',
    { network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getConfirmedCurrentBlock());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_block_by_number',
    'Get a block by its height from the full node (unconfirmed/latest state included), returning the block header and its full transaction list; throws "Block not found" if no block exists at that height.',
    {
      block_number: z
        .number()
        .int()
        .nonnegative()
        .describe('Block height (non-negative integer); 0 is the genesis block'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getBlockByNumber(p.block_number));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_block_by_hash',
    'Get a block by its block hash (blockID) from the full node (unconfirmed/latest state included), returning the block header and its full transaction list; throws "Block not found" for an unknown hash.',
    {
      block_hash: z.string().describe('Block hash / blockID, 64-char hex string (no 0x prefix)'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getBlockByHash(p.block_hash));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_block_range',
    'Get an array of consecutive blocks from the full node (unconfirmed/latest state included) for the INCLUSIVE height range start_block..end_block; tronweb rejects a span wider than 100 blocks ("Invalid range size"), so page through long ranges in chunks of at most 100.',
    {
      start_block: z
        .number()
        .int()
        .nonnegative()
        .describe('First block height of the range (inclusive)'),
      end_block: z
        .number()
        .int()
        .nonnegative()
        .describe('Last block height of the range (inclusive); must be >= start_block and at most start_block + 99'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getBlockRange(p.start_block, p.end_block));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_block_transaction_count',
    'Count the transactions in one block on the full node (unconfirmed/latest state included), identified by block number or block hash; omit block_id to count the latest block. Returns { block_id, transaction_count } rather than a bare number.',
    { block_id: blockId, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        // getBlockTransactionCount(block) defaults to tronWeb.defaultBlock; pass
        // 'latest' explicitly so an omitted block_id resolves to the current block.
        const count = await trx.getBlockTransactionCount(p.block_id ?? 'latest');
        return okResult({ block_id: p.block_id ?? 'latest', transaction_count: count });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_transactions_from_block',
    'Get the full array of transactions contained in one block on the full node (unconfirmed/latest state included), identified by block number or block hash; omit block_id for the latest block. Throws "Transaction not found in block" when the block is empty.',
    { block_id: blockId, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        // 'latest' stands in for the default block when block_id is omitted.
        return okResult(await trx.getTransactionsFromBlock(p.block_id ?? 'latest'));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_transaction_from_block',
    'Get a single transaction by its zero-based position inside one block on the full node (unconfirmed/latest state included), identified by block number or block hash; omit block_id for the latest block. Throws "Invalid transaction index provided" when index is out of range.',
    {
      block_id: blockId,
      index: z
        .number()
        .int()
        .nonnegative()
        .describe('Zero-based index of the transaction within the block'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        // 'latest' stands in for the default block when block_id is omitted.
        return okResult(await trx.getTransactionFromBlock(p.block_id ?? 'latest', p.index));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Transactions ──────────────────────────────────────────────────────────

  server.tool(
    'get_confirmed_transaction',
    'Get the raw transaction for a txID from the solidity node, so it only resolves once the transaction is in a CONFIRMED (irreversible) block; throws "Transaction not found" for a txID that is still unconfirmed, use get_transaction for the full-node view.',
    {
      txid: z.string().describe('Transaction ID (txID), 64-char hex string'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getConfirmedTransaction(p.txid));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_unconfirmed_transaction_info',
    'Get the execution receipt for a txID (fee, energy/bandwidth used, contract logs, internal transactions, contractResult) from the FULL node, so it sees unconfirmed blocks — this is the fast-path variant of get_transaction_info, which reads the solidity node; an unknown or not-yet-executed txID returns an empty object instead of throwing.',
    {
      txid: z.string().describe('Transaction ID (txID), 64-char hex string'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getUnconfirmedTransactionInfo(p.txid));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Transaction-adjacent reads (pinned to the number path) ────────────────

  server.tool(
    'get_current_ref_block_params',
    'Get the TAPOS reference parameters derived from the full node\'s current block — ref_block_bytes, ref_block_hash, expiration (now + 60s) and timestamp — for building a transaction offline; always read as numbers (never string-encoded) because the values are used in local hex arithmetic.',
    { network },
    async (p) => {
      try {
        const trx = trxRead(p.network);
        return okResult(await trx.getCurrentRefBlockParams());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_approved_list',
    'Get the list of addresses that have already signed a given (partially signed) multi-signature transaction, by POSTing the transaction object to the full node; returns { approved_list: [...] } and throws "Invalid transaction provided" if transaction is not an object.',
    {
      transaction: z
        .record(z.unknown())
        .describe('A (partially) signed transaction object, as returned by a transaction builder plus its signature array'),
      network,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network);
        // z.record(z.unknown()) widens to an index signature; tronweb wants its own
        // structural `Transaction` type, so re-assert it at this single call site.
        const tx = p.transaction as unknown as Parameters<typeof trx.getApprovedList>[0];
        return okResult(await trx.getApprovedList(tx));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_sign_weight',
    'Get the accumulated signature weight of a (partially) signed multi-signature transaction versus the threshold of the permission it uses, by POSTing the transaction object to the full node; returns the permission, approved_list and current_weight so you can tell whether more signatures are still required. permission_id defaults to 0 (owner permission) when the transaction does not already carry one.',
    {
      transaction: z
        .record(z.unknown())
        .describe('A (partially) signed transaction object with raw_data.contract present'),
      permission_id: z
        .number()
        .int()
        .optional()
        .describe('Permission id to evaluate against: 0 = owner, 1 = witness, 2+ = active permissions. Defaults to 0.'),
      network,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network);
        // Same reason as get_approved_list: the zod record type is structurally
        // looser than tronweb's `Transaction`, so cast only at the call boundary.
        const tx = p.transaction as unknown as Parameters<typeof trx.getSignWeight>[0];
        return okResult(await trx.getSignWeight(tx, p.permission_id));
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
