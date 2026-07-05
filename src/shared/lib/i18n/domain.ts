import type { Locale } from "./types";

/**
 * Re-export from shared product core. The platform-neutral alias resolver
 * lives in `shared/product/search-aliases.ts` so the shared filtering
 * module can import it without reaching into `src/`.
 */
export { resolveMultilingualSearchAliases } from "@shared/product/search-aliases";

type DomainCategory = "town" | "flatType";

type DomainTranslations = Record<DomainCategory, Record<string, string>>;

type DomainLocaleConfig = {
  translations: DomainTranslations;
  budgetDivisor: number;
};

const EMPTY_TRANSLATIONS: DomainTranslations = {
  town: {},
  flatType: {},
};

const DOMAIN_I18N_CONFIG: Record<Locale, DomainLocaleConfig> = {
  "en-SG": {
    translations: EMPTY_TRANSLATIONS,
    budgetDivisor: 1000,
  },
  "zh-SG": {
    budgetDivisor: 10000,
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

export function getBudgetDivisor(locale: Locale): number {
  return DOMAIN_I18N_CONFIG[locale].budgetDivisor;
}
