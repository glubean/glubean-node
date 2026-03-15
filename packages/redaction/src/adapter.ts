/**
 * @module adapter
 *
 * Generic event redaction dispatcher.
 *
 * v2 replaces the hardcoded event-type switch with a data-driven dispatcher
 * that uses compiled scopes to find matching scopes, extract targets,
 * and apply handlers.
 */

import type { CompiledScope, HandlerContext, RedactionResult } from "./types.js";
import { createScopeEngine } from "./compiler.js";

/**
 * A generic event shape. The dispatcher only reads `type` and mutates
 * payload fields on a clone based on compiled scope declarations.
 */
export interface RedactableEvent {
  type: string;
  [key: string]: unknown;
}

/**
 * Redact an event by dispatching its payload fields to matching scopes.
 * Returns a new event object — the original is not mutated.
 *
 * @param event  The event to redact.
 * @param scopes Pre-compiled scopes from compileScopes().
 * @param replacementFormat Replacement format for engine instances.
 * @param maxDepth Optional max object depth.
 */
export function redactEvent(
  event: RedactableEvent,
  scopes: CompiledScope[],
  replacementFormat: "simple" | "labeled" | "partial" = "partial",
  maxDepth?: number,
): RedactableEvent {
  // Find all enabled scopes matching this event type
  const matching = scopes.filter(
    (scope) => scope.enabled && scope.event === event.type,
  );

  if (matching.length === 0) return event;

  // Clone to avoid mutating the original
  const clone = structuredClone(event);

  for (const scope of matching) {
    const current = scope.get(clone);
    if (current === undefined) continue;

    const engine = createScopeEngine(scope, replacementFormat, maxDepth);
    const ctx: HandlerContext = {
      scopeId: scope.id,
      scopeName: scope.name,
    };

    const result = scope.handler.process(current, ctx, engine);
    scope.set(clone, result.value);
  }

  return clone;
}
