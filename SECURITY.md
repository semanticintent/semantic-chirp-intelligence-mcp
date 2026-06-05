# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 3.x     | :white_check_mark: |
| < 3.0   | :x:                |

## Reporting a Vulnerability

Please **do not** open a public issue for security vulnerabilities.

Instead, report them privately via [GitHub Security Advisories](https://github.com/semanticintent/semantic-chirp-intelligence-mcp/security/advisories/new), or by emailing the maintainer. You can expect an initial response within 5 business days.

When reporting, please include:

- A description of the vulnerability and its impact
- Steps to reproduce
- Affected version(s)

## Credential Handling (important)

This server authenticates to the Yahoo Fantasy Sports API using **OAuth 2.0** and stores secrets locally. Follow these rules:

- **Never commit secrets.** Your Yahoo `CLIENT_ID`, `CLIENT_SECRET`, and the generated `.yahoo-oauth.json` token must never be committed. They are excluded by `.gitignore` by default — keep it that way.
- **Keep credentials in `.env`** (git-ignored) or your MCP client's `env` block — never hardcode them into source, tests, or debug scripts.
- **If a secret is ever exposed** (committed, pasted publicly, leaked in logs), treat it as compromised: **rotate it immediately** by creating a new Yahoo app at [developer.yahoo.com/apps](https://developer.yahoo.com/apps/) and deleting the old one. Rotation is the only reliable fix — scrubbing git history alone is not sufficient.
- **Tokens are local.** Access/refresh tokens live in `.yahoo-oauth.json` on your machine. The server runs locally over stdio and sends no data to third parties beyond Yahoo's own API.

## Scope

This is a **read-only** integration with the Yahoo Fantasy Sports API. It requests the minimum `Read` permission and does not modify your roster, lineup, or transactions.
