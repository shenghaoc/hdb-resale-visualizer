/**
 * Platform-neutral multilingual search alias resolver.
 *
 * Pure static data + string transform. No React, no DOM, no browser globals.
 * Used by the shared filtering module to normalize CJK search input into
 * romanized tokens that match the English block/station/town data.
 */

type SearchAliases = Record<string, string>;

type LocaleAliasConfig = {
  searchAliases: SearchAliases;
  searchAliasPattern?: RegExp;
};

const ALIAS_CONFIGS: LocaleAliasConfig[] = [
  {
    searchAliasPattern: /[㐀-鿿]/,
    searchAliases: {
      宏茂桥: "ang mo kio",
      勿洛: "bedok",
      碧山: "bishan",
      武吉巴督: "bukit batok",
      红山: "bukit merah",
      武吉班让: "bukit panjang",
      武吉知马: "bukit timah",
      中央区: "central area",
      蔡厝港: "choa chu kang",
      金文泰: "clementi",
      芽笼: "geylang",
      后港: "hougang",
      裕廊东: "jurong east",
      裕廊西: "jurong west",
      加冷: "kallang",
      黄埔: "whampoa",
      林厝港: "lim chu kang",
      马林百列: "marine parade",
      白沙: "pasir ris",
      榜鹅: "punggol",
      女皇镇: "queenstown",
      三巴旺: "sembawang",
      盛港: "sengkang",
      实龙岗: "serangoon",
      淡滨尼: "tampines",
      大巴窑: "toa payoh",
      兀兰: "woodlands",
      义顺: "yishun",
      地铁: "mrt",
      捷运: "mrt",
      附近: "near",
      周边: "near",
    },
  },
];

/**
 * Resolve multilingual (e.g. Chinese) search aliases into their English
 * equivalents. The input string may contain CJK characters that map to
 * English town names, MRT keywords, or common search cues.
 *
 * Returns the input unchanged when no CJK characters are detected.
 */
export function resolveMultilingualSearchAliases(input: string): string {
  let normalized = input;

  for (const config of ALIAS_CONFIGS) {
    if (config.searchAliasPattern && !config.searchAliasPattern.test(normalized)) {
      continue;
    }

    const sortedAliases = Object.entries(config.searchAliases).sort(
      ([left], [right]) => right.length - left.length,
    );

    for (const [source, target] of sortedAliases) {
      normalized = normalized.replaceAll(source, ` ${target} `);
    }
  }

  return normalized;
}
