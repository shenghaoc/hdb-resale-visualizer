import { normalizeText } from "./pipeline";

export function makeSupermarketCacheKey(
  postalCode: string | undefined,
  address: string,
  name: string,
) {
  const cacheKeySuffix = (postalCode ?? normalizeText(address)) || normalizeText(name);
  return `supermarket:${cacheKeySuffix}`;
}
