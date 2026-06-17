# Security Policy

## Reporting a Vulnerability

Please report security issues **privately** — do not open a public GitHub issue
for a security-sensitive report.

- Use GitHub's **Security Advisories** ("Report a vulnerability" on the
  repository's **Security** tab) to disclose privately.
- Include a description, reproduction steps, and the impact you observed.

We aim to acknowledge reports within 72 hours and to share a remediation
timeline after triage.

## Security Model

This server is intentionally **read / build / broadcast only**:

- It **never holds, requests, or transmits a private key**, mnemonic, or signer
  credential, and it cannot sign transactions.
- It only **queries** the chain, **builds unsigned transactions**, and
  **broadcasts** transactions that were already signed out-of-band.
- Signing must happen in a wallet, hardware device, or signing service you
  control — entirely outside this process.

## Operator Guidance

- Point the server only at TRON endpoints you trust (`TRON_FULL_HOST` /
  `TRON_NETWORK`). A malicious or compromised node can return misleading query
  results or unsigned transactions.
- Keep `TRON_API_KEY` in a local, gitignored `.env` or your secret manager;
  never commit it.
- Treat every address, amount, and contract call surfaced through an LLM as
  untrusted input: **review the decoded transaction details before you sign and
  broadcast**.
