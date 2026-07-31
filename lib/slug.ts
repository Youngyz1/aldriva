export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createSlug(value: string, fallback = "item") {
  return slugify(value) || fallback;
}

export function appendSlugSuffix(slug: string, suffix: string | number) {
  const cleanSuffix = slugify(String(suffix));
  return cleanSuffix ? `${createSlug(slug)}-${cleanSuffix}` : createSlug(slug);
}
