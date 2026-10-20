export interface ChosenMenuOptionDisplay {
  name: string;
  group_name?: string;
  group_kind?: "variant" | "addon";
  qty?: number;
}

export function formatChosenMenuOption(option: ChosenMenuOptionDisplay): string {
  const kind = option.group_kind === "variant" ? "Variant" : option.group_kind === "addon" ? "Add-on" : null;
  const group = option.group_name
    ? `${option.group_name}${kind ? ` (${kind})` : ""}: `
    : "";
  return `${group}${option.name}${option.qty && option.qty > 1 ? ` × ${option.qty}` : ""}`;
}
