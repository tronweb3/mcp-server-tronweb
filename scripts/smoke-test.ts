/**
 * Smoke test for the TronWeb MCP server.
 *
 * Drives the real server over stdio as an MCP client (no test doubles): it
 * launches `src/index.ts` via tsx, lists tools, then calls every tool with a
 * minimal valid fixture and classifies each result.
 *
 * Classification (see tronweb-factory.ts for the response envelope):
 *   PASS          callTool returned and isError is falsy (wiring + schema + node OK)
 *   NODE-ERROR    isError === true (the handler caught a node/validation error and
 *                 returned a well-formed envelope) — EXPECTED for build tools whose
 *                 test account has no on-chain state; NOT counted as a failure
 *   PROTOCOL-FAIL callTool itself threw (schema rejected args / server crash /
 *                 transport error) — a real bug; fails the run
 *   SKIP          intentionally not run (broadcast by default; contract tools when
 *                 no TRC20 address is supplied for a testnet)
 *
 * Exit code is non-zero only on PROTOCOL-FAIL or a tool-list mismatch, so it is a
 * meaningful CI gate that does not flap on chain state.
 *
 * Usage:
 *   tsx scripts/smoke-test.ts [--network nile|shasta|mainnet]
 *                             [--mode read|build|all]
 *                             [--include-broadcast]
 *                             [--contract <TRC20 base58 address>]
 *
 * Note on the dummy private keys below: they exist ONLY so this *client* can
 * derive two valid base58 addresses and locally sign one message to feed
 * verify_message. They are never sent to the server and never sign an on-chain
 * transaction — the server itself remains signing-free by design.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TronWeb } from 'tronweb';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const NETWORKS: Record<string, string> = {
  mainnet: 'https://api.trongrid.io',
  shasta: 'https://api.shasta.trongrid.io',
  nile: 'https://api.nileex.io',
};

// ── CLI args ────────────────────────────────────────────────────────────────
function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--include-broadcast') out.includeBroadcast = true;
    else if (a === '--network') out.network = argv[++i];
    else if (a === '--mode') out.mode = argv[++i];
    else if (a === '--contract') out.contract = argv[++i];
  }
  return out;
}
const cli = parseArgs(process.argv.slice(2));
const NETWORK = String(cli.network ?? process.env.TRON_NETWORK ?? 'nile');
const MODE = String(cli.mode ?? 'all') as 'read' | 'build' | 'all';
const INCLUDE_BROADCAST = cli.includeBroadcast === true;
const CONTRACT = (cli.contract as string) ??
  process.env.TEST_TRC20 ??
  (NETWORK === 'mainnet' ? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' /* USDT */ : undefined);

if (!NETWORKS[NETWORK]) {
  console.error(`Unknown network: ${NETWORK} (expected mainnet|shasta|nile)`);
  process.exit(2);
}

// ── Client-side fixtures (dummy keys → valid addresses + a local signature) ──
const PK_A = '11'.repeat(32);
const PK_B = '22'.repeat(32);
const A = TronWeb.address.fromPrivateKey(PK_A) as string; // FROM / owner / caller
const B = TronWeb.address.fromPrivateKey(PK_B) as string; // TO / receiver
const VERIFY_MESSAGE = 'mcp-server-tronweb smoke test';

async function buildVerifyFixture() {
  const tw = new TronWeb({ fullHost: NETWORKS[NETWORK] });
  tw.setPrivateKey(PK_A);
  const signature: string = await tw.trx.signMessageV2(VERIFY_MESSAGE);
  return { message: VERIFY_MESSAGE, signature, signer: A };
}

// Minimal hex bytecode + empty ABI for the deploy build (node packages it without executing).
const MIN_BYTECODE = '6080604052348015600f57600080fd5b50603f80601d6000396000f3fe6080604052600080fdfea2';

// ── Shared context populated by earlier cases ───────────────────────────────
type Ctx = {
  blockNum?: number;
  txid?: string;
  unsignedTx?: unknown;
  verify?: { message: string; signature: string; signer: string };
};

