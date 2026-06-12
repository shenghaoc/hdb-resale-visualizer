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
  if (!/[<>&'"]/.test(value)) return value;
  return value.replace(/[<>&'"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&apos;";
      default:
        return char;
    }
  });
}

function encodeParam(value: string): string {
  return encodeURIComponent(value);
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

  if (cleanTown && cleanSelected) {
    return `${origin}/?town=${encodeParam(cleanTown)}&selected=${encodeParam(cleanSelected)}&v=${QUERY_VERSION}`;
  }
  if (cleanTown && cleanCompareTown && cleanCompareTown.toUpperCase() !== cleanTown.toUpperCase()) {
    return `${origin}/?town=${encodeParam(cleanTown)}&compareTown=${encodeParam(cleanCompareTown)}&v=${QUERY_VERSION}`;
  }
  if (cleanTown) {
    return `${origin}/?town=${encodeParam(cleanTown)}&v=${QUERY_VERSION}`;
  }
  if (cleanSelected) {
    return `${origin}/?selected=${encodeParam(cleanSelected)}&v=${QUERY_VERSION}`;
  }

  return `${origin}/`;
}

export function serializeJsonLdForScript(jsonLd: unknown): string {
  return JSON.stringify(jsonLd).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

export function sitemapXml(urls: Array<{ loc: string; lastmod?: string }>): string {
  const entries = urls
    .map((entry) => {
      const lastmod = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : "";
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
  const windowText =
    range && range[0] && range[1] ? `${range[0]} to ${range[1]}` : "latest available window";

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
