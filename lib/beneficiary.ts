/**
 * Beneficiary — who a fundraiser actually helps, as distinct from the
 * Organizer who runs it.
 *
 * Deliberately independent of Organizer and of any user account. A
 * beneficiary is descriptive data owned by the fundraiser, which is what
 * makes the planned follow-ons (verified beneficiaries, beneficiary-owned
 * accounts, multiple beneficiaries per fundraiser, beneficiary updates and
 * thank-you messages, charity verification, analytics) additive rather than
 * a reshape: they attach to this object or move it into its own table keyed
 * by fundraiser, without invalidating anything stored today.
 *
 * Stored as a single JSONB column so per-type fields (relationship, species,
 * registration number) don't each need a database column.
 */

export const BENEFICIARY_TYPES = [
  "self",
  "person",
  "family",
  "organization",
  "charity",
  "community",
  "animal",
] as const;

export type BeneficiaryType = (typeof BENEFICIARY_TYPES)[number];

/**
 * Optional per-type fields. Kept in one union so the form, validation and
 * storage all agree on which keys are meaningful for a given type.
 */
export type BeneficiaryOptionalField =
  | "relationship"
  | "description"
  | "website"
  | "registrationNumber"
  | "species"
  | "photo";

export type Beneficiary = {
  type: BeneficiaryType;
  name: string;
  relationship?: string;
  description?: string;
  website?: string;
  registrationNumber?: string;
  species?: string;
  photo?: string;
};

export type BeneficiaryTypeConfig = {
  value: BeneficiaryType;
  /** Card label in the picker. */
  label: string;
  /** One-line card subtitle explaining when to choose it. */
  helper: string;
  /** Field label for `name` — differs meaningfully per type. */
  nameLabel: string;
  namePlaceholder: string;
  /** Optional fields revealed once this type is chosen. */
  fields: readonly BeneficiaryOptionalField[];
};

export const BENEFICIARY_TYPE_CONFIG: Record<BeneficiaryType, BeneficiaryTypeConfig> = {
  self: {
    value: "self",
    label: "Myself",
    helper: "You are raising money for your own cause",
    nameLabel: "Beneficiary name",
    namePlaceholder: "Your name",
    // No extra fields — name is taken from the organizer.
    fields: [],
  },
  person: {
    value: "person",
    label: "Another person",
    helper: "Someone you know personally",
    nameLabel: "Full name",
    namePlaceholder: "Mary Johnson",
    fields: ["relationship", "photo"],
  },
  family: {
    value: "family",
    label: "Family",
    helper: "A household or family unit",
    nameLabel: "Family name",
    namePlaceholder: "The Johnson Family",
    fields: ["description", "photo"],
  },
  organization: {
    value: "organization",
    label: "Organization",
    helper: "A group, school, shelter or similar",
    nameLabel: "Organization name",
    namePlaceholder: "Hope Children's Home",
    fields: ["website", "photo"],
  },
  charity: {
    value: "charity",
    label: "Registered charity",
    helper: "A formally registered nonprofit",
    nameLabel: "Registered charity name",
    namePlaceholder: "Red Cross",
    fields: ["registrationNumber", "website", "photo"],
  },
  community: {
    value: "community",
    label: "Community",
    helper: "A group of people affected by an event",
    nameLabel: "Community name",
    namePlaceholder: "Flood Victims of Texas",
    fields: ["description"],
  },
  animal: {
    value: "animal",
    label: "Animal",
    helper: "A pet, rescue or animal in need",
    nameLabel: "Animal name",
    namePlaceholder: "Lucky",
    fields: ["species", "photo"],
  },
};

/** Ordered list for rendering the picker. */
export const BENEFICIARY_TYPE_OPTIONS: readonly BeneficiaryTypeConfig[] =
  BENEFICIARY_TYPES.map((type) => BENEFICIARY_TYPE_CONFIG[type]);

/**
 * Relationship suggestions for the "another person" type. Offered as
 * datalist hints on a free-text field rather than a fixed dropdown: a closed
 * list would need an "Other" escape hatch anyway, and relationships people
 * fundraise across (carer, colleague, coach, in-law…) are far too varied to
 * enumerate honestly.
 */
export const RELATIONSHIP_SUGGESTIONS = [
  "Mother",
  "Father",
  "Sister",
  "Brother",
  "Daughter",
  "Son",
  "Friend",
  "Neighbor",
  "Student",
  "Colleague",
] as const;

/**
 * Groups beneficiary types into the "Helping" facets the product plans to
 * filter on. Defined now so the data model and query layer already support
 * it; no UI is wired to this yet, by design.
 */
