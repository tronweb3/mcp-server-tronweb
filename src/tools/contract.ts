/**
 * Smart Contract tools — build, deploy, read-only call, and estimate energy.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getReadonly, errorResult, okResult } from '../tronweb-factory.js';

const network = z
  .enum(['mainnet', 'shasta', 'nile'])
  .optional()
  .describe("Network: 'mainnet' (default), 'shasta', or 'nile'");

/**
 * Parse ABI parameters from either:
 *   - a JSON array string: '[{"type":"address","value":"T..."}]'
 *   - a plain JS array already parsed by Zod
 */
function parseParams(params?: unknown): Array<{ type: string; value: unknown }> {
  if (!params) return [];
  if (typeof params === 'string') {
    try {
      return JSON.parse(params) as Array<{ type: string; value: unknown }>;
    } catch {
      throw new Error('parameters must be a valid JSON array string');
    }
  }
  if (Array.isArray(params)) return params as Array<{ type: string; value: unknown }>;
  throw new Error('parameters must be an array or JSON array string');
}

const contractParamsSchema = z
  .union([
    z.string().describe(
      'JSON array string of ABI parameter objects, e.g. \'[{"type":"address","value":"T..."},{"type":"uint256","value":"1000000"}]\'',
    ),
    z.array(z.record(z.unknown())).describe(
      'Array of ABI parameter objects: [{type: "address", value: "T..."}, ...]',
    ),
  ])
  .optional()
  .describe('Contract call parameters. Omit or pass [] for no-arg functions.');

const contractOptionsSchema = z
  .record(z.unknown())
  .optional()
  .describe(
    'Call options: { feeLimit (SUN, default 150_000_000), callValue (SUN of TRX sent), tokenId, tokenValue }',
  );

