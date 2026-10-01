import { requireAdmin } from "@/lib/auth";
import SettingsClient from "./SettingsClient";

export default async function AdminSettingsPage() {
  // Explicit gate (F-10): do not rely solely on the layout header shortcut.
  await requireAdmin();
  return <SettingsClient />;
}