const SKIP = Symbol('skip');
type Args = Record<string, unknown> | typeof SKIP;

type Case = {
  name: string;
  kind: 'read' | 'build' | 'broadcast';
  needsContract?: boolean;
  args: (ctx: Ctx) => Args;
  after?: (ctx: Ctx, parsed: unknown) => void;
  check?: (parsed: unknown, raw: string) => string | null;
};

const txShape = (_p: unknown, raw: string): string | null =>
  /raw_data|txID|"transaction"/.test(raw) ? null : 'response has no transaction shape';

const CASES: Case[] = [
  // ── account-query.ts (read) ───────────────────────────────────────────────
  { name: 'get_account', kind: 'read', args: () => ({ address: A }) },
  { name: 'get_balance', kind: 'read', args: () => ({ address: A }) },
  { name: 'get_account_resources', kind: 'read', args: () => ({ address: A }) },
  {
    name: 'get_current_block',
    kind: 'read',
    args: () => ({}),
    after: (ctx, p: any) => {
      ctx.blockNum = p?.block_header?.raw_data?.number;
      const tx = p?.transactions?.[0]?.txID;
      if (tx) ctx.txid = tx;
    },
  },
  {
    name: 'get_block',
    kind: 'read',
    args: (ctx) => ({ block_id: Math.max(1, (ctx.blockNum ?? 100) - 20) }),
    after: (ctx, p: any) => {
      const tx = p?.transactions?.[0]?.txID;
      if (tx) ctx.txid = tx;
    },
  },
  {
    name: 'get_transaction',
    kind: 'read',
    args: (ctx) => (ctx.txid ? { txid: ctx.txid } : SKIP),
  },
  {
    name: 'get_transaction_info',
    kind: 'read',
    args: (ctx) => (ctx.txid ? { txid: ctx.txid } : SKIP),
  },
  { name: 'get_chain_parameters', kind: 'read', args: () => ({}) },
  { name: 'get_node_info', kind: 'read', args: () => ({}) },
  { name: 'get_bandwidth_prices', kind: 'read', args: () => ({}) },
  { name: 'get_energy_prices', kind: 'read', args: () => ({}) },

  // ── contract.ts (read) ────────────────────────────────────────────────────
  {
    name: 'trigger_constant_contract',
    kind: 'read',
    needsContract: true,
    args: () => ({
      contract_address: CONTRACT,
      function_selector: 'balanceOf(address)',
      parameters: [{ type: 'address', value: A }],
    }),
  },
  {
    name: 'estimate_energy',
    kind: 'read',
    needsContract: true,
    args: () => ({
      contract_address: CONTRACT,
      function_selector: 'transfer(address,uint256)',
      parameters: [
        { type: 'address', value: B },
        { type: 'uint256', value: '1' },
      ],
      caller_address: A,
    }),
  },

  // ── contract.ts (build) ───────────────────────────────────────────────────
  {
    name: 'build_trigger_smart_contract',
    kind: 'build',
    needsContract: true,
    check: txShape,
    args: () => ({
      contract_address: CONTRACT,
      function_selector: 'transfer(address,uint256)',
      parameters: [
        { type: 'address', value: B },
        { type: 'uint256', value: '1' },
      ],
      caller_address: A,
    }),
  },
  {
    name: 'build_trc20_transfer',
    kind: 'build',
    needsContract: true,
    check: txShape,
    args: () => ({ token_contract_address: CONTRACT, to: B, amount: '1', from: A }),
  },
  {
    name: 'build_deploy_smart_contract',
    kind: 'build',
    check: txShape,
    args: () => ({ options: { abi: '[]', bytecode: MIN_BYTECODE }, issuer_address: A }),
  },
  {
    name: 'build_clear_contract_abi',
    kind: 'build',
    needsContract: true,
    check: txShape,
    args: () => ({ contract_address: CONTRACT, owner_address: A }),
  },
  {
    name: 'build_update_contract_user_fee_percentage',
    kind: 'build',
    needsContract: true,
    check: txShape,
    args: () => ({ contract_address: CONTRACT, user_fee_percentage: 50, issuer_address: A }),
  },
  {
    name: 'build_update_contract_energy_limit',
    kind: 'build',
    needsContract: true,
    check: txShape,
    args: () => ({ contract_address: CONTRACT, origin_energy_limit: 10_000_000, issuer_address: A }),
  },

  // ── transaction-builder.ts (build) ────────────────────────────────────────
  {
    name: 'build_trx_transfer',
    kind: 'build',
    check: txShape,
    args: () => ({ to: B, amount_sun: 1_000_000, from: A }),
    after: (ctx, p) => {
      ctx.unsignedTx = p;
    },
  },
  {
    name: 'extend_transaction_expiration',
    kind: 'build',
    args: (ctx) => (ctx.unsignedTx ? { transaction: ctx.unsignedTx, extension_seconds: 600 } : SKIP),
  },
  {
    name: 'build_trc10_transfer',
    kind: 'build',
    check: txShape,
    args: () => ({ to: B, amount: 1, token_id: '1000001', from: A }),
  },
  {
    name: 'build_purchase_trc10_token',
    kind: 'build',
    check: txShape,
    args: () => ({ issuer_address: B, token_id: '1000001', amount_sun: 1_000_000, buyer: A }),
  },
  {
    name: 'build_freeze_balance_v2',
    kind: 'build',
    check: txShape,
    args: () => ({ amount_sun: 1_000_000, resource: 'ENERGY', owner_address: A }),
  },
  {
    name: 'build_unfreeze_balance_v2',
    kind: 'build',
    check: txShape,
    args: () => ({ amount_sun: 1_000_000, resource: 'ENERGY', owner_address: A }),
  },
  {
    name: 'build_withdraw_expire_unfreeze',
    kind: 'build',
    check: txShape,
    args: () => ({ owner_address: A }),
  },
  {
    name: 'build_delegate_resource',
    kind: 'build',
    check: txShape,
    args: () => ({ amount_sun: 1_000_000, receiver_address: B, resource: 'ENERGY', owner_address: A }),
  },
  {
    name: 'build_undelegate_resource',
    kind: 'build',
    check: txShape,
    args: () => ({ amount_sun: 1_000_000, receiver_address: B, resource: 'ENERGY', owner_address: A }),
  },
  {
    name: 'build_vote_witness',
    kind: 'build',
    check: txShape,
    args: () => ({ votes: { [B]: 1 }, voter_address: A }),
  },
  {
    name: 'build_withdraw_block_rewards',
    kind: 'build',
    check: txShape,
    args: () => ({ owner_address: A }),
  },
  {
    name: 'build_apply_for_sr',
    kind: 'build',
    check: txShape,
    args: () => ({ owner_address: A, url: 'https://example.com' }),
  },
  {
    name: 'build_update_brokerage',
    kind: 'build',
    check: txShape,
    args: () => ({ brokerage: 20, owner_address: A }),
  },
  {
    name: 'build_create_account',
    kind: 'build',
    check: txShape,
    args: () => ({ new_account_address: B, owner_address: A }),
  },
  {
    name: 'build_update_account_name',
    kind: 'build',
    check: txShape,
    args: () => ({ account_name: 'test', owner_address: A }),
  },
  {
    name: 'build_set_account_id',
    kind: 'build',
    check: txShape,
    args: () => ({ account_id: '74657374', owner_address: A }),
  },
  {
    name: 'build_update_account_permissions',
    kind: 'build',
    check: txShape,
    args: () => ({
      owner_address: A,
      owner_permission: { type: 0, permission_name: 'owner', threshold: 1, keys: [{ address: A, weight: 1 }] },
      active_permissions: [
        {
          type: 2,
          permission_name: 'active',
          threshold: 1,
          operations: '7fff1fc0033e0000000000000000000000000000000000000000000000000000',
          keys: [{ address: A, weight: 1 }],
        },
      ],
    }),
  },
  {
    name: 'build_create_trc10_token',
    kind: 'build',
    check: txShape,
    args: () => ({
      options: {
        name: 'TestTok',
        abbreviation: 'TT',
        description: 'smoke test token',
        url: 'https://example.com',
        totalSupply: 1_000_000,
        trxNum: 1,
        num: 1,
        decimals: 0,
        saleStart: Date.now() + 3_600_000,
        saleEnd: Date.now() + 7_200_000,
      },
      issuer_address: A,
    }),
  },
  {
    name: 'build_update_trc10_token',
    kind: 'build',
    check: txShape,
    args: () => ({
      options: { url: 'https://example.com', description: 'updated', newLimit: 0, newPublicLimit: 0 },
      issuer_address: A,
    }),
  },
  {
    name: 'build_create_proposal',
    kind: 'build',
    check: txShape,
    args: () => ({ parameters: [{ key: 0, value: 0 }], issuer_address: A }),
  },
  {
    name: 'build_vote_proposal',
    kind: 'build',
    check: txShape,
    args: () => ({ proposal_id: 1, approve: true, voter_address: A }),
  },
  {
    name: 'build_delete_proposal',
    kind: 'build',
    check: txShape,
    args: () => ({ proposal_id: 1, issuer_address: A }),
  },

  // ── broadcast.ts ──────────────────────────────────────────────────────────
  {
    // verify_message lives in broadcast.ts but is read-only; treat as a read so it
    // runs in read/all modes and asserts the recovered signer.
    name: 'verify_message',
    kind: 'read',
    args: (ctx) =>
      ctx.verify
        ? { message: ctx.verify.message, signature: ctx.verify.signature }
        : SKIP,
    check: (p: any) => {
      const expected = (CTX.verify as any)?.signer;
      return p?.signer_address === expected
        ? null
        : `recovered ${p?.signer_address}, expected ${expected}`;
    },
  },
  {
    name: 'broadcast_transaction',
    kind: 'broadcast',
    check: txShape,
    // A deliberately invalid signed tx — exercises the path; node rejects it (NODE-ERROR).
    args: () => ({ signed_transaction: { raw_data: {}, raw_data_hex: '00', signature: ['00'] } }),
  },
];

