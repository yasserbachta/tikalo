// Feature flags. Each flag is a per-agency DB switch (gradual rollout from the
// admin agency page) behind a global env kill switch that turns the feature
// off for everyone without a deploy of code changes.

/**
 * Maritime PDF editor: agents edit text directly on the carrier PDF instead of
 * the automatic price overlay. Kill switch: MARITIME_PDF_EDITOR=off.
 */
export function isMaritimeEditorEnabled(
  agency: { maritimeEditorEnabled?: boolean | null } | null | undefined,
): boolean {
  if (process.env.MARITIME_PDF_EDITOR?.trim().toLowerCase() === "off") {
    return false;
  }
  return agency?.maritimeEditorEnabled === true;
}
