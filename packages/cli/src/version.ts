import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkg = require(resolve(__dirname, "../package.json"));

/**
 * Current Glubean CLI version from this package's `package.json`.
 */
export const CLI_VERSION: string = pkg.version;
