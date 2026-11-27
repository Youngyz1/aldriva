/**
 * Templates that have a public, logged-out preview reachable from /templates.
 * Add an entry here (plus its own /templates/<id>/preview route) to list a
 * new template — nothing else on the /templates page is template-specific.
 */
export interface PublicTemplateListing {
  id: string;
  name: string;
  description: { en: string; fr: string };
  previewHref: string;
  useTemplateHref: string;
}

export const PUBLIC_TEMPLATE_LISTINGS: PublicTemplateListing[] = [
  {
    id: "showcase",
    name: "Showcase",
    description: {
      en: "A flexible storefront for restaurants, cafés, and shops — menu or product catalog, ordering, and promotions built in.",
      fr: "Une vitrine flexible pour restaurants, cafés et commerces — catalogue de menu ou de produits, commandes et promotions intégrées.",
    },
    previewHref: "/templates/showcase/preview",
    useTemplateHref: "/dashboard/website/new?templateId=showcase",
  },
];
