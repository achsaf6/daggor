import { test as base, type BrowserContext, type Page } from "@playwright/test";

export interface Surface {
  context: BrowserContext;
  page: Page;
}

interface SurfacesFixtures {
  dm: Surface;
  display: Surface;
  player: Surface;
}

// Three browser contexts: DM dashboard (desktop, fine pointer), projector
// display (desktop, fine pointer), and a player phone (touch + small viewport).
// Each context has its own localStorage/cookies → its own persistentUserId →
// its own socket connection. Tests act on one and assert on another to verify
// the Socket.IO sync that defines this app.
export const test = base.extend<SurfacesFixtures>({
  dm: async ({ browser }, use) => {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    await page.goto("/dashboard");
    // Toolbar mounting is the cheapest "surface ready" signal on dashboard.
    await page.getByLabel("Settings").waitFor({ state: "visible" });
    await use({ context, page });
    await context.close();
  },
  display: async ({ browser }, use) => {
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    });
    const page = await context.newPage();
    await page.goto("/display");
    // /display has no toolbar — wait for the body to settle.
    await page.waitForLoadState("domcontentloaded");
    await use({ context, page });
    await context.close();
  },
  player: async ({ browser }, use) => {
    const context = await browser.newContext({
      viewport: { width: 414, height: 896 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
    await use({ context, page });
    await context.close();
  },
});

export { expect } from "@playwright/test";
