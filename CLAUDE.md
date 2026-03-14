# Glubean OSS (Node.js) — Project Rules

## Repo Structure
- Monorepo with pnpm workspaces
- Packages: sdk, scanner, redaction, runner, auth, mcp, graphql, browser, cli
- Publish workflow triggers on git tags matching `v*`

## Version Policy
- **All packages share the same version number.** Always bump all packages together.
- Pre-launch: PATCH only (`0.1.x`).
- Bump command: `pnpm -r exec -- npm version 0.1.X --no-git-tag-version`
- Release flow: commit bump → `git tag v0.1.X` → `git push && git push origin v0.1.X`
- Never publish a version that already exists on npm. Always bump before tagging.

## Publish Order (dependency chain)
sdk → scanner → redaction → runner → auth → mcp → graphql → browser → cli

The CI workflow handles this automatically. Do not change the order without updating the dependency graph.

## Branch Policy
- Solo development: direct commits to main are OK.
- With collaborators: require branch + PR + squash merge. Add branch protection when the team grows.
