/**
 * TransactionBuilder tools — build unsigned TRON transactions.
 *
 * All tools in this file build a raw (unsigned) transaction object that must
 * be signed out-of-band (wherever the user manages their keys) and then
 * broadcast with `broadcast_transaction`. This server never signs.
 *
 * Amounts are always expressed in SUN (1 TRX = 1,000,000 SUN).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getReadonly, errorResult, okResult } from '../tronweb-factory.js';

// ─── Shared Schemas ─────────────────────────────────────────────────────────

const network = z
  .enum(['mainnet', 'shasta', 'nile'])
  .optional()
  .describe("Network: 'mainnet' (default), 'shasta', or 'nile'");

const addr = (desc: string) =>
  z.string().describe(`${desc} (base58 TRON address, starts with 'T')`);

const sunAmt = (desc: string) =>
  z.number().int().positive().describe(`${desc} in SUN (1 TRX = 1,000,000 SUN)`);

const resource = z
  .enum(['BANDWIDTH', 'ENERGY'])
  .describe("Resource type: 'BANDWIDTH' or 'ENERGY'");

export function registerTransactionBuilderTools(server: McpServer): void {
  const tb = (network?: string) => getReadonly(network).transactionBuilder;

  // ── Transaction utilities ─────────────────────────────────────────────────

  server.tool(
    'extend_transaction_expiration',
    "Extend the expiration window of an UNSIGNED transaction. TRON transactions expire ~60 seconds after they are built, so an offline sign-then-broadcast flow often misses the window. Call this on the raw unsigned transaction (the object returned by any build_* tool, before it is signed), then sign out-of-band and broadcast with broadcast_transaction. Returns the updated transaction with a refreshed txID. A transaction can ONLY be extended before it is signed.",
    {
      transaction: z
        .record(z.unknown())
        .describe(
          'The unsigned transaction object returned by a build_* tool. Must NOT contain a signature yet (signed transactions cannot be extended).',
        ),
      extension_seconds: z
        .number()
        .int()
        .positive()
        .describe(
          'Seconds added to the transaction\'s current expiration timestamp (e.g. 600 = +10 minutes, 3600 = +1 hour). The new expiration must land at least a few seconds in the future or the call is rejected.',
        ),
      network,
    },
    async (p) => {
      try {
        const extended = await tb(p.network).extendExpiration(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          p.transaction as any,
          p.extension_seconds,
        );
        return okResult(extended);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── TRX / TRC10 Transfer ─────────────────────────────────────────────────

  server.tool(
    'build_trx_transfer',
    'Build an unsigned TRX transfer transaction. Returns a raw transaction object. Sign it out-of-band (this server does not sign), then broadcast with broadcast_transaction.',
    {
      to: addr('Recipient address'),
      amount_sun: sunAmt('Transfer amount'),
      from: addr('Sender address'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).sendTrx(p.to, p.amount_sun, p.from);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_trc10_transfer',
    'Build an unsigned TRC10 token transfer transaction.',
    {
      to: addr('Recipient address'),
      amount: z.number().int().positive().describe('Token amount (in smallest unit)'),
      token_id: z.string().describe("TRC10 token ID (numeric string, e.g. '1000036')"),
      from: addr('Sender address'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).sendToken(p.to, p.amount, p.token_id, p.from);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_purchase_trc10_token',
    'Build a transaction to purchase TRC10 tokens from an ICO.',
    {
      issuer_address: addr('Token issuer address'),
      token_id: z.string().describe('TRC10 token ID'),
      amount_sun: sunAmt('TRX amount to spend'),
      buyer: addr('Buyer address'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).purchaseToken(
          p.issuer_address,
          p.token_id,
          p.amount_sun,
          p.buyer,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── Staking (Stake 2.0) ───────────────────────────────────────────────────

  server.tool(
    'build_freeze_balance_v2',
    "Build a Stake 2.0 transaction to stake TRX and obtain BANDWIDTH or ENERGY resources. Stake 2.0 supports partial unstaking and resource delegation. Use 'build_unfreeze_balance_v2' to unstake.",
    {
      amount_sun: sunAmt('TRX amount to stake'),
      resource,
      owner_address: addr('Staker address'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).freezeBalanceV2(
          p.amount_sun,
          p.resource,
          p.owner_address,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_unfreeze_balance_v2',
    "Build a Stake 2.0 transaction to initiate unstaking of TRX. After a ~14-day lockup, use 'build_withdraw_expire_unfreeze' to withdraw the TRX to your balance.",
    {
      amount_sun: sunAmt('TRX amount to unstake'),
      resource,
      owner_address: addr('Owner address'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).unfreezeBalanceV2(
          p.amount_sun,
          p.resource,
          p.owner_address,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_withdraw_expire_unfreeze',
    'Build a transaction to withdraw TRX that has already passed the ~14-day unstaking lockup period (Stake 2.0).',
    {
      owner_address: addr('Owner address'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).withdrawExpireUnfreeze(p.owner_address);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_delegate_resource',
    'Build a transaction to delegate staked BANDWIDTH or ENERGY to another address (Stake 2.0).',
    {
      amount_sun: sunAmt('Delegated resource amount'),
      receiver_address: addr('Address receiving the delegated resource'),
      resource,
      owner_address: addr('Delegator address (must have staked TRX)'),
      lock: z
        .boolean()
        .optional()
        .describe('Lock the delegation so it cannot be undone for lock_period seconds'),
      lock_period_seconds: z
        .number()
        .int()
        .optional()
        .describe('Lock duration in seconds (required when lock is true)'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).delegateResource(
          p.amount_sun,
          p.receiver_address,
          p.resource,
          p.owner_address,
          p.lock ?? false,
          p.lock_period_seconds,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_undelegate_resource',
    'Build a transaction to reclaim delegated BANDWIDTH or ENERGY from another address (Stake 2.0).',
    {
      amount_sun: sunAmt('Amount of resource to reclaim'),
      receiver_address: addr('Address that currently holds the delegation'),
      resource,
      owner_address: addr('Original delegator address'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).undelegateResource(
          p.amount_sun,
          p.receiver_address,
          p.resource,
          p.owner_address,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── Voting & SR ───────────────────────────────────────────────────────────

  server.tool(
    'build_vote_witness',
    'Build a transaction to cast votes for TRON Super Representatives. Votes require staked TRX (tron power). Each frozen TRX = 1 vote.',
    {
      votes: z
        .record(z.string(), z.number().int())
        .describe(
          'Map of SR address → vote count, e.g. {"TSuperRepAddress...": 100}',
        ),
      voter_address: addr('Voter address'),
      network,
    },
    async (p) => {
      try {
        // VoteInfo = {[srAddress: string]: number} — compatible with Record<string,number>
        const tx = await tb(p.network).vote(p.votes, p.voter_address);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_withdraw_block_rewards',
    'Build a transaction to claim pending block / voting rewards for a witness or voter.',
    {
      owner_address: addr('Address to withdraw rewards to'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).withdrawBlockRewards(p.owner_address);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_apply_for_sr',
    'Build a transaction to apply to become a TRON Super Representative candidate. Costs 9,999 TRX registration fee.',
    {
      owner_address: addr('Applicant address'),
      url: z.string().url().describe("Candidate's website URL"),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).applyForSR(p.owner_address, p.url);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_update_brokerage',
    "Build a transaction for a Super Representative to update their brokerage ratio (0–100). The brokerage determines the percentage of block rewards kept by the SR vs distributed to voters.",
    {
      brokerage: z.number().int().min(0).max(100).describe('Brokerage percentage (0 = all rewards to voters, 100 = SR keeps all)'),
      owner_address: addr('SR witness address'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).updateBrokerage(p.brokerage, p.owner_address);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── Account Management ────────────────────────────────────────────────────

  server.tool(
    'build_create_account',
    'Build a transaction to create/activate a new TRON account on-chain. The new account must not already exist.',
    {
      new_account_address: addr('Address of the new account to create'),
      owner_address: addr('Creator address (pays activation fee)'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).createAccount(
          p.new_account_address,
          p.owner_address,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_update_account_name',
    'Build a transaction to set or update the human-readable name of a TRON account.',
    {
      account_name: z
        .string()
        .max(200)
        .describe('New account name (UTF-8, max 200 bytes)'),
      owner_address: addr('Account address'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).updateAccount(p.account_name, p.owner_address);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_set_account_id',
    'Build a transaction to set a unique account ID (hex string) for a TRON account. Can only be set once.',
    {
      account_id: z.string().describe('Account ID as a hex string'),
      owner_address: addr('Account address'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).setAccountId(p.account_id, p.owner_address);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_update_account_permissions',
    'Build a transaction to update multi-signature permissions on a TRON account (owner, witness, and active permission sets).',
    {
      owner_address: addr('Account address whose permissions to update'),
      owner_permission: z
        .record(z.unknown())
        .describe(
          'Owner permission object with keys: permission_name, threshold, keys (array of {address, weight})',
        ),
      witness_permission: z
        .record(z.unknown())
        .nullable()
        .optional()
        .describe('Witness permission object (null if not a SR)'),
      active_permissions: z
        .array(z.record(z.unknown()))
        .describe(
          'Array of active permission objects (max 8) — each has permission_name, threshold, operations, keys',
        ),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).updateAccountPermissions(
          p.owner_address,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          p.owner_permission as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p.witness_permission ?? null) as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          p.active_permissions as any,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── TRC10 Token ───────────────────────────────────────────────────────────

  server.tool(
    'build_create_trc10_token',
    'Build a transaction to issue a new TRC10 token. Costs 1,024 TRX.',
    {
      options: z
        .record(z.unknown())
        .describe(
          'Token options object: { name, abbreviation, description, url, totalSupply, trxNum, num, startTime, endTime, decNum (decimals), voteScore, precision }',
        ),
      issuer_address: addr('Issuer address'),
      network,
    },
    async (p) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await tb(p.network).createToken(p.options as any, p.issuer_address);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_update_trc10_token',
    'Build a transaction to update the URL, description, or free bandwidth settings of an existing TRC10 token.',
    {
      options: z
        .record(z.unknown())
        .describe('Update options: { url, description, newLimit, newPublicLimit }'),
      issuer_address: addr('Token issuer / owner address'),
      network,
    },
    async (p) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await tb(p.network).updateToken(p.options as any, p.issuer_address);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── Governance Proposals ──────────────────────────────────────────────────

  server.tool(
    'build_create_proposal',
    'Build a transaction to create a TRON governance proposal. Only Super Representatives can create proposals.',
    {
      parameters: z
        .array(z.object({ key: z.number().int(), value: z.number().int() }))
        .describe(
          'Array of chain-parameter changes e.g. [{"key": 3, "value": 1000}]. Key IDs defined in TRON docs.',
        ),
      issuer_address: addr('Proposer address (must be SR)'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).createProposal(p.parameters, p.issuer_address);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_vote_proposal',
    'Build a transaction to vote for or against a TRON governance proposal.',
    {
      proposal_id: z.number().int().describe('Numeric proposal ID'),
      approve: z.boolean().describe('true to approve, false to disapprove'),
      voter_address: addr('Voter address (must be SR)'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).voteProposal(
          p.proposal_id,
          p.approve,
          p.voter_address,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_delete_proposal',
    'Build a transaction to delete a governance proposal (only the creator can delete it before voting period ends).',
    {
      proposal_id: z.number().int().describe('Numeric proposal ID'),
      issuer_address: addr('Proposal creator address'),
      network,
    },
    async (p) => {
      try {
        const tx = await tb(p.network).deleteProposal(p.proposal_id, p.issuer_address);
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
