/**
 * TRC10 asset-issue read APIs (AbstractTrx "TRC10 tokens" section).
 *
 * Every endpoint here is served by the FULL node (unconfirmed/latest state) and
 * every response is run through tronweb's `_parseToken`, so `name`, `abbr`,
 * `description` and `url` arrive as UTF-8 strings rather than hex. All five
 * methods are flag-adapted, so each tool accepts `precise`.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { network, address, precise, trxRead } from './_shared.js';
import { okResult, errorResult } from '../tronweb-factory.js';

export function registerTokenQueryTools(server: McpServer): void {
  // ─── Lookup by id ──────────────────────────────────────────────────────────

  server.tool(
    'get_token_by_id',
    'Get a single TRC10 token by its numeric token id (wallet/getassetissuebyid on the full node, ' +
      'unconfirmed/latest state). Returns the parsed asset-issue record — name, abbr, description and ' +
      'url decoded from hex to UTF-8, plus supply, precision, owner address and sale/frozen parameters. ' +
      'Token ids are unique, so this returns exactly one token; it errors with "Token does not exist" ' +
      'if the id is unknown. Use get_token_from_id / get_token_list_by_name to look a token up by NAME.',
    {
      token_id: z
        .union([z.string(), z.number().int()])
        .describe("TRC10 token id, e.g. '1000001'"),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getTokenByID(p.token_id));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Lookup by name ────────────────────────────────────────────────────────

  server.tool(
    'get_token_from_id',
    'Look up a single TRC10 token by NAME, despite the legacy "FromID" name of this tool: it hits ' +
      'wallet/getassetissuebyname on the full node (unconfirmed/latest state) with the argument UTF-8 ' +
      'encoded. It resolves a token whose name is UNIQUE; on chains with AllowSameTokenName (mainnet, ' +
      'nile, shasta) the node also resolves a numeric token id passed here. A name SHARED by several ' +
      'tokens fails with "Token does not exist" (the node raises NonUniqueObjectException) — use ' +
      'get_token_list_by_name to get every token with that name, or get_token_by_id when you have the id. ' +
      'Returns one parsed token (name/abbr/description/url decoded to UTF-8).',
    {
      token_name: z
        .union([z.string(), z.number().int()])
        .describe('TRC10 token NAME (not the numeric id)'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getTokenFromID(p.token_name));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  server.tool(
    'get_token_list_by_name',
    'Get EVERY TRC10 token sharing a given token NAME (wallet/getassetissuelistbyname on the full node, ' +
      'unconfirmed/latest state). TRC10 names are not unique — many tokens can be issued under the same ' +
      'name — so this returns an array of parsed tokens (single token object on nodes that answer with one ' +
      'record); disambiguate the results by their numeric id or owner address, then fetch with ' +
      'get_token_by_id. Queries by NAME, not by id, and errors with "Token does not exist" when nothing matches.',
    {
      token_name: z
        .union([z.string(), z.number().int()])
        .describe('TRC10 token NAME'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getTokenListByName(p.token_name));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Listing ───────────────────────────────────────────────────────────────

  server.tool(
    'list_tokens',
    'List TRC10 tokens issued on the chain, as parsed asset-issue records (name/abbr/description/url ' +
      'decoded to UTF-8), read from the full node (unconfirmed/latest state). With a non-zero limit it uses ' +
      'the paginated endpoint wallet/getpaginatedassetissuelist (limit + offset); with limit omitted or 0 it ' +
      'uses wallet/getassetissuelist and returns ALL TRC10 tokens on the network — thousands of records and a ' +
      'very large response, so always pass a limit unless a full dump is genuinely required. offset requires ' +
      'limit >= 1.',
    {
      limit: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
          'Maximum number of tokens to return. Omit or 0 to list ALL TRC10 tokens (very large response).',
        ),
      offset: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe('Index of the first token to return; requires a limit of 1 or more. Default: 0.'),
      network,
      precise,
    },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.listTokens(p.limit, p.offset));
      } catch (e) {
        return errorResult(e);
      }
    },
  );

  // ─── Lookup by issuer ──────────────────────────────────────────────────────

  server.tool(
    'get_tokens_issued_by_address',
    'Get the TRC10 tokens ISSUED by a TRON address (wallet/getassetissuebyaccount on the full node, ' +
      'unconfirmed/latest state) — this is the issuer/creator of the asset, not the holder: it does NOT ' +
      'list tokens the address merely holds (use get_account for balances). Returns an object keyed by ' +
      'token name whose values are parsed tokens (name/abbr/description/url decoded to UTF-8), or {} if ' +
      'the address has never issued a TRC10 token.',
    { address, network, precise },
    async (p) => {
      try {
        const trx = trxRead(p.network, p.precise);
        return okResult(await trx.getTokensIssuedByAddress(p.address));
      } catch (e) {
        return errorResult(e);
      }
    },
  );
}
