import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

interface DaggorWindow {
  __daggor?: {
    socket?: {
      id?: string;
      connected?: boolean;
      on?: (event: string, cb: (payload: unknown) => void) => void;
      off?: (event: string, cb: (payload: unknown) => void) => void;
    };
    surface?: string;
    capturedEvents?: Record<string, unknown[]>;
  };
}

// Wait until the page's Socket.IO client has connected and returns its id.
// useSocket exposes the live socket on window.__daggor in non-prod builds.
export async function waitForSocket(page: Page, timeout = 10_000): Promise<string> {
  const handle = await page.waitForFunction(
    () => {
      const w = window as unknown as DaggorWindow;
      return w.__daggor?.socket?.connected ? w.__daggor.socket.id : null;
    },
    null,
    { timeout },
  );
  const id = await handle.jsonValue();
  if (typeof id !== "string") {
    throw new Error("waitForSocket: socket connected but id was not a string");
  }
  return id;
}

// Subscribe to a Socket.IO event on the page side and accumulate payloads on
// window.__daggor.capturedEvents[event]. Tests can later read or poll.
export async function captureSocketEvent(page: Page, event: string): Promise<void> {
  await page.evaluate((evt) => {
    const w = window as unknown as DaggorWindow;
    const root = (w.__daggor ??= {});
    root.capturedEvents ??= {};
    root.capturedEvents[evt] ??= [];
    const socket = root.socket as
      | { on?: (e: string, cb: (p: unknown) => void) => void }
      | undefined;
    if (!socket?.on) {
      throw new Error(`captureSocketEvent: socket not ready for event ${evt}`);
    }
    socket.on(evt, (payload: unknown) => {
      root.capturedEvents![evt].push(payload);
    });
  }, event);
}

// Assert that the page received at least `min` payloads for the given event
// within the configured expect timeout. Use after captureSocketEvent.
export async function expectCapturedCount(
  page: Page,
  event: string,
  min: number,
): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate((evt) => {
          const w = window as unknown as DaggorWindow;
          return w.__daggor?.capturedEvents?.[evt]?.length ?? 0;
        }, event),
      { message: `expected at least ${min} "${event}" events on page`, timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(min);
}

// Read all captured payloads for an event (after expectCapturedCount).
export async function readCapturedEvents<T = unknown>(
  page: Page,
  event: string,
): Promise<T[]> {
  return page.evaluate((evt) => {
    const w = window as unknown as DaggorWindow;
    return (w.__daggor?.capturedEvents?.[evt] ?? []) as unknown[];
  }, event) as Promise<T[]>;
}
