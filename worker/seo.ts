export type ManifestLike = { generatedAt?: string; availableDateRange?: [string, string]; filterOptions?: { towns?: string[] } };
export type BlockSummaryLike = { addressKey: string; town: string; displayName: string | null; medianPrice: number; transactionCount: number; availableDateRange: [string, string]; floorAreaRange: [number, number] };

function buildQuery(params: Record<string, string>): string {
  const q = new URLSearchParams(params);
  q.set("v", "2");
  return `?${q.toString()}`;
}

export function canonicalUrlForRoute(origin: string, town?: string | null, selected?: string | null, compareTown?: string | null): string {
  if (town && selected) return `${origin}/${buildQuery({ town: town.trim(), selected: selected.trim() })}`;
  if (town && compareTown) return `${origin}/${buildQuery({ town: town.trim(), compareTown: compareTown.trim() })}`;
  if (town) return `${origin}/${buildQuery({ town: town.trim() })}`;
  return `${origin}/`;
}

export function sitemapXml(urls: Array<{ loc: string; lastmod?: string }>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((entry) => `  <url><loc>${entry.loc}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>`;
}

export function buildSeoMeta(input: { town?: string | null; block?: BlockSummaryLike | null; manifest?: ManifestLike | null }) {
  const range = input.block?.availableDateRange ?? input.manifest?.availableDateRange;
  const windowText = range ? `${range[0]} to ${range[1]}` : "latest available window";
  if (input.block) {
    const b = input.block;
    return { title: `${b.displayName ?? b.addressKey} — resale history & median price`, description: `${b.transactionCount} resale transactions from ${windowText}; median price S$${Math.round(b.medianPrice).toLocaleString("en-SG")}.`, jsonLd: { "@context": "https://schema.org", "@type": "Residence", name: b.displayName ?? b.addressKey, address: { "@type": "PostalAddress", streetAddress: b.displayName ?? b.addressKey, addressCountry: "SG" }, offers: { "@type": "Offer", priceCurrency: "SGD", price: Math.round(b.medianPrice) } } };
  }
  if (input.town) return { title: `${input.town} HDB resale prices`, description: `Resale transaction data for ${input.town} from ${windowText}.`, jsonLd: { "@context": "https://schema.org", "@type": "Dataset", name: `${input.town} HDB resale dataset`, spatialCoverage: { "@type": "Place", name: "Singapore" } } };
  return null;
}
