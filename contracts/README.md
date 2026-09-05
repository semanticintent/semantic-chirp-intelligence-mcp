# Contracts

## read.schema.json — the telestrator's read contract

A **vendored copy**. The source of truth lives in the telestrator repo
(`semanticintent/semantic-chirp-telestrator`, `contracts/read.schema.json`), because the
screen defines what it can draw and the analyst adapts to that vocabulary. Never edit this
copy; re-sync it:

```
cp ../semantic-chirp-telestrator/contracts/read.schema.json contracts/read.schema.json
```

`tests/contracts/read-contract.test.ts` checks the copy is well-formed, pins the contract
version, and — when a sibling checkout of the telestrator is present — that the two files are
byte-identical.

Synced from telestrator commit `8f4b867` on 2026-09-04. Contract version 0.1.

What it is for: `read_ice` (planned, see the telestrator's `docs/plan.md` task A2) will emit a
Read that validates against this schema, so the same analysis can be drawn by the telestrator
and read as text by any MCP client.
