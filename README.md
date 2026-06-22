# TronWeb MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server that wraps the [TronWeb](https://tronweb.network/) SDK, exposing TRON blockchain operations as tools for LLMs and AI agents (Claude, GPT, etc.).

Built with: **Node.js + TypeScript**, on the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) over **stdio** transport.

---

## Features

| Category | Tools |
|---|---|
| **Account & Balance** | `get_account`, `get_balance`, `get_account_resources` |
| **Chain Query** | `get_current_block`, `get_block`, `get_transaction`, `get_transaction_info`, `get_chain_parameters`, `get_node_info`, `get_bandwidth_prices`, `get_energy_prices` |
| **TRX / TRC10 Transfer** | `build_trx_transfer`, `build_trc10_transfer`, `build_purchase_trc10_token` |
| **Staking (Stake 2.0)** | `build_freeze_balance_v2`, `build_unfreeze_balance_v2`, `build_withdraw_expire_unfreeze`, `build_delegate_resource`, `build_undelegate_resource` |
| **Voting & SR** | `build_vote_witness`, `build_withdraw_block_rewards`, `build_apply_for_sr`, `build_update_brokerage` |
| **Account Management** | `build_create_account`, `build_update_account_name`, `build_set_account_id`, `build_update_account_permissions` |
| **TRC10 Token** | `build_create_trc10_token`, `build_update_trc10_token` |
| **Governance** | `build_create_proposal`, `build_vote_proposal`, `build_delete_proposal` |
| **Smart Contracts** | `trigger_constant_contract`, `estimate_energy`, `build_trigger_smart_contract`, `build_trc20_transfer`, `build_deploy_smart_contract`, `build_clear_contract_abi`, `build_update_contract_user_fee_percentage`, `build_update_contract_energy_limit` |
| **Transaction Utilities** | `extend_transaction_expiration` |
| **Broadcast & Verify** | `broadcast_transaction`, `verify_message` |

**Total: 43 tools**

> **No signing here.** This server has **no signing capability** — it never holds or contacts a private key. It only **queries**, **builds unsigned transactions**, and **broadcasts** transactions that were signed out-of-band. Signing happens wherever you manage your keys (any wallet, hardware device, or signing service) — entirely outside and independent of this server.

---

## Quick Start

> This server is **read/build/broadcast only** — it never signs and needs no private key or signer connection. To actually submit a transaction, sign the unsigned transaction out-of-band (with any wallet or signer you choose) and broadcast it with `broadcast_transaction`.

```bash
cd mcp-server-tronweb
npm install
cp .env.example .env
# Edit .env: TRON_NETWORK and TRON_API_KEY (optional)
npm run build
npm start
```

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `TRON_NETWORK` | `mainnet` | `mainnet`, `shasta` (testnet), or `nile` (testnet) |
| `TRON_FULL_HOST` | *(auto from `TRON_NETWORK`)* | Override the node URL directly |
| `TRON_API_KEY` | *(empty)* | [TronGrid](https://www.trongrid.io/) API key for higher rate limits |

---

## Adding to Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "tronweb": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server-tronweb/dist/index.js"],
      "env": {
        "TRON_API_KEY": "your-trongrid-api-key",
        "TRON_NETWORK": "mainnet"
      }
    }
  }
}
```

For development (no build step):
```json
{
  "mcpServers": {
    "tronweb": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/mcp-server-tronweb/src/index.ts"],
      "env": {
        "TRON_API_KEY": "your-trongrid-api-key"
      }
    }
  }
}
```

---

## MCP Inspector (Debug)

```bash
npm run inspect
```

---

## Testing

Two layers, both runnable **without a private key** (this server never signs):

### Unit tests

```bash
npm test            # vitest, single run
npm run test:watch  # watch mode
```

### Smoke test — exercise all 43 tools end-to-end

Drives the **real server over stdio** as an MCP client: it launches the server, asserts all 43 tools are registered, then calls each tool with a minimal fixture and prints a per-tool result.

```bash
npm run smoke                     # uses TRON_NETWORK from .env
npm run smoke -- --network nile   # pick a network explicitly
npm run smoke:mainnet             # mainnet, read-only tools only (safe; uses public USDT)
```

Options:

| Flag / env | Default | Description |
|---|---|---|
| `--network nile\|shasta\|mainnet` | `$TRON_NETWORK` → `nile` | Network to test against |
| `--mode read\|build\|all` | `all` | Which tool groups to run |
| `--contract <base58>` / `TEST_TRC20` | mainnet: USDT, else *(none)* | TRC20 used by the contract tools |
| `--include-broadcast` | off | Also exercise `broadcast_transaction` |
| `TRON_API_KEY` | *(empty)* | Reduces HTTP 429 rate-limit noise on public endpoints |

Each tool is classified:

- ✅ **PASS** — well-formed result (reads return data; `build_*` return an unsigned transaction).
- ⚠️ **NODE-ERROR** — the node rejected it (e.g. the throwaway test account has no on-chain state, or the public node lacks a feature). The tool is wired correctly; **not counted as a failure**.
- ⏭️ **SKIP** — intentionally skipped (`broadcast_transaction` by default; the contract tools when no TRC20 is supplied).
- ❌ **PROTOCOL-FAIL** — bad schema / server crash / tool-list mismatch. **Fails the run (exit code 1)** — usable as a CI gate.

> The smoke test signs only locally inside the **test client** (a throwaway key, used solely to derive valid addresses and feed `verify_message`); nothing is ever sent to the server to sign, and `build_*` tools return unsigned transactions — so it is safe to run on a testnet.

---

## Usage Patterns

### Query (no signing required)

```
Human: What is the TRX balance of TRxxx...xxxxxxx?
→ LLM calls get_balance(address="TRxxx...xxxxxxx", network="mainnet")
```

### Build → Sign (out-of-band) → Broadcast

```
Human: Build a TRX transfer of 1 TRX from TXxx to TYyy, then sign and send it.

