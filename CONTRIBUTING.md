# Contributing to Semantic CHIRP Intelligence MCP

Thanks for your interest in contributing! This project is an MCP server that brings
**Semantic Intent**–driven fantasy-hockey intelligence to Claude. Contributions of all
kinds are welcome — bug fixes, new analyses, docs, and tests.

## Getting Started

1. **Fork and clone** the repository.
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Set up credentials** (see [README](./README.md)): copy `.env.example` to `.env`
   and add your own Yahoo API credentials. **Never commit `.env` or `.yahoo-oauth.json`.**
4. **Build and test:**
   ```bash
   npm run build
   npm test
   ```

## Development Workflow

- Create a feature branch: `git checkout -b feat/your-feature`
- Make your changes with clear, focused commits ([Conventional Commits](https://www.conventionalcommits.org/) preferred: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
- Add or update tests for any behavior change (`npm test`).
- Ensure the build passes (`npm run build`) and the full suite is green.
- Open a Pull Request against `main` using the PR template.

## Architecture Conventions

This codebase follows a **Semantic Intent + Template Pattern** architecture. When adding a tool or analysis, keep these conventions:

- **Analyses** live in `src/analyses/` and extend the shared `AnalysisTemplate` (`src/template/`). One analysis = one class.
- **Tool metadata** (discovery tags, intent category, chirp style) is declared in `src/config/tool-metadata.ts` — every tool carries semantic-anchoring markers. See [`SEMANTIC_ANCHORING_GOVERNANCE.md`](./SEMANTIC_ANCHORING_GOVERNANCE.md).
- **Personality / output styling** is configured in `src/config/` (`personality-modes.ts`, `chirp-styles.ts`) — keep presentation out of analysis logic.
- **Yahoo API access** goes through `src/services/YahooApiClient.ts`. Don't scatter raw API calls.
- **Types** belong in `src/domain/types.ts`.
- Keep the integration **read-only**. Any write capability (lineup setting, add/drop) is a deliberate, separately-scoped change requiring the Yahoo `Read/Write` permission.

## Reporting Bugs / Requesting Features

Use the GitHub issue templates. For security issues, **do not** open a public issue —
see [SECURITY.md](./SECURITY.md).

## Code of Conduct

By participating, you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE).
