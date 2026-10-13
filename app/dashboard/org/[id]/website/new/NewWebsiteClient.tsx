import { PageHeader } from "@/components/layout/PageHeader";
import { WebsiteV2TemplateGallery } from "@/components/dashboard/website/v2/WebsiteV2TemplateGallery";
import type { WebsiteCategory } from "@/lib/website-category";

interface NewWebsiteClientProps {
  orgId: string;
  orgName: string;
  initialCategory: WebsiteCategory;
  canCreate: boolean;
}

/** Server wrapper; interactive category and create behavior lives in the v2 gallery. */
export default function NewWebsiteClient({
  orgId,
  orgName,
  initialCategory,
  canCreate,
}: NewWebsiteClientProps) {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <PageHeader
        eyebrow="Create Website"
        title={`Choose a template for ${orgName}`}
        description="Start with a finished design. You can edit its content in the website builder."
      />
      <WebsiteV2TemplateGallery
        organizerId={orgId}
        initialCategory={initialCategory}
        canCreate={canCreate}
      />
    </div>
  );
}
