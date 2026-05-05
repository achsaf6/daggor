import { test, expect } from "./fixtures/surfaces";
import { waitForSocket } from "./fixtures/socket-helpers";
import type { BrowserContext, Page } from "@playwright/test";

// Mobile clients drop and reconnect constantly — radio sleep, app switching,
// network handover. The single-tab reconnect path was already correct via
// disconnectedUsers + persistentUserId. These tests lock in two harder cases
// the earlier code didn't handle: (a) takeover when a fresh socket arrives
// while the old one is still considered active (zombie connection), and
// (b) the canonical close-and-rejoin ghost path. In both, the dashboard
// must show exactly ONE token for that player — never two.

const PERSISTENT_ID_KEY = "persistentUserId";

const readPersistentId = (page: Page): Promise<string | null> =>
  page.evaluate((key) => window.localStorage.getItem(key), PERSISTENT_ID_KEY);

// useSocket exposes the assigned color on window.__daggor.myColor in dev
// builds (see app/hooks/useSocket.ts). We poll because user-connected fires
// shortly after socket.connected, and the test sometimes races it.
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
  if (typeof color !== "string") {
    throw new Error("waitForMyColor: __daggor.myColor was not a string");
  }
  return color;
};

const countTokensOfColor = (page: Page, color: string): Promise<number> =>
  page.locator(`[data-testid="token"][data-token-color="${color}"]`).count();

const openPlayerInContext = async (context: BrowserContext): Promise<Page> => {
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");
  await waitForSocket(page);
  return page;
};

test.describe("reconnect — single token survives drop, refresh, takeover", () => {
  test("page reload keeps the same persistentUserId and one token", async ({
    dm,
    player,
  }) => {
    await waitForSocket(player.page);
    const playerColor = await waitForMyColor(player.page);
    const persistentBefore = await readPersistentId(player.page);
    expect(persistentBefore).toMatch(/^user-/);

    // Confirm the dashboard rendered the player's token before reload.
    await expect
      .poll(async () => countTokensOfColor(dm.page, playerColor), {
        message: "dashboard should render exactly one token of player's color",
        timeout: 8_000,
      })
      .toBe(1);

    await player.page.reload();
    await waitForSocket(player.page);
    const persistentAfter = await readPersistentId(player.page);
    expect(persistentAfter).toBe(persistentBefore);

    await expect
      .poll(async () => countTokensOfColor(dm.page, playerColor), {
        message: "exactly one token of the original color after reload",
        timeout: 8_000,
      })
      .toBe(1);
  });

  test("opening a second tab with the same persistentUserId kicks the first", async ({
    dm,
    player,
  }) => {
    await waitForSocket(player.page);
    const playerColor = await waitForMyColor(player.page);
    const persistentId = await readPersistentId(player.page);
    expect(persistentId).toMatch(/^user-/);

    // Second tab in the SAME BrowserContext shares localStorage, so the new
    // socket identifies with the same persistentUserId.
    const secondTab = await openPlayerInContext(player.context);

    // The old socket should disconnect (server kicked it via takeover).
    await expect
      .poll(
        async () =>
          player.page.evaluate(() => {
            const w = window as unknown as {
              __daggor?: { socket?: { connected?: boolean } };
            };
            return w.__daggor?.socket?.connected ?? null;
          }),
        { message: "old tab's socket should be disconnected", timeout: 8_000 },
      )
      .toBe(false);

    // Dashboard should still see exactly one token of the player's color.
    await expect
      .poll(async () => countTokensOfColor(dm.page, playerColor), {
        message: "exactly one token of the original color after takeover",
        timeout: 8_000,
      })
      .toBe(1);

    await secondTab.close();
  });

  test("closing and rejoining with the same persistentUserId restores the same token", async ({
    browser,
    dm,
  }) => {
    // Start fresh: own context for the player so we can close it cleanly.
    const playerContext = await browser.newContext({
      viewport: { width: 414, height: 896 },
      hasTouch: true,
      isMobile: true,
    });
    const playerPage = await openPlayerInContext(playerContext);

    const persistentId = await readPersistentId(playerPage);
    expect(persistentId).toMatch(/^user-/);
    const playerColor = await waitForMyColor(playerPage);

    await playerContext.close();

    // The dashboard's local state moves the user from otherUsers to
    // disconnectedUsers — TokenManager keeps rendering a token for them, so
    // the count stays at one, just from a different map.
    await expect
      .poll(async () => countTokensOfColor(dm.page, playerColor!), {
        message: "ghost token still rendered after disconnect",
        timeout: 8_000,
      })
      .toBe(1);

    // Open a brand-new context with the previous persistentUserId injected
    // into localStorage *before* the page boots, so useSocket picks it up
    // and identifies with the same id.
    const rejoinContext = await browser.newContext({
      viewport: { width: 414, height: 896 },
      hasTouch: true,
      isMobile: true,
    });
    await rejoinContext.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      { key: PERSISTENT_ID_KEY, value: persistentId! },
    );
    const rejoinPage = await openPlayerInContext(rejoinContext);

    // After rejoin, server restores color from disconnectedUsers and the
    // dashboard moves the user back to otherUsers. Same color, still one
    // token, never two.
    await expect
      .poll(async () => countTokensOfColor(dm.page, playerColor!), {
        message: "exactly one token of the original color after rejoin",
        timeout: 8_000,
      })
      .toBe(1);

    // The rejoin page's persistentUserId should match — confirms that the
    // injection took and the server reused identity rather than allocating
    // a fresh one (which would have given the player a new color).
    const rejoinedPersistentId = await readPersistentId(rejoinPage);
    expect(rejoinedPersistentId).toBe(persistentId);

    await rejoinContext.close();
  });
});
