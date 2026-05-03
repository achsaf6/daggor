"use client";

import { SurfaceShell } from "../components/SurfaceShell";

// DM control panel. Shows the SidebarToolbar and (in later phases) initiative,
// soundboard, player status tiles. Treated as DM-trusted on the server.
export default function Dashboard() {
  return <SurfaceShell surface="dashboard" />;
}
