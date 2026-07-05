/**
 * Re-export from shared product core. The canonical SearchProfile type
 * lives in `shared/product/search-profile.ts` so platform-neutral matching
 * logic can import it without reaching into `src/`.
 */
export type { SearchProfile, SearchProfilePatch } from "@shared/product/search-profile";
