export function townToFilename(town: string): string {
  return town
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Slugs that do not round-trip via hyphen-to-space inversion alone.
 *  Uses a prototype-free object to prevent inherited property lookups. */
const TOWN_FILENAME_TO_CANONICAL: Record<string, string> = Object.assign(
  Object.create(null) as Record<string, string>,
  { "kallang-whampoa": "KALLANG/WHAMPOA" },
);

export function townFilenameToCanonical(filename: string): string {
  const slug = filename.replace(/\.json$/i, "").toLowerCase();
  return TOWN_FILENAME_TO_CANONICAL[slug] ?? slug.replace(/-/g, " ").toUpperCase();
}
