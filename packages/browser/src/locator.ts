/**
 * WrappedLocator — Proxy-based wrapper around Puppeteer's Locator that
 * auto-injects trace events and screenshot capture for action methods.
 *
 * @module locator
 */

import type { ElementHandle, Locator } from "puppeteer-core";

/** Context required by the WrappedLocator for trace/screenshot injection. */
export interface LocatorContext {
  action(event: {
    category: string;
    target: string;
    duration: number;
    status: "ok" | "error" | "timeout";
    detail?: Record<string, unknown>;
  }): void;
  captureStep(label: string): Promise<void>;
  captureFailure(label: string): Promise<void>;
}

/** A Puppeteer Locator enhanced with auto-tracing and screenshot capture. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WrappedLocator = Locator<any> & {
  /**
   * Type text into the located element (appends — does not clear).
   *
   * Puppeteer's Locator has no `type()` method, so this is an extension
   * that calls `waitHandle()` + `handle.type()` under the hood.
   */
  type(text: string): Promise<void>;
};

/** Methods that return a new Locator — we re-wrap the result. */
const CHAIN_METHODS = new Set([
  "setTimeout",
  "setVisibility",
  "setEnsureElementIsInTheViewport",
  "setWaitForEnabled",
  "setWaitForStableBoundingBox",
  "clone",
  "filter",
  "map",
]);

/** Action methods that get trace/screenshot injection. */
const ACTION_METHODS = new Set([
  "click",
  "fill",
  "hover",
  "scroll",
]);

/**
 * Create a WrappedLocator that proxies a Puppeteer Locator with auto-tracing.
 *
 * - **Chain methods** (setTimeout, setVisibility, etc.) return a new WrappedLocator.
 * - **Action methods** (click, fill, hover, scroll) inject trace + screenshot.
 * - **type()** is a custom extension (Locator has no type method).
 * - Everything else is transparently forwarded.
 */
export function createWrappedLocator(
  inner: Locator<unknown>,
  ctx: LocatorContext,
  selector: string,
): WrappedLocator {
  const proxy = new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === "type") {
        return async (text: string) => {
          const start = Date.now();
          try {
            const handle = await target.waitHandle() as ElementHandle;
            await handle.type(text);
            await handle.dispose();
            const duration = Date.now() - start;
            ctx.action({
              category: "browser:type",
              target: selector,
              duration,
              status: "ok",
              detail: { textLength: text.length },
            });
            await ctx.captureStep(`type-${selector}`);
          } catch (err) {
            const duration = Date.now() - start;
            ctx.action({
              category: "browser:type",
              target: selector,
              duration,
              status: "timeout",
              detail: { textLength: text.length, error: String(err) },
            });
            await ctx.captureFailure(`type-${selector}`);
            throw err;
          }
        };
      }

      if (typeof prop === "string" && CHAIN_METHODS.has(prop)) {
        const origFn = Reflect.get(target, prop, receiver);
        if (typeof origFn === "function") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (...args: any[]) => {
            const newLocator = origFn.apply(target, args);
            return createWrappedLocator(newLocator, ctx, selector);
          };
        }
      }

      if (typeof prop === "string" && ACTION_METHODS.has(prop)) {
        const origFn = Reflect.get(target, prop, receiver);
        if (typeof origFn === "function") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return async (...args: any[]) => {
            const start = Date.now();
            try {
              const result = await origFn.apply(target, args);
              const duration = Date.now() - start;
              ctx.action({
                category: `browser:${prop}`,
                target: selector,
                duration,
                status: "ok",
              });
              await ctx.captureStep(`${prop}-${selector}`);
              return result;
            } catch (err) {
              const duration = Date.now() - start;
              ctx.action({
                category: `browser:${prop}`,
                target: selector,
                duration,
                status: "timeout",
                detail: { error: String(err) },
              });
              await ctx.captureFailure(`${prop}-${selector}`);
              throw err;
            }
          };
        }
      }

      // Everything else — transparent passthrough
      return Reflect.get(target, prop, receiver);
    },
  });

  return proxy as unknown as WrappedLocator;
}
