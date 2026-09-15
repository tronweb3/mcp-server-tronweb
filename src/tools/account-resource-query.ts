/**
 * Account, bandwidth, delegation, stake-2.0 and reward read APIs
 * (AbstractTrx "Accounts / balances" section).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { okResult, errorResult } from '../tronweb-factory.js';
import { network, address, precise, confirmed, sunToTrx, trxRead } from './_shared.js';

export function registerAccountResourceQueryTools(server: McpServer): void {
  // ─── Account ───────────────────────────────────────────────────────────────

  server.tool(
    'get_unconfirmed_account',
    'Get full account information (TRX balance, frozen/staked balances, votes, permissions, TRC10 holdings) from the full node, i.e. the latest possibly-unconfirmed state; use get_account for the confirmed (solidity node) view.',
    { address, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getUnconfirmedAccount(p.address));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_unconfirmed_balance',
    "Get the latest possibly-unconfirmed TRX balance of an address from the full node, returned in both SUN and TRX (1 TRX = 1,000,000 SUN); with precise=true both values are decimal STRINGS so balances above 2^53-1 keep full precision.",
    { address, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        // typed as string by the raw facade; a regular (non-precise) read yields a number
        const sun = (await trx.getUnconfirmedBalance(p.address)) as unknown as string | number;
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
    'get_account_by_id',
    'Get full account information by account id (the human-readable id set via build_set_account_id) instead of by address; queries the solidity node (confirmed) by default, set confirmed=false for the full node (latest/unconfirmed).',
    {
      account_id: z
        .string()
        .describe('Account id set via build_set_account_id; hex or plain string, 8-32 chars'),
      confirmed,
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getAccountInfoById(p.account_id, { confirmed: p.confirmed ?? true }));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Bandwidth ─────────────────────────────────────────────────────────────

  server.tool(
    'get_bandwidth',
    'Get the REMAINING bandwidth of an address (free + staked, i.e. limits minus used) computed from the full-node wallet/getaccountnet response; returns a single number (a decimal string with precise=true), not the full resource breakdown — use get_account_resources for that.',
    { address, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        const value = await trx.getBandwidth(p.address);
        return okResult({ address: p.address, bandwidth_remaining: value });
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Delegation ────────────────────────────────────────────────────────────

  server.tool(
    'get_delegated_resource_v2',
    'Get the Stake 2.0 resources (bandwidth/energy amounts in SUN and their lock expiry times) delegated FROM one address TO another; queries the solidity node (confirmed) by default, set confirmed=false to include unconfirmed delegations from the full node.',
    { from_address: address, to_address: address, confirmed, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(
          await trx.getDelegatedResourceV2(p.from_address, p.to_address, {
            confirmed: p.confirmed ?? true,
          }),
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_delegated_resource_account_index_v2',
    'Get the Stake 2.0 delegation index of an address — the lists of accounts it received resources from (fromAccounts) and delegated resources to (toAccounts), addresses only, no amounts; queries the solidity node (confirmed) by default, set confirmed=false for the full node.',
    { address, confirmed, network },
    async (p) => {
      try {
        const trx = trxRead(p.network);
        return okResult(
          await trx.getDelegatedResourceAccountIndexV2(p.address, { confirmed: p.confirmed ?? true }),
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Stake 2.0 ─────────────────────────────────────────────────────────────

  server.tool(
    'get_available_unfreeze_count',
    'Get the number of unstake (unfreeze) operations still available to an account under Stake 2.0 (each account is capped at 32 pending unstakes); queries the solidity node (confirmed) by default, set confirmed=false for the full node.',
    { address, confirmed, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getAvailableUnfreezeCount(p.address, { confirmed: p.confirmed ?? true }));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_can_delegated_max_size',
    "Get the maximum amount of a resource an address can still delegate to others under Stake 2.0, returned as max_size in SUN (not TRX); resource defaults to 'BANDWIDTH', queries the solidity node (confirmed) by default, set confirmed=false for the full node.",
    {
      address,
      resource: z
        .enum(['BANDWIDTH', 'ENERGY'])
        .optional()
        .describe("Resource type to measure: 'BANDWIDTH' (default) or 'ENERGY'"),
      confirmed,
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(
          await trx.getCanDelegatedMaxSize(p.address, p.resource ?? 'BANDWIDTH', {
            confirmed: p.confirmed ?? true,
          }),
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_can_withdraw_unfreeze_amount',
    'Get the unfrozen (unstaked) balance an address can withdraw at a given time, returned as amount in SUN; timestamp is in MILLISECONDS and defaults to now, queries the solidity node (confirmed) by default, set confirmed=false for the full node.',
    {
      address,
      timestamp: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Unix time in MILLISECONDS; defaults to now'),
      confirmed,
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(
          await trx.getCanWithdrawUnfreezeAmount(p.address, p.timestamp ?? Date.now(), {
            confirmed: p.confirmed ?? true,
          }),
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Rewards / brokerage ───────────────────────────────────────────────────

  server.tool(
    'get_reward',
    'Get the unclaimed voting/SR reward of an address in SUN (claimable via build_withdraw_block_rewards, once every 24h); queries the solidity node (confirmed) by default, set confirmed=false to read the full node (latest/unconfirmed).',
    { address, confirmed, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        // getReward/getUnconfirmedReward MUTATE the options object, so call the two
        // distinct methods instead of forwarding { confirmed }
        return okResult(
          p.confirmed === false
            ? await trx.getUnconfirmedReward(p.address, {})
            : await trx.getReward(p.address, {}),
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_brokerage',
    'Get the brokerage ratio of a super representative in PERCENT (the share of block rewards the SR keeps, default 20); queries the solidity node (confirmed) by default, set confirmed=false to read the full node (latest/unconfirmed).',
    { address, confirmed, network },
    async (p) => {
      try {
        const trx = trxRead(p.network);
        // same mutation caveat as get_reward: use the two distinct methods
        return okResult(
          p.confirmed === false
            ? await trx.getUnconfirmedBrokerage(p.address, {})
            : await trx.getBrokerage(p.address, {}),
        );
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
