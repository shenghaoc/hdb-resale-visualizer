import { DOCS_INDEX_SLUG } from "./docsRouter";
import indexContent from "./content/index.md?raw";
import gettingStartedContent from "./content/getting-started.md?raw";
import priceComparisonsContent from "./content/understanding-price-comparisons.md?raw";
import filtersAndMapContent from "./content/filters-and-map.md?raw";
import shortlistingContent from "./content/shortlisting.md?raw";
import faqContent from "./content/faq.md?raw";
import troubleshootingContent from "./content/troubleshooting.md?raw";

export type DocsSection = {
  slug: string;
  /** Short label used in the navigation sidebar and search results. */
  title: string;
  content: string;
};

export const DOCS_SECTIONS: DocsSection[] = [
  { slug: DOCS_INDEX_SLUG, title: "Overview", content: indexContent },
  { slug: "getting-started", title: "Getting started", content: gettingStartedContent },
  {
    slug: "understanding-price-comparisons",
    title: "Price comparisons",
    content: priceComparisonsContent,
  },
  { slug: "filters-and-map", title: "Filters & map", content: filtersAndMapContent },
  { slug: "shortlisting", title: "Shortlisting", content: shortlistingContent },
  { slug: "faq", title: "FAQ", content: faqContent },
  { slug: "troubleshooting", title: "Troubleshooting", content: troubleshootingContent },
];

export function getDocsSection(slug: string): DocsSection {
  return DOCS_SECTIONS.find((section) => section.slug === slug) ?? DOCS_SECTIONS[0];
}

export type DocsSearchEntry = {
  slug: string;
  sectionTitle: string;
  /** The `##` heading the text appears under, or the page title for the intro. */
  heading: string;
  body: string;
};

/**
 * Splits each guide page into `##`-heading chunks so search can land users on
 * the page that actually answers their query, with a meaningful snippet.
 */
export function buildDocsSearchEntries(sections: DocsSection[] = DOCS_SECTIONS): DocsSearchEntry[] {
  const entries: DocsSearchEntry[] = [];
  for (const section of sections) {
    const lines = section.content.split("\n");
    let heading = section.title;
    let buffer: string[] = [];

    const flush = () => {
      const body = buffer
        .join(" ")
        .replace(/[#>*_`|[\]]|\(\/?[\w/.:-]*\)/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (body !== "") {
        entries.push({ slug: section.slug, sectionTitle: section.title, heading, body });
      }
      buffer = [];
    };

    for (const line of lines) {
      const headingMatch = /^##\s+(.+)$/.exec(line);
      if (headingMatch) {
        flush();
        heading = headingMatch[1].trim();
        continue;
      }
      if (/^#\s/.test(line)) continue;
      buffer.push(line);
    }
    flush();
  }
  return entries;
}
