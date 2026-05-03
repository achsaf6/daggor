import { test, expect } from "./fixtures/surfaces";
import {
  captureSocketEvent,
  expectCapturedCount,
  readCapturedEvents,
  waitForSocket,
} from "./fixtures/socket-helpers";

interface BattlemapUpdatedPayload {
  activeImageId?: string | null;
  images?: Array<{ id: string }>;
}

// Floor switching: DM uses the floor controls in the toolbar to advance to
// the next/previous floor. The active battlemap's activeImageId changes and
// is broadcast over Socket.IO to the display.
test.describe("floors — DM switches floors, syncs to display", () => {
  test("Floor button advances activeImageId on the display", async ({
    dm,
    display,
  }) => {
    await Promise.all([waitForSocket(dm.page), waitForSocket(display.page)]);
    await captureSocketEvent(display.page, "battlemap:updated");

    // Floor controls only appear when floorCount > 1. Add a second floor via
    // the BattlemapManager UI if needed (this also produces a battlemap:updated
    // event we can assert against, but the click-to-navigate path is the
    // canonical assertion below).
    const nextFloor = dm.page.getByLabel("Next floor");
    const prevFloor = dm.page.getByLabel("Previous floor");
    if ((await nextFloor.count()) === 0) {
      await dm.page.getByLabel("Battlemap Manager").click();
      await dm.page.getByRole("button", { name: /\+\s*Add Floor/i }).click();
      await dm.page.mouse.click(1500, 500);
      await expect(nextFloor).toBeVisible();
    }

    // handleNextFloor short-circuits when the active floor is already the last
    // one, and handlePrevFloor short-circuits at the first. Pick whichever has
    // somewhere to go by parsing the label text "(k/M)".
    const labelText =
      (await dm.page
        .locator("text=/\\(\\d+\\/\\d+\\)/")
        .first()
        .textContent()) ?? "";
    const m = labelText.match(/\((\d+)\/(\d+)\)/);
    const k = m ? Number(m[1]) : 1;
    const total = m ? Number(m[2]) : 2;
    const direction = k < total ? "next" : "prev";

    const beforeCount =
      (await readCapturedEvents<BattlemapUpdatedPayload>(
        display.page,
        "battlemap:updated",
      )).length;

    if (direction === "next") {
      await nextFloor.click();
    } else {
      await prevFloor.click();
    }

    await expectCapturedCount(display.page, "battlemap:updated", beforeCount + 1);
    const events = await readCapturedEvents<BattlemapUpdatedPayload>(
      display.page,
      "battlemap:updated",
    );
    const last = events[events.length - 1];
    expect(last?.activeImageId).toBeTruthy();
    expect((last?.images?.length ?? 0) >= 2).toBe(true);
  });
});