// ── Runner ──────────────────────────────────────────────────────────────────
const CTX: Ctx = {};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRateLimit = (s: string) => /rate|429|503|throttl|too many|bandwidth limit/i.test(s);
const firstLine = (s: string) => (s ?? '').split('\n')[0].slice(0, 120);

function inMode(c: Case): boolean {
  if (c.kind === 'broadcast') return INCLUDE_BROADCAST;
  if (MODE === 'all') return c.kind === 'read' || c.kind === 'build';
  return c.kind === MODE;
}

type Status = 'PASS' | 'NODE-ERROR' | 'PROTOCOL-FAIL' | 'SKIP';
const ICON: Record<Status, string> = {
  PASS: '✅',
  'NODE-ERROR': '⚠️ ',
  'PROTOCOL-FAIL': '❌',
  SKIP: '⏭️ ',
};

async function callOnce(client: Client, name: string, args: Record<string, unknown>) {
  return client.callTool({ name, arguments: args }, undefined, { timeout: 30_000 }) as Promise<any>;
}

async function main() {
  console.log(`\nTronWeb MCP smoke test — network=${NETWORK} mode=${MODE} ` +
    `broadcast=${INCLUDE_BROADCAST ? 'on' : 'off'} contract=${CONTRACT ?? '(none)'}\n`);

  CTX.verify = await buildVerifyFixture();

  const transport = new StdioClientTransport({
    command: path.join(ROOT, 'node_modules', '.bin', 'tsx'),
    args: [path.join(ROOT, 'src', 'index.ts')],
    cwd: ROOT,
    env: { ...process.env, TRON_NETWORK: NETWORK } as Record<string, string>,
  });
  const client = new Client({ name: 'smoke-test', version: '1.0.0' });
  await client.connect(transport);

  // ── Tool-list regression check ──
  const { tools } = await client.listTools();
  const got = new Set(tools.map((t) => t.name));
  const expected = new Set(CASES.map((c) => c.name));
  const missing = [...expected].filter((n) => !got.has(n));
  const extra = [...got].filter((n) => !expected.has(n));
  console.log(`Tools registered: ${got.size} (expected ${expected.size})`);
  if (missing.length) console.log(`  MISSING: ${missing.join(', ')}`);
  if (extra.length) console.log(`  UNEXPECTED: ${extra.join(', ')}`);
  console.log('');

  const counts: Record<Status, number> = { PASS: 0, 'NODE-ERROR': 0, 'PROTOCOL-FAIL': 0, SKIP: 0 };
  const fails: string[] = [];

  for (const c of CASES) {
    if (!inMode(c)) continue;

    if (c.needsContract && !CONTRACT) {
      counts.SKIP++;
      console.log(`${ICON.SKIP} ${c.name.padEnd(40)} no TRC20 (set --contract / TEST_TRC20)`);
      continue;
    }

    const a = c.args(CTX);
    if (a === SKIP) {
      counts.SKIP++;
      console.log(`${ICON.SKIP} ${c.name.padEnd(40)} skipped (missing bootstrap fixture)`);
      continue;
    }

    const t0 = Date.now();
    let status: Status;
    let msg = '';
    try {
      let res = await callOnce(client, c.name, a as Record<string, unknown>);
      const rawText = res?.content?.find((x: any) => x.type === 'text')?.text ?? '';
      if (res?.isError && isRateLimit(rawText)) {
        await sleep(2000);
        res = await callOnce(client, c.name, a as Record<string, unknown>);
      }
      const text = res?.content?.find((x: any) => x.type === 'text')?.text ?? '';
      if (res?.isError) {
        status = 'NODE-ERROR';
        msg = firstLine(text);
      } else {
        let parsed: unknown = text;
        try {
          parsed = JSON.parse(text);
        } catch {
          /* non-JSON ok for some payloads */
        }
        const checkErr = c.check ? c.check(parsed, text) : null;
        if (checkErr) {
          status = 'PROTOCOL-FAIL';
          msg = checkErr;
        } else {
          status = 'PASS';
          c.after?.(CTX, parsed);
        }
      }
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e);
      if (isRateLimit(em)) {
        await sleep(2000);
        try {
          const res = await callOnce(client, c.name, a as Record<string, unknown>);
          status = res?.isError ? 'NODE-ERROR' : 'PASS';
          msg = firstLine(res?.content?.find((x: any) => x.type === 'text')?.text ?? '');
        } catch (e2) {
          status = 'PROTOCOL-FAIL';
          msg = e2 instanceof Error ? e2.message : String(e2);
        }
      } else {
        status = 'PROTOCOL-FAIL';
        msg = em;
      }
    }

    counts[status]++;
    if (status === 'PROTOCOL-FAIL') fails.push(`${c.name}: ${msg}`);
    const ms = `${Date.now() - t0}ms`.padStart(7);
    console.log(`${ICON[status]} ${c.name.padEnd(40)} ${ms}  ${msg}`);
    await sleep(120); // gentle pacing for unauthenticated testnet endpoints
  }

  await client.close();

  console.log(
    `\nSummary: PASS ${counts.PASS} / NODE-ERROR ${counts['NODE-ERROR']} / ` +
      `SKIP ${counts.SKIP} / FAIL ${counts['PROTOCOL-FAIL']}`,
  );
  if (!process.env.TRON_API_KEY) {
    console.log('Tip: set TRON_API_KEY to reduce rate-limit (HTTP 429) noise on public endpoints.');
  }

  const hard = counts['PROTOCOL-FAIL'] > 0 || missing.length > 0 || extra.length > 0;
  if (hard) {
    console.log('\nFAILURES:');
    if (missing.length) console.log(`  tool list missing: ${missing.join(', ')}`);
    if (extra.length) console.log(`  tool list unexpected: ${extra.join(', ')}`);
    for (const f of fails) console.log(`  ${f}`);
  }
  process.exit(hard ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
