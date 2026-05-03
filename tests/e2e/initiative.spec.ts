import { test, expect } from "./fixtures/surfaces";
import {
  captureSocketEvent,
  expectCapturedCount,
  readCapturedEvents,
  waitForSocket,
} from "./fixtures/socket-helpers";

interface InitiativeUpdatedPayload {
  entries?: Array<{ tokenId: string; score: number; name: string }>;
  currentIndex?: number;
  round?: number;
}

// DM seeds initiative entries, advances NEXT TURN. The server broadcasts
// initiative:updated to all connected sockets. We assert the player sees the
// state change.
test.describe("initiative — DM seeds + advances, syncs to player", () => {
  test("seeding entries broadcasts initiative:updated to the player", async ({
    dm,
    player,
  }) => {
    await Promise.all([waitForSocket(dm.page), waitForSocket(player.page)]);
    await captureSocketEvent(player.page, "initiative:updated");

    // The DM dashboard renders InitiativePanel only inside the dashboard
    // shell — open the SET UP / EDIT flow.
    await dm.page.getByRole("button", { name: /SET UP|EDIT/ }).click();

    // The edit form uses Name + Score inputs per draft row. If there are no
    // active tokens (no players connected with tokens), the form might be
    // empty — in that case we directly emit via the exposed socket as the
    // simplest way to validate the listener path. The UI test below is the
    // happy-path; the socket fallback covers the empty-list case.
    const nameInputs = dm.page.locator('input[placeholder="Name"]');
    if ((await nameInputs.count()) === 0) {
      await dm.page.evaluate(() => {
        const w = window as unknown as {
          __daggor?: {
            socket?: {
              emit?: (event: string, payload: unknown) => void;
            };
          };
        };
        w.__daggor?.socket?.emit?.("initiative:set-entries", {
          entries: [
            { tokenId: "test-id-1", score: 18, name: "Goblin" },
            { tokenId: "test-id-2", score: 12, name: "Hero" },
          ],
        });
      });
    } else {
      // Fill the first row and save.
      await nameInputs.first().fill("Goblin");
      await dm.page.locator('input[type="number"]').first().fill("18");
      await dm.page.getByRole("button", { name: "SAVE" }).click();
    }

    await expectCapturedCount(player.page, "initiative:updated", 1);
    const events = await readCapturedEvents<InitiativeUpdatedPayload>(
      player.page,
      "initiative:updated",
    );
    const last = events[events.length - 1];
    expect(last?.entries?.length ?? 0).toBeGreaterThanOrEqual(1);

    // Advance NEXT TURN (only meaningful if entries exist on the dashboard).
    const nextTurn = dm.page.getByRole("button", { name: "NEXT TURN" }).first();
    if ((await nextTurn.count()) > 0 && (await nextTurn.isEnabled())) {
      const before = events.length;
      await nextTurn.click();
      await expectCapturedCount(player.page, "initiative:updated", before + 1);
    }
  });
});
