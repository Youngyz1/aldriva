export const DIETARY_TAGS = ["vegan", "vegetarian", "gluten_free", "halal", "kosher", "dairy_free", "nut_free"] as const;
export const MENU_ALLERGENS = ["nuts", "dairy", "gluten", "soy", "eggs", "shellfish"] as const;

export type MenuDietaryTag = typeof DIETARY_TAGS[number];
export type MenuAllergen = typeof MENU_ALLERGENS[number];
