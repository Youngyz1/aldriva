import type { Locale } from "@/i18n/routing";
import type { PageActionHandler } from "@/lib/page-actions";
import type { PageBlocksLayout } from "@/lib/page-composition";
import type { InvitationBlocksLayout } from "@/lib/invitation-template-schema";
import { compilePageBlocksLayoutTheme } from "@/lib/invitation-page-layout";
import { parseBlock } from "@/lib/website-blocks";
import type { TemplateSourceMapEntry } from "@/lib/website-template-resolver";
import type { StorefrontOrderConfig } from "@/components/site/blocks/StorefrontBrowse";
import type { StorefrontReservationConfig } from "@/components/site/blocks/ReservationForm";
import { ActionPortalBlock, type ActionPortalType } from "@/components/invitation/blocks/ActionPortalBlock";
import { InvitationBlocksLayoutClient } from "@/components/invitation/blocks/InvitationBlocksLayoutClient";
import type { InvitationPageData } from "@/types/invitation-template";
import { BlockRenderer } from "@/components/site/blocks/BlockRenderer";

type WebsiteRendererContext = {
  tenantId?: string;
  isTeamMember?: boolean;
  editMode?: boolean;
  sourceMap?: Record<string, Record<string, TemplateSourceMapEntry>>;
  currency?: string;
  currencyLocale?: Locale;
  orderConfig?: StorefrontOrderConfig;
  reservationConfig?: StorefrontReservationConfig;
  siteSlug?: string;
  scopeInternalLinks?: boolean;
  accentColor?: string;
  onAction?: PageActionHandler;
  mode?: "preview" | "live";
};

type UniversalPageRendererProps =
  | {
      kind: "invitation";
      layout: InvitationBlocksLayout;
      data: InvitationPageData;
      templateId: string;
      onAction?: PageActionHandler;
      shared?: boolean;
      mode?: "preview" | "live" | "shared";
      isEditMode?: boolean;
    }
  | {
      kind: "website";
      layout: PageBlocksLayout;
      websiteContext?: WebsiteRendererContext;
    };

/** Shared canonical layout dispatcher for invitation microsites and business sites. */
export function UniversalPageRenderer(props: UniversalPageRendererProps) {
  if (props.kind === "invitation") {
    const mode = props.shared ? "shared" : (props.mode ?? "preview");
    const onAction = mode === "live" ? props.onAction : undefined;
    return <InvitationBlocksLayoutClient layout={props.layout} data={props.data} templateId={props.templateId} onAction={onAction} shared={props.shared} mode={mode} isEditMode={props.isEditMode} />;
  }

  const layout = compilePageBlocksLayoutTheme(props.layout);
  const context = props.websiteContext ?? {};
  const websiteAction = context.mode === "live" ? context.onAction : undefined;
  return (
    <div
      className={layout.global_theme.classes.page ?? ""}
      style={{ fontSize: `calc(100% * ${layout.global_theme.text_scale ?? 1.0})` }}
      data-page-mode={context.mode ?? "live"}
      data-edit-mode={context.editMode ? "true" : "false"}
    >
      {layout.layout_blocks.map((block) => {
        if (block.type === "action_portal") {
          if (block.content.actionType !== "BUSINESS_LEAD" && block.content.actionType !== "RSVP_SUBMISSION") return null;
          const actionType: ActionPortalType = block.content.actionType;
          return (
            <ActionPortalBlock
              key={block.id}
              actionType={actionType}
              title={typeof block.content.title === "string" ? block.content.title : undefined}
              description={typeof block.content.description === "string" ? block.content.description : undefined}
              theme={layout.global_theme}
              onAction={websiteAction}
            />
          );
        }

        const flattenedBlock = {
          ...block.content,
          id: block.id,
          type: block.type,
        };
        const parsedBlock = parseBlock(flattenedBlock);
        if (!parsedBlock) return null;
        const blockWithStableId = { ...parsedBlock, id: block.id };
        return (
          <BlockRenderer
            key={block.id}
            block={blockWithStableId}
            tenantId={context.tenantId}
            isTeamMember={context.isTeamMember}
            editMode={context.editMode}
            sourceMap={context.sourceMap}
            currency={context.currency}
            currencyLocale={context.currencyLocale}
            orderConfig={context.orderConfig}
            reservationConfig={context.reservationConfig}
            siteSlug={context.siteSlug}
            scopeInternalLinks={context.scopeInternalLinks}
            accentColor={context.accentColor}
          />
        );
      })}
    </div>
  );
}
