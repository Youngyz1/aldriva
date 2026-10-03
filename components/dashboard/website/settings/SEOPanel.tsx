"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormSection, Field } from "@/components/layout/FormSection";

export function SEOPanel({
  siteTitle,
  seoTitle,
  setSeoTitle,
  seoDescription,
  setSeoDescription,
  seoOgImage,
  setSeoOgImage,
}: {
  siteTitle: string;
  seoTitle: string;
  setSeoTitle: (v: string) => void;
  seoDescription: string;
  setSeoDescription: (v: string) => void;
  seoOgImage: string;
  setSeoOgImage: (v: string) => void;
}) {
  return (
    <FormSection title="Search Engine Optimization (SEO)" description="Customize how your website appears in Google and social shares.">
      <Field label="SEO Page Title" htmlFor="seoTitle">
        <Input id="seoTitle" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder={`${siteTitle} | Official Website`} />
      </Field>
      <Field label="SEO Meta Description" htmlFor="seoDesc">
        <Textarea id="seoDesc" rows={3} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} placeholder="150–160 chars recommended..." />
      </Field>
      <Field label="Social Share Image (OG Image URL)" htmlFor="seoOg">
        <Input id="seoOg" type="url" value={seoOgImage} onChange={(e) => setSeoOgImage(e.target.value)} placeholder="https://..." />
      </Field>
    </FormSection>
  );
}