1. build_trx_transfer(to="TYyy", amount_sun=1000000, from="TXxx")
   → returns an unsigned transaction (expires ~60s after this call)

   Optional — if signing offline may take longer than ~60s, push the
   expiration out BEFORE signing:
   extend_transaction_expiration(transaction=<unsigned>, extension_seconds=3600)
   → returns the same transaction with a later expiration and a new txID

2. Sign it OUTSIDE this server (this server cannot sign).
   Use whatever wallet or signer you manage your keys with.
   → returns the signed transaction

3. broadcast_transaction(signed_transaction=<signed>)
   → returns {result: true, txid: "..."}
```

### TRC20 Token Transfer (build only)

```
Human: Transfer 100 USDT (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t) from TXxx to TYyy

→ build_trc20_transfer(
    token_contract_address="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    from="TXxx",
    to="TYyy",
    amount="100000000"    ← 100 USDT with 6 decimals
  )
  → returns an unsigned transaction; sign it out-of-band, then broadcast_transaction(...)
```

### Contract Interaction (read)

```
Human: What is the USDT balance of TXxx?

→ trigger_constant_contract(
    contract_address="TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    function_selector="balanceOf(address)",
    parameters=[{"type":"address","value":"TXxx"}]
  )
```

### Staking (Stake 2.0, build only)

```
Human: Stake 100 TRX for ENERGY on shasta testnet from TXxx.

→ build_freeze_balance_v2(amount_sun=100000000, resource="ENERGY", owner_address="TXxx", network="shasta")
  → returns an unsigned transaction; sign it out-of-band, then broadcast_transaction(...)
```

---

## Security Notes

- **This server has no signing capability.** It never holds, reads, or contacts a private key, and it has no connection to any signer service.
- Its surface is limited to: **queries** (`get_*`, `trigger_constant_contract`, `estimate_energy`), **building unsigned transactions** (`build_*`), and **broadcasting** transactions that were signed elsewhere (`broadcast_transaction`). `verify_message` is read-only signature verification.
- Signing happens **out-of-band**, wherever you manage your keys (any wallet, hardware device, or signing service) — that component is the only thing that ever holds the private key, and it is fully independent of this server.
- Always verify transaction details before signing them out-of-band — the AI builds transactions, but a human/the signer decides whether to sign and submit.

---

## Project Structure

```
mcp-server-tronweb/
├── src/
│   ├── index.ts                    # MCP server entry (stdio transport)
│   ├── config.ts                   # Environment config (network, API key)
│   ├── tronweb-factory.ts          # Read-only TronWeb instance factory & helpers
│   └── tools/
│       ├── account-query.ts        # Account & chain query tools
│       ├── transaction-builder.ts  # Build unsigned transactions
│       ├── contract.ts             # Smart contract tools (build / read-only)
│       └── broadcast.ts            # Broadcast signed txns + verify_message (no signing)
├── scripts/
│   └── smoke-test.ts               # End-to-end smoke test — all 43 tools over stdio
├── dist/                           # Compiled JS (after npm run build)
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Networks

| Name | URL | Chain |
|---|---|---|
| `mainnet` | https://api.trongrid.io | TRON Mainnet |
| `shasta` | https://api.shasta.trongrid.io | Shasta Testnet |
| `nile` | https://api.nileex.io | Nile Testnet |

All tools accept an optional `network` parameter to override the default.

---

## License

MIT © [tronweb3](https://github.com/tronweb3)
