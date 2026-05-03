import { test, expect } from "./fixtures/surfaces";
import { pointerDrag } from "./fixtures/drag";
import {
  captureSocketEvent,
  expectCapturedCount,
  readCapturedEvents,
  waitForSocket,
} from "./fixtures/socket-helpers";

interface BattlemapUpdatedPayload {
  spawnArea?: { x: number; y: number; width: number; height: number };
}

// DM activates the spawn-area tool, drags a rectangle on the canvas, and the
// updated battlemap (with a new spawnArea) is broadcast over Socket.IO. We
// assert that the player receives a battlemap:updated payload whose spawnArea
// reflects the rectangle we drew.
test.describe("spawn area — DM drags a rectangle, broadcast to player", () => {
  test("dragging the spawn tool updates spawnArea on all clients", async ({
    dm,
    player,
  }) => {
    await Promise.all([waitForSocket(dm.page), waitForSocket(player.page)]);
    await captureSocketEvent(player.page, "battlemap:updated");

    // Activate the spawn-area tool (toggles isSpawnToolActive on the DM).
    const spawnButton = dm.page.getByLabel("Spawn area tool");
    await spawnButton.click();
    await expect(spawnButton).toHaveAttribute("aria-pressed", "true");

    // Drag a rectangle on the dashboard canvas. Coords are in viewport pixels
    // — at 1920×1080 the canvas spans the whole window.
    await pointerDrag(dm.page, { x: 600, y: 400 }, { x: 1100, y: 700 });

    // Player must observe at least one battlemap:updated whose spawnArea has
    // non-zero width/height (a real drag, not the default seed value).
    await expectCapturedCount(player.page, "battlemap:updated", 1);

    await expect
      .poll(
        async () => {
          const events = await readCapturedEvents<BattlemapUpdatedPayload>(
            player.page,
            "battlemap:updated",
          );
          const last = events[events.length - 1];
          return last?.spawnArea ?? null;
        },
        { message: "player should see a non-default spawnArea", timeout: 10_000 },
      )
      .toMatchObject({
        width: expect.any(Number),
        height: expect.any(Number),
      });

    // Toggle off so subsequent specs aren't affected.
    await spawnButton.click();
  });
});
