import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicTemplateSummary } from "@/lib/invitation-template-public-catalog";
import { AnonymousInvitationBuilderClient } from "./AnonymousInvitationBuilderClient";

type Params = { templateId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { templateId } = await params;
  const summary = getPublicTemplateSummary(templateId);
  return {
    title: summary ? `Create — ${summary.name}` : "Template not found",
    // An anonymous work-in-progress draft is never a page worth indexing.
    robots: { index: false, follow: false },
  };
}

export default async function InvitationTemplateCreatePage({ params }: { params: Promise<Params> }) {
  const { templateId } = await params;
  const summary = getPublicTemplateSummary(templateId);
  if (!summary) notFound();

  return <AnonymousInvitationBuilderClient templateId={summary.id} />;
}
