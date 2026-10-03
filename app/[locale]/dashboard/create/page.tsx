import Link from "next/link";
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { type Locale, isValidLocale, defaultLocale } from "@/i18n/routing";
import { CREATABLE_ENTITY_TYPES } from "@/lib/entity-registry";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function CreatePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale: Locale = isValidLocale(rawLocale) ? rawLocale : defaultLocale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Dashboard' });
  const tCommon = await getTranslations({ locale, namespace: 'Common' });
  return (
    <div className="space-y-6 max-w-3xl">
      <header className="pb-4 border-b border-zinc-200/80">
        <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{t('createNew')}</h1>
        <p className="mt-1 text-sm text-zinc-500">What would you like to create?</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {CREATABLE_ENTITY_TYPES.map((e) => {
          const Icon = e.icon;
          return (
            <Card key={e.kind} className="hover:shadow-sm transition">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-50 border">
                    <Icon className="h-5 w-5 text-zinc-700" />
                  </div>
                  <CardTitle className="text-sm font-bold">{e.label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-zinc-500 leading-relaxed">{e.description}</p>
                <Button asChild size="sm" className="w-full">
                  <Link href={e.createHref}>Create {e.label}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-zinc-500">
        You can create multiple organizers internally — you won&apos;t need to understand that to use the product.
      </p>
    </div>
  );
}
