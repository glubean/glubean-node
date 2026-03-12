import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

export const MCP_PACKAGE_VERSION = pkg.version;
export const DEFAULT_GENERATED_BY = `@glubean/mcp@${MCP_PACKAGE_VERSION}`;
