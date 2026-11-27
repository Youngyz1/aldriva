import type { Metadata } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { isValidLocale, getLocaleFromAcceptLanguage, type Locale } from "@/i18n/routing";
import { PUBLIC_TEMPLATE_LISTINGS } from "@/lib/public-template-directory";
import BrandMark from "@/components/BrandMark";
import { V2TemplateCardPreview } from "@/components/dashboard/website/v2/WebsiteV2TemplateGallery";
import { V2TemplateGalleryPreviewFrame } from "@/components/dashboard/website/v2/V2TemplateGalleryPreviewFrame";

export const metadata: Metadata = {
  title: "Website templates | Aldriva",
  description: "Browse Aldriva website templates and preview them before you create a site.",
};

export default async function PublicTemplatesPage() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value;
  const locale: Locale =
    cookieLocale && isValidLocale(cookieLocale)
      ? cookieLocale
      : getLocaleFromAcceptLanguage(headerStore.get("accept-language"));

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Minimal header: Navbar is excluded on /templates (and its previews),
          so this is the only way back to / or to /login from here. */}
      <header className="border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" aria-label="Aldriva home">
            <BrandMark className="[&>img]:h-8 [&>img]:max-w-[7rem]" />
          </Link>
          <Link href="/login" className="text-sm font-semibold text-zinc-700 hover:text-orange-600">
            {locale === "fr" ? "Se connecter" : "Log in"}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-bold text-zinc-900">Website templates</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
          {locale === "fr"
            ? "Prévisualisez un modèle avant de créer votre site — aucune connexion requise."
            : "Preview a template before you create your site — no login required."}
        </p>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          {PUBLIC_TEMPLATE_LISTINGS.map((template) => (
            <article key={template.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
              <Link href={template.previewHref} aria-label={`Preview ${template.name}`}>
                <V2TemplateGalleryPreviewFrame className="aspect-[16/10] h-auto">
                  <V2TemplateCardPreview templateId={template.id} businessName="Your business" businessLogo={null} />
                </V2TemplateGalleryPreviewFrame>
              </Link>
              <div className="p-5">
                <h2 className="text-base font-semibold text-zinc-900">{template.name}</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-600">{template.description[locale]}</p>
                <div className="mt-4 flex gap-2">
                  <Link
                    href={template.previewHref}
                    className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2 text-center text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    {locale === "fr" ? "Aperçu" : "Preview"}
                  </Link>
                  <Link
                    href={template.useTemplateHref}
                    className="flex-1 rounded-xl bg-zinc-950 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-zinc-800"
                  >
                    {locale === "fr" ? "Utiliser ce modèle" : "Use this template"}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
