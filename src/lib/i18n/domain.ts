import type { Locale } from "@/lib/i18n";

type DomainCategory = "town" | "flatType";

type DomainTranslations = Record<DomainCategory, Record<string, string>>;

type SearchAliases = Record<string, string>;

type DomainLocaleConfig = {
  translations: DomainTranslations;
  searchAliases: SearchAliases;
};

const EMPTY_TRANSLATIONS: DomainTranslations = {
  town: {},
  flatType: {},
};

const EMPTY_SEARCH_ALIASES: SearchAliases = {};

const DOMAIN_I18N_CONFIG: Record<Locale, DomainLocaleConfig> = {
  "en-SG": {
    translations: EMPTY_TRANSLATIONS,
    searchAliases: EMPTY_SEARCH_ALIASES,
  },
  "zh-SG": {
    translations: {
      town: {
        "ANG MO KIO": "宏茂桥",
        BEDOK: "勿洛",
        BISHAN: "碧山",
        "BUKIT BATOK": "武吉巴督",
        "BUKIT MERAH": "红山",
        "BUKIT PANJANG": "武吉班让",
        "BUKIT TIMAH": "武吉知马",
        "CENTRAL AREA": "中央区",
        "CHOA CHU KANG": "蔡厝港",
        CLEMENTI: "金文泰",
        GEYLANG: "芽笼",
        HOUGANG: "后港",
        "JURONG EAST": "裕廊东",
        "JURONG WEST": "裕廊西",
        "KALLANG/WHAMPOA": "加冷／黄埔",
        "LIM CHU KANG": "林厝港",
        "MARINE PARADE": "马林百列",
        "PASIR RIS": "白沙",
        PUNGGOL: "榜鹅",
        QUEENSTOWN: "女皇镇",
        SEMBAWANG: "三巴旺",
        SENGKANG: "盛港",
        SERANGOON: "实龙岗",
        TAMPINES: "淡滨尼",
        "TOA PAYOH": "大巴窑",
        WOODLANDS: "兀兰",
        YISHUN: "义顺",
      },
      flatType: {
        "1 ROOM": "一房式",
        "2 ROOM": "二房式",
        "3 ROOM": "三房式",
        "4 ROOM": "四房式",
        "5 ROOM": "五房式",
        EXECUTIVE: "行政式",
        "MULTI-GENERATION": "多代同堂",
      },
    },
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
};

function getTranslation(category: DomainCategory, value: string, locale: Locale): string | null {
  const normalized = value.trim().toUpperCase();
  const translation = DOMAIN_I18N_CONFIG[locale].translations[category][normalized];
  return translation ?? null;
}

function formatLocalizedLabel(locale: Locale, value: string, translation: string | null): string {
  if (!translation || locale === "en-SG") {
    return value;
  }

  return `${translation} · ${value}`;
}

export function localizeTownName(town: string, locale: Locale): string {
  return formatLocalizedLabel(locale, town, getTranslation("town", town, locale));
}

export function localizeFlatType(flatType: string, locale: Locale): string {
  return formatLocalizedLabel(locale, flatType, getTranslation("flatType", flatType, locale));
}

export function resolveMultilingualSearchAliases(input: string): string {
  let normalized = input;

  for (const localeConfig of Object.values(DOMAIN_I18N_CONFIG)) {
    for (const [source, target] of Object.entries(localeConfig.searchAliases)) {
      normalized = normalized.replaceAll(source, target);
    }
  }

  return normalized;
}
