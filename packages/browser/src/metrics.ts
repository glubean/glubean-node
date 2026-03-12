/**
 * Performance timing collection for browser pages.
 *
 * Collects Navigation Timing API metrics after page loads and emits them
 * via the Glubean metric callback so they appear in dashboards and trend
 * analysis alongside API latency data.
 *
 * @module metrics
 */

import type { Page } from "puppeteer-core";

/** Callback shape matching `ctx.metric()`. */
export type MetricFn = (
  name: string,
  value: number,
  options?: { unit?: string; tags?: Record<string, string> },
) => void;

interface NavigationTiming {
  navigationStart: number;
  domContentLoadedEventEnd: number;
  loadEventEnd: number;
}

/**
 * Collect Navigation Timing metrics from the page and emit them.
 * Should be called after a successful `page.goto()` navigation.
 *
 * Silently skips if timing data is unavailable (e.g., page not fully loaded).
 */
export async function collectNavigationMetrics(
  page: Page,
  metric: MetricFn,
  url: string,
): Promise<void> {
  try {
    const timing = await page.evaluate(() => {
      // performance.timing is deprecated but universally supported and
      // available in all Chrome versions. The newer PerformanceNavigationTiming
      // API doesn't provide the same absolute timestamps needed here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = (performance as any).timing;
      return {
        navigationStart: t.navigationStart as number,
        domContentLoadedEventEnd: t.domContentLoadedEventEnd as number,
        loadEventEnd: t.loadEventEnd as number,
      };
    }) as NavigationTiming;

    const tags = { url: shortenUrl(url) };

    if (timing.loadEventEnd > 0 && timing.navigationStart > 0) {
      metric("page_load_ms", timing.loadEventEnd - timing.navigationStart, {
        unit: "ms",
        tags,
      });
    }

    if (timing.domContentLoadedEventEnd > 0 && timing.navigationStart > 0) {
      metric(
        "dom_content_loaded_ms",
        timing.domContentLoadedEventEnd - timing.navigationStart,
        { unit: "ms", tags },
      );
    }
  } catch {
    // Page context may be destroyed or navigation incomplete — skip silently
  }
}

function shortenUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}
