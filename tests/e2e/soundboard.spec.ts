import { test, expect } from "./fixtures/surfaces";
import {
  captureSocketEvent,
  expectCapturedCount,
  readCapturedEvents,
  waitForSocket,
} from "./fixtures/socket-helpers";

interface SoundboardPlayedPayload {
  url: string;
  name?: string;
  loop?: boolean;
}

// Soundboard: DM in BROADCAST mode plays a clip → player receives
// soundboard:played. Toggling to DM-ONLY suppresses the broadcast — player
// sees no further events while we play again locally.
test.describe("soundboard — broadcast vs DM-only", () => {
  test("broadcast play reaches the player; DM-only play does not", async ({
    dm,
    player,
  }) => {
    await Promise.all([waitForSocket(dm.page), waitForSocket(player.page)]);
    await captureSocketEvent(player.page, "soundboard:played");

    // Add a clip via the SoundboardPanel's add-clip flow.
    await dm.page.getByRole("button", { name: /ADD CLIP/i }).click();
    await dm.page.locator('input[placeholder*="ambient" i]').fill("Test Clip");
    await dm.page
      .locator('input[placeholder*="mp3" i]')
      .fill("https://example.com/test.mp3");
    await dm.page.getByRole("button", { name: "SAVE" }).click();

    // Default mode is broadcast — verify the panel title says "Broadcast"
    // (case-insensitive, scoped to the soundboard panel).
    const panelTitle = dm.page
      .locator('[class*="parchment-heading"]')
      .filter({ hasText: /Soundboard/ })
      .first();
    await expect(panelTitle).toContainText(/Broadcast/i);

    // Click play on the new clip's row.
    await dm.page.locator('button[aria-label="Play"]').first().click();

    await expectCapturedCount(player.page, "soundboard:played", 1);
    const events = await readCapturedEvents<SoundboardPlayedPayload>(
      player.page,
      "soundboard:played",
    );
    expect(events[events.length - 1]?.url).toContain("example.com/test.mp3");

    // Stop and toggle to DM-only.
    await dm.page.locator('button[aria-label="Pause"]').first().click();
    await dm.page.getByLabel("Toggle broadcast").click();
    await expect(panelTitle).toContainText(/DM only/i);

    const beforeCount = events.length;
    await dm.page.locator('button[aria-label="Play"]').first().click();

    // Give the system a moment; the player should NOT see more events.
    await dm.page.waitForTimeout(800);
    const after = await readCapturedEvents<SoundboardPlayedPayload>(
      player.page,
      "soundboard:played",
    );
    expect(after.length).toBe(beforeCount);

    // Tidy up — toggle back to broadcast, then stop, then remove the test clip.
    await dm.page.getByLabel("Toggle broadcast").click();
    await dm.page.locator('button[aria-label="Pause"]').first().click().catch(() => undefined);
    await dm.page.getByLabel("Remove clip").first().click();
  });
});
