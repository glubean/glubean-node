/**
 * Worker command — self-hosted worker management.
 * Stub: full implementation deferred to future work.
 */

export interface WorkerOptions {
  instances?: number | "auto";
  config?: string;
  apiUrl?: string;
  token?: string;
  logLevel?: string;
  workerId?: string;
}

export async function workerCommand(
  subcommand: string,
  _options: WorkerOptions = {},
): Promise<void> {
  console.error(
    `Worker command "${subcommand}" is not yet implemented in the Node.js CLI.\n` +
      "Self-hosted worker support is coming in a future release.",
  );
  process.exit(1);
}
