import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getReadonly, errorResult, okResult } from '../tronweb-factory.js';

const network = z
  .enum(['mainnet', 'shasta', 'nile'])
  .optional()
  .describe("Network: 'mainnet' (default), 'shasta', or 'nile'");

const address = z
  .string()
  .describe("TRON address in base58 format (starts with 'T', 34 characters)");

export function registerAccountQueryTools(server: McpServer): void {
  // ─── Account ───────────────────────────────────────────────────────────────

  server.tool(
    'get_account',
    'Get full account information for a TRON address, including TRX balance, frozen balances, votes, permissions, and TRC10 token holdings.',
    { address, network },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        return okResult(await tw.trx.getAccount(p.address));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_balance',
    'Get the TRX balance of a TRON address, returned in both SUN (integer) and TRX (float). 1 TRX = 1,000,000 SUN.',
    { address, network },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        const sun = await tw.trx.getBalance(p.address);
        return okResult({
          address: p.address,
          balance_sun: sun,
          balance_trx: sun / 1_000_000,
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_account_resources',
    'Get bandwidth and energy resources for a TRON address: free/used bandwidth, energy limit/used, delegated resources, and staking info.',
    { address, network },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        return okResult(await tw.trx.getAccountResources(p.address));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Block ─────────────────────────────────────────────────────────────────

  server.tool(
    'get_current_block',
    'Get the latest confirmed block on the TRON network.',
    { network },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        return okResult(await tw.trx.getCurrentBlock());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_block',
    'Get a specific block by block number (integer) or block hash (hex string). Omit block_id to get the latest block.',
    {
      block_id: z
        .union([z.string(), z.number().int()])
        .optional()
        .describe('Block number (integer) or block hash (66-char hex). Omit for latest block.'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        // TronWeb accepts string hash, number, or undefined for latest
        const result =
          p.block_id !== undefined
            ? await tw.trx.getBlock(p.block_id as string | number)
            : await tw.trx.getCurrentBlock();
        return okResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Transaction ───────────────────────────────────────────────────────────

  server.tool(
    'get_transaction',
    'Get a transaction by its transaction ID (txID). Returns the raw transaction data.',
    {
      txid: z.string().describe('Transaction ID (64-char hex string)'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        return okResult(await tw.trx.getTransaction(p.txid));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_transaction_info',
    'Get transaction execution result/receipt by txID: fee paid, energy used, contract logs, internal transactions, and contract result.',
    {
      txid: z.string().describe('Transaction ID (64-char hex string)'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        return okResult(await tw.trx.getTransactionInfo(p.txid));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Network ───────────────────────────────────────────────────────────────

  server.tool(
    'get_chain_parameters',
    'Get TRON network chain parameters: fee rates, energy/bandwidth prices, resource limits, and governance settings.',
    { network },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        return okResult(await tw.trx.getChainParameters());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_node_info',
    'Get information about the connected TRON full node: version, peer count, block height, and machine info.',
    { network },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        return okResult(await tw.trx.getNodeInfo());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_bandwidth_prices',
    'Get historical dynamic energy/bandwidth price information (unit price in SUN).',
    { network },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        return okResult(await tw.trx.getBandwidthPrices());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_energy_prices',
    'Get historical dynamic energy price information (unit price in SUN).',
    { network },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        return okResult(await tw.trx.getEnergyPrices());
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
