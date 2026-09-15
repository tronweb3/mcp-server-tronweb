/**
 * Node, witness, contract-metadata, proposal and exchange read APIs.
 *
 * Covers the "Nodes / witnesses", "Contracts", "Governance / chain parameters"
 * and "Exchanges" sections of tronweb's `src/lib/trx/AbstractTrx.ts`.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { network, precise, confirmed, trxRead } from './_shared.js';
import { okResult, errorResult } from '../tronweb-factory.js';

export function registerNetworkQueryTools(server: McpServer): void {
  // ─── Nodes / witnesses ─────────────────────────────────────────────────────

  server.tool(
    'list_nodes',
    "List the peer nodes known to the connected TRON full node, returned as 'host:port' strings (full node, wallet/listnodes). The list reflects that one node's peer table, so it differs between providers and carries no int64 values.",
    { network },
    async (p) => {
      try {
        const trx = trxRead(p.network);
        return okResult(await trx.listNodes());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'list_super_representatives',
    'List every super representative (witness) registered on chain with its address, URL, total vote count, produced/missed blocks and isJobs flag, read from the full node (wallet/listwitnesses, unconfirmed/latest state); this is the complete witness set, not just the active top 27.',
    { network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.listSuperRepresentatives());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_now_witness_list',
    'Get a paginated slice of the CURRENT-round witness list with vote counts (wallet[solidity]/getpaginatednowwitnesslist; solidity/confirmed node by default, set confirmed=false for the full node). Defaults are offset 0, limit 10, visible false, confirmed true. Gotcha: this endpoint requires a recent java-tron build and may be unavailable (HTTP 404 / "Error") on older public nodes — fall back to list_super_representatives if it fails.',
    {
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Index of the first witness to return. Integer >= 0. Default: 0'),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum number of witnesses to return. Integer > 0. Default: 10'),
      visible: z
        .boolean()
        .optional()
        .describe(
          'Return addresses in base58 (visible) format instead of hex. Default: false (hex)',
        ),
      confirmed,
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        // Only forward what the caller actually supplied; tronweb applies its own defaults.
        const options: {
          offset?: number;
          limit?: number;
          visible?: boolean;
          confirmed?: boolean;
        } = {};
        if (p.offset !== undefined) options.offset = p.offset;
        if (p.limit !== undefined) options.limit = p.limit;
        if (p.visible !== undefined) options.visible = p.visible;
        if (p.confirmed !== undefined) options.confirmed = p.confirmed;
        return okResult(await trx.getNowWitnessList(options));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'time_until_next_vote_cycle',
    'Get when the next maintenance (vote) cycle starts — the moment SR votes are tallied and the active witness set rotates. Read from the full node (wallet/getnextmaintenancetime, latest state). ' +
      'Despite the tronweb method name, the node returns an ABSOLUTE timestamp, so this returns next_vote_cycle_unix_seconds (Unix time in seconds) plus seconds_remaining computed against the server clock.',
    { network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        // tronweb's timeUntilNextVoteCycle() only divides wallet/getnextmaintenancetime's
        // millisecond value by 1000 — it never subtracts "now", so this is the absolute
        // epoch second of the next cycle, not a duration. BigInt keeps the precise-mode
        // string exact; the subtraction is safe because both operands are epoch seconds.
        const at = await trx.timeUntilNextVoteCycle();
        const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
        return okResult({
          next_vote_cycle_unix_seconds: at,
          next_vote_cycle_iso: new Date(Number(BigInt(at) * 1000n)).toISOString(),
          seconds_remaining: Number(BigInt(at) - nowSeconds),
        });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Contracts ─────────────────────────────────────────────────────────────

  server.tool(
    'get_contract',
    "Get on-chain metadata for a smart contract from the full node (wallet/getcontract, latest state): ABI, deployed bytecode, owner/origin address, consume_user_resource_percent and origin_energy_limit. Throws 'Contract does not exist' if the address is a plain account rather than a contract.",
    {
      contract_address: z.string().describe('Contract address in base58 (starts with T)'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getContract(p.contract_address));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_contract_info',
    "Like get_contract but richer: returns the contract metadata (ABI, bytecode, owner, resource settings) PLUS the runtime bytecode and the contract's current dynamic energy factor, from the full node (wallet/getcontractinfo, latest state). Throws 'Contract does not exist' for a non-contract address.",
    {
      contract_address: z.string().describe('Contract address in base58 (starts with T)'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getContractInfo(p.contract_address));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Governance / proposals ────────────────────────────────────────────────

  server.tool(
    'get_proposal',
    'Get a single network-parameter modification proposal by its numeric ID from the full node (wallet/getproposalbyid, latest state): proposer, the chain parameters it changes, approval votes, expiration time and state.',
    {
      proposal_id: z
        .number()
        .int()
        .nonnegative()
        .describe('Proposal ID. Integer >= 0'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getProposal(p.proposal_id));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'list_proposals',
    'List all network-parameter modification proposals ever created, with proposer, changed parameters, approval votes, creation/expiration times and state, from the full node (wallet/listproposals, latest state).',
    { network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.listProposals());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Exchanges ─────────────────────────────────────────────────────────────

  server.tool(
    'get_exchange_by_id',
    'Get one Bancor-style on-chain exchange pair (TRC10/TRC10 or TRC10/TRX) by its numeric exchange ID from the full node (wallet/getexchangebyid, latest state): creator, both token IDs and their current reserve balances.',
    {
      exchange_id: z
        .number()
        .int()
        .nonnegative()
        .describe('Exchange pair ID. Integer >= 0'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getExchangeByID(p.exchange_id));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'list_exchanges',
    'List every Bancor-style on-chain exchange pair with creator, token IDs and reserve balances, from the full node (wallet/listexchanges, latest state). Returns the whole set in one response — use list_exchanges_paginated when only a slice is needed.',
    { network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.listExchanges());
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'list_exchanges_paginated',
    'List a slice of the on-chain exchange pairs (wallet/getpaginatedexchangelist on the full node, latest state), each with creator, token IDs and reserve balances. Defaults: limit 10, offset 0.',
    {
      limit: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Maximum number of exchange pairs to return. Integer >= 0. Default: 10'),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Index of the first exchange pair to return. Integer >= 0. Default: 0'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.listExchangesPaginated(p.limit, p.offset));
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
