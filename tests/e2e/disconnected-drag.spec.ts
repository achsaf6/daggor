import { test, expect } from "./fixtures/surfaces";
import { waitForSocket } from "./fixtures/socket-helpers";
import type { BrowserContext, Page } from "@playwright/test";

// Smoke-checks whether the dashboard can move a disconnected (faded) player
// token. Per the existing code, dragging the dimmed token should send a
// position-update for the disconnected user's persistentUserId and the server
// should accept it (server.js:2146-2156). This test exists to confirm the
// behavior the user said wasn't working.

const PERSISTENT_ID_KEY = "persistentUserId";

const waitForMyColor = async (page: Page, timeout = 8_000): Promise<string> => {
  const handle = await page.waitForFunction(
    () => {
      const w = window as unknown as { __daggor?: { myColor?: string } };
      return w.__daggor?.myColor ?? null;
    },
    null,
    { timeout },
  );
  const color = await handle.jsonValue();
  if (typeof color !== "string") throw new Error("color missing");
  return color;
};

const openPlayerInContext = async (context: BrowserContext): Promise<Page> => {
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await waitForSocket(page);
  return page;
};

test("dashboard can drag a disconnected player's faded token", async ({
  browser,
  dm,
}) => {
  const playerContext = await browser.newContext({
    viewport: { width: 414, height: 896 },
    hasTouch: true,
    isMobile: true,
  });
  const playerPage = await openPlayerInContext(playerContext);
  const playerColor = await waitForMyColor(playerPage);

  // Player disconnects.
  await playerContext.close();

  // Token should remain on the dashboard, now faded.
  const token = dm.page.locator(
    `[data-testid="token"][data-token-color="${playerColor}"]`,
  );
  await expect(token).toHaveCount(1, { timeout: 8_000 });

  const before = await token.boundingBox();
  if (!before) throw new Error("token has no bounding box");
  const startX = before.x + before.width / 2;
  const startY = before.y + before.height / 2;

  // Drag the faded token noticeably down-and-right.
  await dm.page.mouse.move(startX, startY);
  await dm.page.mouse.down();
  await dm.page.mouse.move(startX + 200, startY + 200, { steps: 10 });
  await dm.page.mouse.up();

  // Wait for the position-update round trip + snap.
  await dm.page.waitForTimeout(500);

  const after = await token.boundingBox();
  if (!after) throw new Error("token disappeared after drag");
  const movedX = Math.abs(after.x - before.x);
  const movedY = Math.abs(after.y - before.y);
  expect(
    movedX > 20 || movedY > 20,
    `expected faded token to move; before=${before.x},${before.y} after=${after.x},${after.y}`,
  ).toBe(true);
});
