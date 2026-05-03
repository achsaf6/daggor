"use client";

import { SurfaceShell } from "../components/SurfaceShell";

// Projector / TV-table view. Same battlemap rendering as the dashboard but
// without the toolbar, drag-to-place, or square-tool affordances; the GM
// drags this window to a second display.
export default function Display() {
  return <SurfaceShell surface="display" />;
}
