import { test, expect } from "./fixtures/surfaces";
import { htmlDragDrop } from "./fixtures/drag";
import { waitForSocket } from "./fixtures/socket-helpers";

// Critical regression coverage: commit 8fb1dd1 fixed the spawning-token bug.
// This spec exercises the path it broke — DM drops a token from the
// TokenPicker onto the dashboard canvas, and the new token must appear on
// every connected surface.
test.describe("token spawn — DM drops a token, syncs to display + player", () => {
  test("dragging a Red token onto the canvas appears on display and player", async ({
    dm,
    display,
    player,
  }) => {
    await Promise.all([
      waitForSocket(dm.page),
      waitForSocket(display.page),
      waitForSocket(player.page),
    ]);

    // Snapshot existing token counts so we can assert "exactly one new Red".
    const baselineDisplay = await display.page
      .locator('[data-testid="token"][data-token-color="#ef4444"]')
      .count();
    const baselinePlayer = await player.page
      .locator('[data-testid="token"][data-token-color="#ef4444"]')
      .count();

    // Open the catalog and grab the Red swatch (TokenPicker labels each
    // swatch with "Drag <Color> token (<size>)").
    await dm.page.getByLabel("Add Token").click();
    const redSwatch = dm.page.locator('button[data-token-color="#ef4444"]');
    await expect(redSwatch).toBeVisible();

    const canvas = dm.page.getByTestId("map-canvas");

    await htmlDragDrop(redSwatch, canvas);

    // Cross-context propagation: poll until both other surfaces see one more
    // Red token than the baseline (Socket.IO travel + React render).
    await expect
      .poll(
        async () =>
          display.page
            .locator('[data-testid="token"][data-token-color="#ef4444"]')
            .count(),
        { message: "display should receive the new Red token", timeout: 10_000 },
      )
      .toBe(baselineDisplay + 1);

    await expect
      .poll(
        async () =>
          player.page
            .locator('[data-testid="token"][data-token-color="#ef4444"]')
            .count(),
        { message: "player should receive the new Red token", timeout: 10_000 },
      )
      .toBe(baselinePlayer + 1);

    // And the dashboard itself should also render it locally.
    await expect(
      dm.page.locator('[data-testid="token"][data-token-color="#ef4444"]'),
    ).toHaveCount(baselineDisplay + 1);
  });
});
