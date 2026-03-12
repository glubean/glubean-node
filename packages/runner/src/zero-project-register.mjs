/**
 * Registration entry point for the zero-project ESM resolver.
 *
 * Used via: tsx --import <this-file> harness.js ...
 *
 * Registers the custom resolver hook so that @glubean/* imports
 * can be resolved from the runner's vendored node_modules even when
 * the user has no node_modules in their working directory.
 */

import { register } from "node:module";

register(new URL("./zero-project-resolver.mjs", import.meta.url));
