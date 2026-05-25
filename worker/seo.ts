export type ManifestLike = {
  generatedAt?: string;
  availableDateRange?: [string, string];
  filterOptions?: { towns?: string[] };
};

export type BlockSummaryLike = {
  addressKey: string;
  town: string;
  displayName: string | null;
  medianPrice: number;
  transactionCount: number;
  availableDateRange: [string, string];
  floorAreaRange: [number, number];
};

const QUERY_VERSION = "2";

function sanitizeParam(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function canonicalUrlForRoute(
  origin: string,
  town?: string | null,
  selected?: string | null,
  compareTown?: string | null,
): string {
  const cleanTown = sanitizeParam(town);
  const cleanSelected = sanitizeParam(selected);
  const cleanCompareTown = sanitizeParam(compareTown);
  const url = new URL("/", origin);

  if (cleanTown && cleanSelected) {
    url.searchParams.set("town", cleanTown);
    url.searchParams.set("selected", cleanSelected);
  } else if (cleanTown && cleanCompareTown && cleanCompareTown.toUpperCase() !== cleanTown.toUpperCase()) {
    url.searchParams.set("town", cleanTown);
    url.searchParams.set("compareTown", cleanCompareTown);
  } else if (cleanTown) {
    url.searchParams.set("town", cleanTown);
  } else if (cleanSelected) {
    url.searchParams.set("selected", cleanSelected);
  }

  if (url.searchParams.size > 0) {
    url.searchParams.set("v", QUERY_VERSION);
  }

  return url.toString();
}

export function serializeJsonLdForScript(jsonLd: unknown): string {
  return JSON.stringify(jsonLd).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

export function sitemapXml(urls: Array<{ loc: string; lastmod?: string }>): string {
  const entries = urls
    .map((entry) => {
      const lastmod = entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "";
      return `  <url><loc>${escapeXml(entry.loc)}</loc>${lastmod}</url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
}

export function buildSeoMeta(input: {
  town?: string | null;
  block?: BlockSummaryLike | null;
  manifest?: ManifestLike | null;
}) {
  const range = input.block?.availableDateRange ?? input.manifest?.availableDateRange;
  const windowText = range && range[0] && range[1] ? `${range[0]} to ${range[1]}` : "latest available window";

  if (input.block) {
    const blockName = input.block.displayName ?? input.block.addressKey;
    const roundedMedian = Math.round(input.block.medianPrice);

    return {
      title: `${blockName} — resale history & median price`,
      description: `${input.block.transactionCount} resale transactions from ${windowText}; median price S$${roundedMedian.toLocaleString("en-SG")}.`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Residence",
        name: blockName,
        address: {
          "@type": "PostalAddress",
          streetAddress: blockName,
          addressCountry: "SG",
        },
        offers: {
          "@type": "Offer",
          priceCurrency: "SGD",
          price: roundedMedian,
        },
      },
    };
  }

  if (input.town) {
    return {
      title: `${input.town} HDB resale prices`,
      description: `Resale transaction data for ${input.town} from ${windowText}.`,
      jsonLd: {
        "@context": "https://schema.org",
        "@type": "Dataset",
        name: `${input.town} HDB resale dataset`,
        spatialCoverage: { "@type": "Place", name: "Singapore" },
      },
    };
  }

  return null;
}
