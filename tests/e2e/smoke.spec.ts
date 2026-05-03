import { test, expect } from "./fixtures/surfaces";
import { waitForSocket } from "./fixtures/socket-helpers";

test.describe("smoke — three surfaces load and connect", () => {
  test("dashboard renders the toolbar and connects a socket", async ({ dm }) => {
    const errors: string[] = [];
    dm.page.on("pageerror", (e) => errors.push(e.message));
    dm.page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await expect(dm.page.getByLabel("Settings")).toBeVisible();
    await expect(dm.page.getByLabel("Battlemap Manager")).toBeVisible();
    await expect(dm.page.getByLabel("Spawn area tool")).toBeVisible();
    await expect(dm.page.getByLabel("Fog of war")).toBeVisible();
    await expect(dm.page.getByLabel("Add Token")).toBeVisible();

    const id = await waitForSocket(dm.page);
    expect(id).toMatch(/.+/);

    expect(errors, `dashboard console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("display renders without the toolbar and connects a socket", async ({ display }) => {
    const errors: string[] = [];
    display.page.on("pageerror", (e) => errors.push(e.message));
    display.page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // The DM toolbar should NOT exist on /display.
    await expect(display.page.getByLabel("Settings")).toHaveCount(0);

    const id = await waitForSocket(display.page);
    expect(id).toMatch(/.+/);

    expect(errors, `display console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("player renders mobile shell and connects a socket", async ({ player }) => {
    const errors: string[] = [];
    player.page.on("pageerror", (e) => errors.push(e.message));
    player.page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // Mobile player should NOT see the DM toolbar.
    await expect(player.page.getByLabel("Settings")).toHaveCount(0);

    const id = await waitForSocket(player.page);
    expect(id).toMatch(/.+/);

    expect(errors, `player console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("all three surfaces can connect concurrently with distinct socket ids", async ({
    dm,
    display,
    player,
  }) => {
    const [dmId, displayId, playerId] = await Promise.all([
      waitForSocket(dm.page),
      waitForSocket(display.page),
      waitForSocket(player.page),
    ]);
    expect(new Set([dmId, displayId, playerId]).size).toBe(3);
  });
});
