/**
 * Zero-project ESM resolver for @glubean/* packages.
 *
 * When a test file lives outside a project (no node_modules), this resolver
 * intercepts `@glubean/*` imports and resolves them from the runner's own
 * node_modules — so users can write a single .test.js file and run it
 * without `npm install`.
 *
 * Injected by TestExecutor via `--import` when zero-project mode is active.
 *
 * The GLUBEAN_VENDORED_ROOT env var is set by the executor to point to
 * the directory containing @glubean/sdk (the runner's parent node_modules).
 */

const vendoredRoot = process.env["GLUBEAN_VENDORED_ROOT"];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Fallback: resolve @glubean/* from the runner's own node_modules
    if (vendoredRoot && specifier.startsWith("@glubean/")) {
      const parentURL = `file://${vendoredRoot}/.zero-project-resolver`;
      return nextResolve(specifier, { ...context, parentURL });
    }
    throw err;
  }
}
