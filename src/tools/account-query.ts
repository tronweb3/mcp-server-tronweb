/**
 * Read-only chain queries — the "Accounts / balances", "Blocks", "Transactions"
 * and network-info sections of tronweb's `src/lib/trx/AbstractTrx.ts`.
 *
 * Tools whose endpoint is flag-adapted take an optional `precise` flag and read
 * through `trxRead(network, precise)`; the three endpoints AbstractTrx documents as
 * "Not flag-adapted" (`getNodeInfo`, `getBandwidthPrices`, `getEnergyPrices`) stay on
 * the regular number facade.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { errorResult, okResult } from '../tronweb-factory.js';
import { network, address, precise, sunToTrx, trxRead } from './_shared.js';

export function registerAccountQueryTools(server: McpServer): void {
  // ─── Account ───────────────────────────────────────────────────────────────

  server.tool(
    'get_account',
    'Get full account information for a TRON address, including TRX balance, frozen balances, votes, permissions, and TRC10 token holdings. ' +
      'Served by the solidity (confirmed) node; set precise:true to receive int64 fields (balance, frozen amounts, timestamps) as decimal strings instead of JS numbers.',
    { address, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getAccount(p.address));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_balance',
    'Get the TRX balance of a TRON address, returned in both SUN (integer) and TRX (float). 1 TRX = 1,000,000 SUN. ' +
      'Served by the solidity (confirmed) node; set precise:true for balances above 2^53-1 SUN, which returns balance_sun and balance_trx as exact decimal strings.',
    { address, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        const sun = await trx.getBalance(p.address);
        return okResult({
          address: p.address,
          balance_sun: sun,
          balance_trx: sunToTrx(sun),
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_account_resources',
    'Get bandwidth and energy resources for a TRON address: free/used bandwidth, energy limit/used, delegated resources, and staking info. ' +
      'Served by the full node (latest, unconfirmed state); set precise:true to receive int64 fields as decimal strings instead of JS numbers.',
    { address, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getAccountResources(p.address));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Block ─────────────────────────────────────────────────────────────────

  server.tool(
    'get_current_block',
    'Get the latest block at the chain tip (full node; may still be reverted) — use get_confirmed_current_block for the latest irreversible block. ' +
      'set precise:true to receive int64 fields (timestamps, amounts) as decimal strings instead of JS numbers.',
    { network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getCurrentBlock());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_block',
    'Get a specific block by block number (integer) or block hash (hex string). Omit block_id to get the latest block. ' +
      'Served by the full node (unconfirmed/latest); set precise:true to receive int64 fields (timestamps, amounts) as decimal strings instead of JS numbers.',
    {
      block_id: z
        .union([z.string(), z.number().int()])
        .optional()
        .describe('Block number (integer) or block hash (66-char hex). Omit for latest block.'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        // TronWeb accepts string hash, number, or undefined for latest
        const result =
          p.block_id !== undefined
            ? await trx.getBlock(p.block_id as string | number)
            : await trx.getCurrentBlock();
        return okResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Transaction ───────────────────────────────────────────────────────────

  server.tool(
    'get_transaction',
    'Get a transaction by its transaction ID (txID). Returns the raw transaction data. ' +
      'Served by the full node, so unconfirmed transactions are visible; set precise:true to receive int64 fields (amounts, timestamps) as decimal strings instead of JS numbers.',
    {
      txid: z.string().describe('Transaction ID (64-char hex string)'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getTransaction(p.txid));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_transaction_info',
    'Get transaction execution result/receipt by txID: fee paid, energy used, contract logs, internal transactions, and contract result. ' +
      'Served by the solidity (confirmed) node, so a just-broadcast transaction is not found until it confirms; set precise:true to receive int64 fields (fee, energy, timestamps) as decimal strings instead of JS numbers.',
    {
      txid: z.string().describe('Transaction ID (64-char hex string)'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getTransactionInfo(p.txid));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Network ───────────────────────────────────────────────────────────────

  server.tool(
    'get_chain_parameters',
    'Get TRON network chain parameters: fee rates, energy/bandwidth prices, resource limits, and governance settings. ' +
      'Served by the full node (latest); set precise:true to receive each parameter value as a decimal string instead of a JS number.',
    { network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getChainParameters());
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
        const trx = trxRead(p.network);
        return okResult(await trx.getNodeInfo());
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
        const trx = trxRead(p.network);
        return okResult(await trx.getBandwidthPrices());
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
        const trx = trxRead(p.network);
        return okResult(await trx.getEnergyPrices());
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