export const HELPING_FILTERS = [
  { value: "people", label: "People", types: ["self", "person"] },
  { value: "families", label: "Families", types: ["family"] },
  { value: "organizations", label: "Organizations", types: ["organization"] },
  { value: "charities", label: "Charities", types: ["charity"] },
  { value: "communities", label: "Communities", types: ["community"] },
  { value: "animals", label: "Animals", types: ["animal"] },
] as const satisfies readonly {
  value: string;
  label: string;
  types: readonly BeneficiaryType[];
}[];

export type HelpingFilter = (typeof HELPING_FILTERS)[number]["value"];

/** Maps a Helping facet to the beneficiary_type values it covers. */
export function helpingFilterTypes(value: string): readonly BeneficiaryType[] {
  return HELPING_FILTERS.find((f) => f.value === value)?.types ?? [];
}

export function isBeneficiaryType(value: unknown): value is BeneficiaryType {
  return (
    typeof value === "string" &&
    (BENEFICIARY_TYPES as readonly string[]).includes(value)
  );
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export type BeneficiaryValidationResult =
  | { ok: true; value: Beneficiary }
  | { ok: false; error: string };

/**
 * Validates and normalises form input into a storable Beneficiary.
 *
 * Type and name are required (mirroring the DB CHECK constraint); everything
 * else is optional. Optional fields that aren't meaningful for the chosen
 * type are dropped rather than stored — so switching type mid-form can't
 * leave, say, a `species` behind on a charity. Empty strings are dropped too,
 * keeping stored JSON free of `""` noise that would later read as "present".
 */
export function validateBeneficiary(input: {
  type?: unknown;
  name?: unknown;
  relationship?: unknown;
  description?: unknown;
  website?: unknown;
  registrationNumber?: unknown;
  species?: unknown;
  photo?: unknown;
}): BeneficiaryValidationResult {
  if (!isBeneficiaryType(input.type)) {
    return { ok: false, error: "Choose who you are fundraising for." };
  }

  const name = cleanString(input.name);
  if (!name) {
    const { nameLabel } = BENEFICIARY_TYPE_CONFIG[input.type];
    return { ok: false, error: `${nameLabel} is required.` };
  }

  const allowed = BENEFICIARY_TYPE_CONFIG[input.type].fields;
  const value: Beneficiary = { type: input.type, name };

  if (allowed.includes("relationship")) {
    const v = cleanString(input.relationship);
    if (v) value.relationship = v;
  }
  if (allowed.includes("description")) {
    const v = cleanString(input.description);
    if (v) value.description = v;
  }
  if (allowed.includes("website")) {
    const v = cleanString(input.website);
    if (v) value.website = v;
  }
  if (allowed.includes("registrationNumber")) {
    const v = cleanString(input.registrationNumber);
    if (v) value.registrationNumber = v;
  }
  if (allowed.includes("species")) {
    const v = cleanString(input.species);
    if (v) value.species = v;
  }
  if (allowed.includes("photo")) {
    const v = cleanString(input.photo);
    if (v) value.photo = v;
  }

  return { ok: true, value };
}

/**
 * Reads whatever is stored on a fundraiser row into a usable Beneficiary.
 *
 * Tolerates the pre-migration world (column absent → `undefined`) and legacy
 * rows (column present but null) by falling back to a self-beneficiary named
 * after the organizer — the same shape migration_50 backfills — so display
 * code never has to special-case "no beneficiary yet".
 *
 * Returns null only when there is genuinely nothing to show, letting callers
 * omit the line entirely rather than render a placeholder.
 */
export function resolveBeneficiary(
  raw: unknown,
  organizerName?: string | null
): Beneficiary | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    const name = cleanString(record.name);
    if (isBeneficiaryType(record.type) && name) {
      return {
        type: record.type,
        name,
        relationship: cleanString(record.relationship),
        description: cleanString(record.description),
        website: cleanString(record.website),
        registrationNumber: cleanString(record.registrationNumber),
        species: cleanString(record.species),
        photo: cleanString(record.photo),
      };
    }
  }

  const fallbackName = cleanString(organizerName);
  if (!fallbackName) return null;
  return { type: "self", name: fallbackName };
}

/**
 * The "for …" phrase shown beneath a fundraiser title.
 *
 * Self-beneficiary reads "for themselves" rather than the spec's literal
 * "for Himself" — the platform never captures the beneficiary's gender, and
 * inferring it from a name would misgender real people. "Themselves" conveys
 * the same thing without guessing.
 */
export function beneficiaryForLabel(beneficiary: Beneficiary): string {
  return beneficiary.type === "self" ? "themselves" : beneficiary.name;
}

/** Human label for a type, e.g. for badges. */
export function beneficiaryTypeLabel(type: BeneficiaryType): string {
  return BENEFICIARY_TYPE_CONFIG[type].label;
}