export function registerContractTools(server: McpServer): void {
  // ── Read-only contract call ────────────────────────────────────────────────

  server.tool(
    'trigger_constant_contract',
    "Call a read-only (view/pure) smart contract function without broadcasting a transaction. Returns the function's return values and energy used. No signing required.",
    {
      contract_address: z
        .string()
        .describe('Contract address in base58 format (starts with T)'),
      function_selector: z
        .string()
        .describe(
          "Function signature, e.g. 'balanceOf(address)' or 'transfer(address,uint256)'",
        ),
      parameters: contractParamsSchema,
      options: contractOptionsSchema,
      caller_address: z
        .string()
        .optional()
        .describe('Simulated caller address (base58). Defaults to the contract address itself when omitted (read-only calls do not depend on the caller).'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        const params = parseParams(p.parameters);
        // TRON nodes reject a constant call with no owner_address ("owner_address isn't set"),
        // so default the caller to the contract address — always an activated on-chain account.
        const result = await tw.transactionBuilder.triggerConstantContract(
          p.contract_address,
          p.function_selector,
          p.options ?? {},
          params,
          p.caller_address ?? p.contract_address,
        );
        return okResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── Energy estimation ─────────────────────────────────────────────────────

  server.tool(
    'estimate_energy',
    'Estimate the energy cost of a smart contract function call without executing it. Useful for setting feeLimit before submitting a transaction.',
    {
      contract_address: z.string().describe('Contract address (base58)'),
      function_selector: z
        .string()
        .describe("Function signature, e.g. 'transfer(address,uint256)'"),
      parameters: contractParamsSchema,
      options: contractOptionsSchema,
      caller_address: z
        .string()
        .optional()
        .describe('Caller address (base58). Defaults to the contract address itself when omitted (the estimate does not depend on the caller).'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        const params = parseParams(p.parameters);
        // Same as triggerConstantContract: a missing owner_address is rejected by the node,
        // so default the caller to the contract address (always an activated on-chain account).
        const result = await tw.transactionBuilder.estimateEnergy(
          p.contract_address,
          p.function_selector,
          p.options ?? {},
          params,
          p.caller_address ?? p.contract_address,
        );
        return okResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── Build: trigger (state-change) contract call ───────────────────────────

  server.tool(
    'build_trigger_smart_contract',
    "Build an unsigned transaction that calls a state-changing smart contract method. The returned 'transaction' field must be signed out-of-band (this server does not sign) and then broadcast with broadcast_transaction. For read-only calls, use trigger_constant_contract instead.",
    {
      contract_address: z.string().describe('Contract address (base58)'),
      function_selector: z
        .string()
        .describe("Function signature, e.g. 'transfer(address,uint256)'"),
      parameters: contractParamsSchema,
      options: z
        .object({
          feeLimit: z
            .number()
            .int()
            .optional()
            .describe('Max TRX (in SUN) to pay as energy fee. Default 150,000,000 SUN (150 TRX).'),
          callValue: z
            .number()
            .int()
            .optional()
            .describe('TRX amount (in SUN) to send with the call (payable functions)'),
          tokenId: z
            .string()
            .optional()
            .describe('TRC10 token ID to send with the call'),
          tokenValue: z
            .number()
            .int()
            .optional()
            .describe('TRC10 token amount to send'),
        })
        .optional()
        .describe('Call options (feeLimit, callValue, tokenId, tokenValue)'),
      caller_address: z
        .string()
        .describe("Caller's base58 address (used as 'from' for the transaction)"),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        const params = parseParams(p.parameters);
        const opts = {
          feeLimit: 150_000_000,
          ...p.options,
        };
        const result = await tw.transactionBuilder.triggerSmartContract(
          p.contract_address,
          p.function_selector,
          opts,
          params,
          p.caller_address,
        );
        // Return the full result; consumer signs result.transaction
        return okResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── Build: TRC20 transfer (convenience over build_trigger_smart_contract) ──

  server.tool(
    'build_trc20_transfer',
    "Build an unsigned TRC20 token transfer transaction (calls the token contract's transfer(address,uint256)). The returned 'transaction' field must be signed out-of-band (this server does not sign) and then broadcast with broadcast_transaction. No signing is performed here.",
    {
      token_contract_address: z.string().describe('TRC20 token contract address (base58)'),
      to: z.string().describe("Recipient TRON address (base58, starts with 'T')"),
      amount: z
        .string()
        .describe('Token amount in the smallest unit (integer as string, e.g. "1000000" for 1 USDT)'),
      from: z
        .string()
        .describe("Sender's base58 address (owner/from of the transfer)"),
      fee_limit_sun: z
        .number()
        .int()
        .optional()
        .describe('Max energy fee in SUN (default 150,000,000 = 150 TRX)'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        const opts = { feeLimit: p.fee_limit_sun ?? 150_000_000 };
        const params = [
          { type: 'address', value: p.to },
          { type: 'uint256', value: p.amount },
        ];
        const result = await tw.transactionBuilder.triggerSmartContract(
          p.token_contract_address,
          'transfer(address,uint256)',
          opts,
          params,
          p.from,
        );
        // Return the full result; consumer signs result.transaction out-of-band
        return okResult(result);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── Build: deploy smart contract ──────────────────────────────────────────

  server.tool(
    'build_deploy_smart_contract',
    'Build an unsigned transaction to deploy a new smart contract. Returns a raw transaction to sign out-of-band (this server does not sign) and broadcast with broadcast_transaction.',
    {
      options: z
        .object({
          abi: z.string().describe('Contract ABI as JSON string'),
          bytecode: z
            .string()
            .describe('Compiled contract bytecode (hex, with or without 0x prefix)'),
          feeLimit: z
            .number()
            .int()
            .optional()
            .describe('Max energy fee in SUN (default 1,000,000,000)'),
          callValue: z
            .number()
            .int()
            .optional()
            .describe('TRX in SUN to send to constructor (payable)'),
          userFeePercentage: z
            .number()
            .int()
            .min(0)
            .max(100)
            .optional()
            .describe('Percentage of energy fees paid by users (0–100, default 100)'),
          originEnergyLimit: z
            .number()
            .int()
            .optional()
            .describe('Max energy from origin account per call'),
          parameters: z
            .string()
            .optional()
            .describe('ABI-encoded constructor parameters as hex string'),
          name: z.string().optional().describe('Contract name'),
        })
        .describe('Contract deployment options'),
      issuer_address: z
        .string()
        .describe("Deployer's base58 address"),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        const deployOpts = {
          abi: p.options.abi,
          bytecode: p.options.bytecode,
          ...(p.options.feeLimit !== undefined && { feeLimit: p.options.feeLimit }),
          ...(p.options.callValue !== undefined && { callValue: p.options.callValue }),
          ...(p.options.userFeePercentage !== undefined && { userFeePercentage: p.options.userFeePercentage }),
          ...(p.options.originEnergyLimit !== undefined && { originEnergyLimit: p.options.originEnergyLimit }),
          ...(p.options.parameters !== undefined && { rawParameter: p.options.parameters }),
          ...(p.options.name !== undefined && { name: p.options.name }),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tx = await tw.transactionBuilder.createSmartContract(
          deployOpts as any,
          p.issuer_address,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ── Build: contract management ────────────────────────────────────────────

  server.tool(
    'build_clear_contract_abi',
    'Build a transaction to clear the ABI of a deployed smart contract.',
    {
      contract_address: z.string().describe('Contract address (base58)'),
      owner_address: z.string().describe('Contract owner address (base58)'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        const tx = await tw.transactionBuilder.clearABI(
          p.contract_address,
          p.owner_address,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_update_contract_user_fee_percentage',
    "Build a transaction to update the percentage of energy fees paid by contract users (0 = owner pays all, 100 = user pays all).",
    {
      contract_address: z.string().describe('Contract address (base58)'),
      user_fee_percentage: z
        .number()
        .int()
        .min(0)
        .max(100)
        .describe('User fee percentage (0–100)'),
      issuer_address: z.string().describe('Contract owner address (base58)'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        const tx = await tw.transactionBuilder.updateSetting(
          p.contract_address,
          p.user_fee_percentage,
          p.issuer_address,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'build_update_contract_energy_limit',
    "Build a transaction to update the origin energy limit for a smart contract (max energy the contract owner provides per call).",
    {
      contract_address: z.string().describe('Contract address (base58)'),
      origin_energy_limit: z
        .number()
        .int()
        .describe('New origin energy limit'),
      issuer_address: z.string().describe('Contract owner address (base58)'),
      network,
    },
    async (p) => {
      try {
        const tw = getReadonly(p.network);
        const tx = await tw.transactionBuilder.updateEnergyLimit(
          p.contract_address,
          p.origin_energy_limit,
          p.issuer_address,
        );
        return okResult(tx);
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
