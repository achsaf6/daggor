import type { Locator, Page } from "@playwright/test";

interface XY {
  x: number;
  y: number;
}

// Pointer-based drag. Use for canvas/SVG drag tools (spawn area, fog reveal).
// The dashboard's drag-to-draw tools listen for native pointerdown/pointermove/
// pointerup events, which page.mouse.* fires correctly.
export async function pointerDrag(
  page: Page,
  from: XY,
  to: XY,
  steps = 10,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps });
  await page.mouse.up();
}

// HTML5 drag-and-drop. Playwright's built-in dragTo uses mouse events which
// don't fire HTML5 dragstart/drop reliably. The TokenPicker uses
// draggable={true} + onDragStart, so we synthesize the events with a shared
// DataTransfer so the source -> target handshake works.
export async function htmlDragDrop(
  source: Locator,
  target: Locator,
  targetOffset?: XY,
): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();

  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("htmlDragDrop: could not measure source or target");
  }

  const targetX =
    targetBox.x + (targetOffset?.x ?? targetBox.width / 2);
  const targetY =
    targetBox.y + (targetOffset?.y ?? targetBox.height / 2);

  // Two-step: dispatch dragstart on source, then drop on target. The shared
  // DataTransfer object is held in a window-scoped slot so the target's
  // onDrop handler can read whatever onDragStart wrote.
  await source.evaluate((el) => {
    const dt = new DataTransfer();
    (
      window as unknown as { __daggorDragDataTransfer?: DataTransfer }
    ).__daggorDragDataTransfer = dt;
    const event = new DragEvent("dragstart", {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
    });
    el.dispatchEvent(event);
  });

  // dragover on target so any onDragOver preventDefault() runs (required to
  // make drop fire in HTML5 drag spec).
  await target.evaluate(
    (el, { x, y }) => {
      const dt = (
        window as unknown as { __daggorDragDataTransfer?: DataTransfer }
      ).__daggorDragDataTransfer;
      if (!dt) return;
      const event = new DragEvent("dragover", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: x,
        clientY: y,
      });
      el.dispatchEvent(event);
    },
    { x: targetX, y: targetY },
  );

  await target.evaluate(
    (el, { x, y }) => {
      const dt = (
        window as unknown as { __daggorDragDataTransfer?: DataTransfer }
      ).__daggorDragDataTransfer;
      if (!dt) return;
      const event = new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: dt,
        clientX: x,
        clientY: y,
      });
      el.dispatchEvent(event);
    },
    { x: targetX, y: targetY },
  );

  await source.evaluate((el) => {
    const dt = (
      window as unknown as { __daggorDragDataTransfer?: DataTransfer }
    ).__daggorDragDataTransfer;
    if (!dt) return;
    const event = new DragEvent("dragend", {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
    });
    el.dispatchEvent(event);
  });
}

// Long-press on a locator. Used for the TokenPicker's color → editor flow.
export async function longPress(
  locator: Locator,
  durationMs = 700,
): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("longPress: could not measure target");
  const page = locator.page();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
}
