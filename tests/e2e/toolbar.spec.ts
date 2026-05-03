import { test, expect } from "./fixtures/surfaces";

// Toolbar styling smoke: open every popover, confirm the Expedition 33
// parchment vocabulary is in place (parchment-panel + parchment-heading),
// and the long-press editor opens after a 700ms hold on a token swatch.
test.describe("toolbar — parchment styling and dropdowns", () => {
  test("Settings dropdown is parchment-panel with a heading", async ({ dm }) => {
    await dm.page.getByLabel("Settings").click();
    const panel = dm.page.locator(".parchment-panel").filter({ hasText: /Settings/i }).first();
    await expect(panel).toBeVisible();
    await expect(panel.locator(".parchment-heading")).toBeVisible();
  });

  test("Battlemap Manager dropdown is parchment-panel with a heading", async ({ dm }) => {
    await dm.page.getByLabel("Battlemap Manager").click();
    const panel = dm.page
      .locator(".parchment-panel")
      .filter({ hasText: /Battlemap Manager/i })
      .first();
    await expect(panel).toBeVisible();
    await expect(panel.locator(".parchment-heading")).toBeVisible();
  });

  test("Token catalog opens with parchment styling", async ({ dm }) => {
    await dm.page.getByLabel("Add Token").click();
    const panel = dm.page
      .locator(".parchment-panel")
      .filter({ hasText: /Token Catalog/i })
      .first();
    await expect(panel).toBeVisible();
    await expect(panel.locator(".parchment-heading")).toBeVisible();
  });

  test("long-press on a token swatch opens the customize editor", async ({ dm }) => {
    await dm.page.getByLabel("Add Token").click();
    const swatch = dm.page.locator('button[data-token-color="#ef4444"]');
    await expect(swatch).toBeVisible();

    const box = await swatch.boundingBox();
    expect(box).not.toBeNull();
    if (!box) throw new Error("swatch missing boundingBox");

    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await dm.page.mouse.move(x, y);
    await dm.page.mouse.down();
    await dm.page.waitForTimeout(750);
    await dm.page.mouse.up();

    const editor = dm.page
      .locator(".parchment-panel")
      .filter({ hasText: /Customize Token/i })
      .first();
    await expect(editor).toBeVisible();
  });
});
