/**
 * app/admin/homepage/strings.ts
 * Single copy file for the Homepage CMS admin page (English).
 */

export const homepageStrings = {
  eyebrow: "CMS",
  title: "Homepage CMS",
  description:
    "Hero content · Featured items · Categories · Testimonials · Sponsors · SEO",

  tabs: {
    hero: "Homepage Hero",
    events_landing: "Events Landing",
    fundraisers_landing: "Fundraisers Landing",
    organizers_landing: "Organizations Landing",
    events: "Featured Events",
    fundraisers: "Featured Fundraisers",
    categories: "Categories",
    testimonials: "Testimonials",
    sponsors: "Sponsors",
    seo: "SEO",
  } as const,

  categoriesTitle: "Homepage Categories",
  testimonialsTitle: "Testimonials",
  sponsorsTitle: "Sponsors",

  addCategory: "Add Category",
  addTestimonial: "Add Testimonial",
  addSponsor: "Add Sponsor",
  editCategory: "Edit Category",
  editTestimonial: "Edit Testimonial",
  editSponsor: "Edit Sponsor",

  emptyCategories: "No categories. Run migration and add some.",
  emptyTestimonials: "No testimonials yet. Add some using the form.",
  emptySponsors: "No sponsors yet.",

  confirmDeleteCategory: "Delete this category?",
  confirmDeleteTestimonial: "Delete testimonial?",
  confirmDeleteSponsor: "Delete sponsor?",

  fieldName: "Name",
  fieldFullName: "Full name *",
  fieldRole: "Role / title",
  fieldPhotoUrl: "Photo URL",
  fieldQuote: "Quote *",
  fieldIconName: "Lucide icon name",
  fieldPosition: "Position",
  fieldSortPosition: "Sort position",
  fieldVisible: "Visible",
  fieldLogoUrl: "Logo URL",
  fieldWebsiteUrl: "Website URL",
  fieldSponsorName: "Sponsor name *",

  save: "Save",
  cancel: "Cancel",
  add: "Add",
  adding: "Adding…",
  saving: "Saving…",
  updated: "Updated.",
  deleted: "Deleted.",
  categoryAdded: "Category added.",
  categoryUpdated: "Category updated.",
  categoryDeleted: "Category deleted.",
  testimonialAdded: "Testimonial added.",
  sponsorAdded: "Sponsor added.",
  errorUpdating: "Error updating.",
  errorUpdatingCategory: "Error updating category.",
  errorDeleting: "Error deleting.",
  errorDeletingCategory: "Error deleting category.",
  failedToAdd: "Failed to add.",
} as const;
