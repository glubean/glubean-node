# Glubean OSS (Node.js) — Project Rules

## Repo Structure
- Monorepo with pnpm workspaces
- Packages: sdk, scanner, redaction, runner, auth, mcp, graphql, browser, cli
- Publish workflow triggers on git tags matching `v*`

## Version Policy

### Core packages (versions must be aligned)
sdk, scanner, redaction, runner, cli

- **All core packages share the same version number.** Always bump them together.
- Pre-launch: PATCH only (`0.1.x`).
- Bump command: `pnpm --filter @glubean/sdk --filter @glubean/scanner --filter @glubean/redaction --filter @glubean/runner --filter @glubean/cli exec -- npm version 0.1.X --no-git-tag-version`

### Plugin packages (versioned independently)
auth, browser, graphql, mcp

- Each plugin has its own version. Bump only the plugin you changed.
- Bump command (example): `pnpm --filter @glubean/browser exec -- npm version 0.2.X --no-git-tag-version`

### Release flow
- Commit bump → `git tag v0.1.X` → `git push && git push origin v0.1.X`
- Never publish a version that already exists on npm. Always bump before tagging.
- CI publishes all packages on tag. Already-published versions are skipped (`continue-on-error`).

## Publish Order (dependency chain)
sdk → scanner → redaction → runner → cli (core), then auth, browser, graphql, mcp (plugins)

The CI workflow handles this automatically. Do not change the order without updating the dependency graph.

## Branch Policy
- Solo development: direct commits to main are OK.
- With collaborators: require branch + PR + squash merge. Add branch protection when the team grows.
