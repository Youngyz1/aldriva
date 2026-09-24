/**
 * lib/business-taxonomy.ts
 * Code-owned authoritative taxonomy: Industry → Category → Business Type → Capabilities
 * Phase 3 foundation — single source for Business List, Website, Dashboard.
 * No DB tables for taxonomy; businesses.industry/category/business_type remain text with code validation.
 */

export const INDUSTRIES = [
  "Food & Beverage",
  "Accommodation & Hospitality",
  "Retail & Shopping",
  "Professional Services",
  "Home & Property Services",
  "Beauty & Wellness",
  "Health & Medical",
  "Automotive & Transportation",
  "Travel & Tourism",
  "Education & Training",
  "Construction & Trades",
  "Real Estate",
  "Creative & Media",
  "Events & Entertainment",
  "Technology & Digital",
  "Finance & Business Services",
  "Production & Manufacturing",
  "Nonprofit & Community",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

export const CATEGORIES_BY_INDUSTRY: Record<Industry, readonly string[]> = {
  "Food & Beverage": ["Restaurant", "Café", "Bar & Pub", "Bakery", "Food Production", "Catering"],
  "Accommodation & Hospitality": ["Hotel", "Guest House", "Rental Property", "Resort"],
  "Retail & Shopping": ["Fashion & Apparel", "Supermarket & Grocery", "Convenience Store", "Specialty Retail", "E-commerce"],
  "Professional Services": ["Legal", "Accounting & Finance", "Consulting", "Marketing & Agency", "Real Estate Agency"],
  "Home & Property Services": ["Cleaning", "Maintenance & Repair", "Construction & Trades", "Real Estate Services", "Gardening"],
  "Beauty & Wellness": ["Salon & Barbershop", "Spa & Massage", "Fitness & Gym", "Wellness"],
  "Health & Medical": ["Clinic", "Dental", "Pharmacy", "Wellness Center"],
  "Automotive & Transportation": ["Vehicle Rental", "Auto Repair & Sales", "Transport & Logistics"],
  "Travel & Tourism": ["Travel Agency", "Tour Operator"],
  "Education & Training": ["School", "Training Center", "Tutoring"],
  "Creative & Media": ["Photography", "Design & Agency", "Media Production", "Music & Entertainment"],
  "Events & Entertainment": ["Event Planning", "Venue", "Nightlife"],
  "Technology & Digital": ["Software Development", "IT Services", "Digital Agency", "Cloud Services"],
  "Finance & Business Services": ["Accounting", "Consulting", "Co-working"],
  "Real Estate": ["Agency", "Property Management"],
  "Construction & Trades": ["General Construction", "Specialized Trades"],
  "Production & Manufacturing": ["Manufacturing", "Agriculture"],
  "Nonprofit & Community": ["Charity", "Association", "Religious", "Community Center"],
  "Other": ["Other"],
};

export const BUSINESS_TYPES_BY_CATEGORY: Record<string, readonly string[]> = {
  Restaurant: ["Full-Service Restaurant", "Fast Food / Quick Service", "Specialty Restaurant", "Fine Dining"],
  "Café": ["Coffee Shop", "Bakery Café", "Juice & Smoothie Bar"],
  "Bar & Pub": ["Bar", "Pub", "Wine Bar"],
  Bakery: ["Bakery", "Pastry Shop"],
  "Food Production": ["Food Manufacturer", "Caterer"],
  Catering: ["Catering Service"],
  Hotel: ["Boutique Hotel", "Budget Hotel", "Luxury Hotel", "Business Hotel"],
  "Guest House": ["Guest House", "Bed & Breakfast"],
  "Rental Property": ["Vacation Rental", "Holiday Home"],
  Resort: ["Resort", "Lodge"],
  "Fashion & Apparel": ["Boutique", "Streetwear Store", "Fashion Retailer"],
  "Supermarket & Grocery": ["Supermarket", "Grocery Store", "Hypermarket"],
  "Convenience Store": ["Convenience Store"],
  "Specialty Retail": ["Florist", "Bookstore", "Electronics Store", "Gift Shop"],
  "E-commerce": ["Online Store"],
  Legal: ["Law Firm", "Legal Consultancy"],
  "Accounting & Finance": ["Accounting Firm", "Bookkeeping Service", "Financial Advisory"],
  Consulting: ["Business Consulting", "Management Consulting"],
  "Marketing & Agency": ["Marketing Agency", "Advertising Agency", "Creative Agency"],
  "Real Estate Agency": ["Residential Agency", "Commercial Agency"],
  Cleaning: ["Residential Cleaning", "Commercial Cleaning", "Specialized Cleaning"],
  "Maintenance & Repair": ["Plumbing", "Electrical", "HVAC", "Handyman"],
  "Construction & Trades": ["General Contractor", "Renovation", "Specialized Trades"],
  "Real Estate Services": ["Property Management", "Real Estate Services"],
  Gardening: ["Landscaping", "Gardening Service"],
  "Salon & Barbershop": ["Hair Salon", "Barbershop", "Nail Salon", "Beauty Salon"],
  "Spa & Massage": ["Day Spa", "Massage Center", "Wellness Spa"],
  "Fitness & Gym": ["Gym", "Yoga Studio", "Fitness Center", "CrossFit Box"],
  Wellness: ["Wellness Center", "Holistic Health"],
  Clinic: ["General Clinic", "Specialty Clinic", "Health Clinic"],
  Dental: ["Dental Practice", "Orthodontics"],
  Pharmacy: ["Pharmacy", "Drugstore"],
  "Wellness Center": ["Wellness Center"],
  "Vehicle Rental": ["Car Rental", "Motorcycle Rental", "Van Rental", "Truck Rental"],
  "Auto Repair & Sales": ["Garage", "Auto Repair Shop", "Car Dealership"],
  "Transport & Logistics": ["Logistics Company", "Transport Service", "Courier"],
  "Travel Agency": ["Leisure Travel", "Corporate Travel", "Travel Agency"],
  "Tour Operator": ["Tour Operator", "Sightseeing", "Adventure Tours"],
  School: ["Private School", "Language School"],
  "Training Center": ["Vocational Center", "Training Center"],
  Tutoring: ["Tutoring Center", "After-school"],
  Photography: ["Photography Studio", "Wedding Photography", "Commercial Photography", "Portrait Studio"],
  "Design & Agency": ["Design Studio", "Branding Agency", "Interior Design"],
  "Media Production": ["Video Production", "Content Studio"],
  "Music & Entertainment": ["Music Studio", "Entertainment Agency"],
  "Event Planning": ["Event Planning Service", "Wedding Planning"],
  Venue: ["Event Hall", "Conference Center", "Banquet Hall"],
  Nightlife: ["Nightclub", "Lounge"],
  "Software Development": ["SaaS Studio", "App Development", "Web Development"],
  "IT Services": ["IT Consultancy", "Managed IT", "Tech Support"],
  "Digital Agency": ["Digital Agency", "Web Agency"],
  Accounting: ["Accounting Service"],
  "Co-working": ["Co-working Space"],
  Agency: ["Agency"],
  "Property Management": ["Property Management"],
  "General Construction": ["General Construction"],
  "Specialized Trades": ["Electrician", "Plumber", "Carpenter"],
  Manufacturing: ["Manufacturing Plant"],
  Agriculture: ["Farm", "Agribusiness"],
  Charity: ["Nonprofit Organization", "Foundation"],
  Association: ["Association", "Club"],
  Religious: ["Church", "Mosque", "Temple", "Religious Organization"],
  "Community Center": ["Community Center"],
  Other: ["Custom Business"],
};

export const CAPABILITIES = [
  "PRODUCTS",
  "SERVICES",
  "ORDERS",
  "ONLINE_ORDERING",
  "BOOKINGS",
  "RESERVATIONS",
  "APPOINTMENTS",
  "DELIVERY",
  "PICKUP",
  "MENU",
  "TABLES",
  "INVENTORY",
  "POS",
  "CUSTOMERS",
  "STAFF",
  "BRANCHES",
  "PAYMENTS",
  "REVIEWS",
  "GALLERY",
  "PORTFOLIO",
  "VEHICLES",
  "VEHICLE_RENTAL",
  "ROOMS",
  "MAINTENANCE",
  "QUOTES",
  "INVOICING",
  "SUBSCRIPTIONS",
  "MEMBERSHIPS",
  "EVENTS",
  "TICKETING",
  "DONATIONS",
  "CONTENT",
  "BLOG",
  "MESSAGING",
  "MARKETING",
  "ANALYTICS",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITIES_BY_BUSINESS_TYPE: Record<string, readonly Capability[]> = {
  "Full-Service Restaurant": ["MENU", "ORDERS", "ONLINE_ORDERING", "DELIVERY", "PICKUP", "RESERVATIONS", "TABLES", "CUSTOMERS", "PAYMENTS", "REVIEWS", "GALLERY"],
  "Fast Food / Quick Service": ["MENU", "ORDERS", "PICKUP", "DELIVERY", "CUSTOMERS", "PAYMENTS", "REVIEWS"],
  "Specialty Restaurant": ["MENU", "ORDERS", "RESERVATIONS", "CUSTOMERS", "PAYMENTS", "REVIEWS"],
  "Fine Dining": ["MENU", "RESERVATIONS", "TABLES", "CUSTOMERS", "PAYMENTS", "REVIEWS", "GALLERY"],
  "Coffee Shop": ["MENU", "ORDERS", "PICKUP", "CUSTOMERS", "PAYMENTS", "REVIEWS"],
  "Bakery Café": ["PRODUCTS", "ORDERS", "PICKUP", "CUSTOMERS", "PAYMENTS"],
  "Boutique Hotel": ["ROOMS", "BOOKINGS", "CUSTOMERS", "PAYMENTS", "REVIEWS", "GALLERY", "MAINTENANCE"],
  "Supermarket": ["PRODUCTS", "ORDERS", "INVENTORY", "POS", "DELIVERY", "PICKUP", "CUSTOMERS", "STAFF", "BRANCHES", "PAYMENTS"],
  "Grocery Store": ["PRODUCTS", "ORDERS", "INVENTORY", "POS", "CUSTOMERS", "PAYMENTS"],
  Boutique: ["PRODUCTS", "ORDERS", "CUSTOMERS", "PAYMENTS", "REVIEWS", "GALLERY"],
  "Car Rental": ["VEHICLES", "VEHICLE_RENTAL", "RESERVATIONS", "CUSTOMERS", "PAYMENTS", "MAINTENANCE", "REVIEWS"],
  "Motorcycle Rental": ["VEHICLES", "VEHICLE_RENTAL", "RESERVATIONS", "CUSTOMERS", "PAYMENTS"],
  "Van Rental": ["VEHICLES", "VEHICLE_RENTAL", "RESERVATIONS", "CUSTOMERS", "PAYMENTS"],
  "Residential Cleaning": ["SERVICES", "BOOKINGS", "APPOINTMENTS", "CUSTOMERS", "STAFF", "QUOTES", "PAYMENTS", "REVIEWS"],
  "Commercial Cleaning": ["SERVICES", "BOOKINGS", "CUSTOMERS", "STAFF", "QUOTES", "PAYMENTS"],
  "Specialized Cleaning": ["SERVICES", "BOOKINGS", "QUOTES", "CUSTOMERS", "PAYMENTS"],
  "Photography Studio": ["SERVICES", "BOOKINGS", "APPOINTMENTS", "PORTFOLIO", "GALLERY", "CUSTOMERS", "PAYMENTS", "REVIEWS"],
  "Wedding Photography": ["SERVICES", "BOOKINGS", "PORTFOLIO", "CUSTOMERS", "PAYMENTS", "REVIEWS"],
  "Gym": ["MEMBERSHIPS", "SUBSCRIPTIONS", "BOOKINGS", "CUSTOMERS", "STAFF", "PAYMENTS", "REVIEWS"],
  "Yoga Studio": ["MEMBERSHIPS", "BOOKINGS", "CUSTOMERS", "PAYMENTS", "REVIEWS"],
  "Hair Salon": ["SERVICES", "APPOINTMENTS", "CUSTOMERS", "STAFF", "PAYMENTS", "REVIEWS", "GALLERY"],
  Barbershop: ["SERVICES", "APPOINTMENTS", "CUSTOMERS", "PAYMENTS", "REVIEWS"],
  "General Clinic": ["SERVICES", "APPOINTMENTS", "CUSTOMERS", "STAFF", "PAYMENTS", "REVIEWS"],
  "Dental Practice": ["SERVICES", "APPOINTMENTS", "CUSTOMERS", "PAYMENTS", "REVIEWS"],
  "Nonprofit Organization": ["DONATIONS", "EVENTS", "TICKETING", "CUSTOMERS", "REVIEWS", "GALLERY", "CONTENT"],
  "Custom Business": ["CONTENT", "GALLERY", "CUSTOMERS", "REVIEWS"],
};

const LEGACY_INDUSTRY_ALIASES: Record<string, Industry> = {
  "Software & Technology": "Technology & Digital",
  Finance: "Finance & Business Services",
  Technology: "Technology & Digital",
  Software: "Technology & Digital",
};

export function normalizeIndustry(v: string): Industry {
  const trimmed = v.trim();
  if ((INDUSTRIES as readonly string[]).includes(trimmed)) return trimmed as Industry;
  const lower = trimmed.toLowerCase();
  for (const [legacy, valid] of Object.entries(LEGACY_INDUSTRY_ALIASES)) {
    if (legacy.toLowerCase() === lower) return valid;
  }
  return trimmed as Industry;
}

export function isValidIndustry(v: unknown): v is Industry {
  if (typeof v !== "string") return false;
  const norm = normalizeIndustry(v);
  return (INDUSTRIES as readonly string[]).includes(norm);
}

export function getCategoriesForIndustry(industry: string): readonly string[] {
  const norm = normalizeIndustry(industry);
  return (CATEGORIES_BY_INDUSTRY as Record<string, readonly string[]>)[norm] ?? (CATEGORIES_BY_INDUSTRY as Record<string, readonly string[]>)[industry] ?? [];
}

export function isValidCategoryForIndustry(category: string, industry: string): boolean {
  const cats = getCategoriesForIndustry(industry);
  return cats.includes(category);
}

export function getBusinessTypesForCategory(category: string): readonly string[] {
  return BUSINESS_TYPES_BY_CATEGORY[category] ?? [];
}

export function isValidBusinessTypeForCategory(businessType: string, category: string): boolean {
  const types = getBusinessTypesForCategory(category);
  return types.includes(businessType);
}

export function isValidBusinessType(v: string): boolean {
  return Object.values(BUSINESS_TYPES_BY_CATEGORY).some((arr) => (arr as readonly string[]).includes(v));
}

export function getCapabilitiesForBusinessType(businessType: string): readonly Capability[] {
  return CAPABILITIES_BY_BUSINESS_TYPE[businessType] ?? CAPABILITIES_BY_BUSINESS_TYPE["Custom Business"] ?? ["CONTENT", "REVIEWS"];
}

export function getCapabilitiesForBusiness(industry: string, category: string, businessType: string): readonly Capability[] {
  if (businessType && isValidBusinessType(businessType)) return getCapabilitiesForBusinessType(businessType);
  if (category) {
    // fallback heuristics by category
    if (category === "Restaurant") return getCapabilitiesForBusinessType("Full-Service Restaurant");
    if (category === "Vehicle Rental") return getCapabilitiesForBusinessType("Car Rental");
    if (category === "Cleaning") return getCapabilitiesForBusinessType("Residential Cleaning");
    if (category === "Photography") return getCapabilitiesForBusinessType("Photography Studio");
  }
  return ["CONTENT", "GALLERY", "CUSTOMERS", "REVIEWS"];
}

export function getOtherCategory(industry: string): string {
  const cats = getCategoriesForIndustry(industry);
  return cats.includes("Other") ? "Other" : cats[0] ?? "Other";
}
