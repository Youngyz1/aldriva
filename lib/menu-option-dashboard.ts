export const MENU_OPTION_GROUP_LIMIT = 8;
export const MENU_OPTION_LIMIT = 20;

export interface MenuOptionGroupRules {
  kind: "variant" | "addon";
  is_required: boolean;
  min_select: number;
  max_select: number;
}

export function validateMenuOptionGroupRules(rules: MenuOptionGroupRules, optionCount: number): string | null {
  if (!Number.isInteger(rules.min_select) || rules.min_select < 0) return "Minimum selections must be at least 0";
  if (!Number.isInteger(rules.max_select) || rules.max_select < 1 || rules.max_select < rules.min_select || rules.max_select > MENU_OPTION_LIMIT) {
    return `Maximum selections must be between 1 and ${MENU_OPTION_LIMIT} and at least the minimum`;
  }
  if (rules.is_required && rules.min_select < 1) return "Required groups need a minimum of at least 1";
  if (rules.kind === "variant" && (!rules.is_required || rules.min_select !== 1 || rules.max_select !== 1)) {
    return "Variant groups must be required and allow exactly one selection";
  }
  if (optionCount > 0 && rules.max_select > optionCount) return `Maximum selections cannot exceed the ${optionCount} options in this group`;
  return null;
}

export function validateMenuItemGroupLimits(kinds: readonly string[], nextKind?: string): string | null {
  if (kinds.length >= MENU_OPTION_GROUP_LIMIT) return `A menu item can have at most ${MENU_OPTION_GROUP_LIMIT} option groups`;
  if (nextKind === "variant" && kinds.includes("variant")) return "A menu item can have at most one variant group";
  return null;
}

export function getMenuOptionTemplates(locale: "en" | "fr") {
  const french = locale === "fr";
  return [
    { id: "protein", name: french ? "Protéines" : "Protein", kind: "addon" as const, is_required: true, min_select: 1, max_select: 1, options: french ? ["Poulet", "Tofu", "Bœuf"] : ["Chicken", "Tofu", "Beef"] },
    { id: "sides", name: french ? "Accompagnements" : "Sides", kind: "addon" as const, is_required: false, min_select: 0, max_select: 3, options: french ? ["Riz", "Salade", "Légumes"] : ["Rice", "Salad", "Vegetables"] },
    { id: "drinks", name: french ? "Boissons" : "Drinks", kind: "addon" as const, is_required: false, min_select: 0, max_select: 1, options: french ? ["Eau", "Jus", "Soda"] : ["Water", "Juice", "Soda"] },
    { id: "spice", name: french ? "Niveau épicé" : "Spice level", kind: "addon" as const, is_required: false, min_select: 0, max_select: 1, options: french ? ["Doux", "Moyen", "Épicé"] : ["Mild", "Medium", "Hot"] },
    { id: "size", name: french ? "Taille" : "Size", kind: "variant" as const, is_required: true, min_select: 1, max_select: 1, options: french ? ["Petit", "Moyen", "Grand"] : ["Small", "Medium", "Large"] },
    { id: "extras", name: french ? "Suppléments / Garnitures" : "Extras / Toppings", kind: "addon" as const, is_required: false, min_select: 0, max_select: 5, options: french ? ["Avocat", "Fromage", "Sauce", "Oignons", "Piments"] : ["Avocado", "Cheese", "Sauce", "Onions", "Peppers"] },
  ];
}
