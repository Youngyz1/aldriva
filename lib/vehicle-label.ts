/** "Toyota" + "Toyota Camry" -> "Toyota Camry" (no repeated make). */
export function vehicleLabel(make?: string | null, model?: string | null): string {
  const m = (make ?? "").trim();
  const d = (model ?? "").trim();
  if (!m) return d;
  if (!d) return m;
  return d.toLowerCase().startsWith(m.toLowerCase()) ? d : `${m} ${d}`;
}
