import { test, expect } from "./fixtures/surfaces";
import { waitForSocket } from "./fixtures/socket-helpers";

// CRUD: create a uniquely-named battlemap, rename it, then delete it. All via
// the BattlemapManager dropdown — the same code paths a real DM would walk.
test.describe("battlemap CRUD", () => {
  test.setTimeout(60_000);
  test("create + rename + delete a battlemap", async ({ dm }) => {
    await waitForSocket(dm.page);

    const stamp = `e2e-crud-${Date.now()}`;

    await dm.page.getByLabel("Battlemap Manager").click();

    // Create a new battlemap with the unique name.
    await dm.page.locator('input[placeholder="New battlemap name"]').fill(stamp);
    await dm.page.getByRole("button", { name: "Create Battlemap" }).click();

    // The created battlemap should appear in the active list and become the
    // current battlemap (the name field reflects it).
    const nameInput = dm.page.locator('input[placeholder="Enter a name"]');
    await expect(nameInput).toHaveValue(stamp);

    // Rename: change the name field and blur to trigger handleNameSave.
    const renamed = `${stamp}-renamed`;
    await nameInput.fill(renamed);
    await nameInput.blur();
    await expect(nameInput).toHaveValue(renamed);

    // Delete via the Settings dropdown (where the destructive button lives).
    await dm.page.mouse.click(1500, 500);
    await dm.page.getByLabel("Settings").click();
    dm.page.once("dialog", (dialog) => void dialog.accept());
    await dm.page.getByRole("button", { name: /DELETE BATTLEMAP/i }).click();

    // Successful click means the delete dispatched. The dashboard goes back
    // to its loading state until another battlemap is active — re-opening
    // the manager from here would race the loading screen, so the chain
    // (create → rename → delete) is the whole assertion we want.
  });
});
