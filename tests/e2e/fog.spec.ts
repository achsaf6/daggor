import { test, expect } from "./fixtures/surfaces";
import { pointerDrag } from "./fixtures/drag";
import { waitForSocket } from "./fixtures/socket-helpers";

// DM activates the fog tool, drags to add a fog rectangle. The display and
// player must render the new fog shape (count goes up by 1).
test.describe("fog of war — DM adds fog, syncs opaque to display + player", () => {
  test("fog tool drag adds a shape; display + player render it", async ({
    dm,
    display,
    player,
  }) => {
    await Promise.all([
      waitForSocket(dm.page),
      waitForSocket(display.page),
      waitForSocket(player.page),
    ]);

    const readFogCount = async (page: import("@playwright/test").Page) => {
      const overlay = page.locator('[data-testid="fog-overlay"]').first();
      if ((await overlay.count()) === 0) return 0;
      const v = await overlay.getAttribute("data-fog-shape-count");
      return Number(v ?? "0");
    };
    const baselineDisplay = await readFogCount(display.page);
    const baselinePlayer = await readFogCount(player.page);

    const fogButton = dm.page.getByLabel("Fog of war");
    await fogButton.click();
    await expect(fogButton).toHaveAttribute("aria-pressed", "true");

    await pointerDrag(dm.page, { x: 700, y: 350 }, { x: 1200, y: 750 });

    // The FogOfWar component returns null when shapes.length === 0, so the
    // overlay element only exists once at least one shape is drawn. After the
    // drag, the surfaces should each render an overlay with count = baseline+1.
    await expect
      .poll(async () => readFogCount(display.page), {
        message: "display fog count should grow",
        timeout: 10_000,
      })
      .toBe(baselineDisplay + 1);

    await expect
      .poll(async () => readFogCount(player.page), {
        message: "player fog count should grow",
        timeout: 10_000,
      })
      .toBe(baselinePlayer + 1);

    // Player fog opacity must be 1 (fully opaque) — the user explicitly fixed
    // a bug where players could see through fog. We assert via the inline
    // style on the SVG overlay; the FogOfWar component sets opacity={1} by
    // default for non-dashboard surfaces.
    const playerOpacity = await player.page
      .locator('[data-testid="fog-overlay"]')
      .first()
      .evaluate((el) => Number(getComputedStyle(el as Element).opacity));
    expect(playerOpacity).toBeGreaterThanOrEqual(0.99);

    await fogButton.click();
  });
});
