import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type Locale = "en-SG" | "zh-SG";

type Dictionary = Record<string, string>;

const dictionaries: Record<Locale, Dictionary> = {
  "en-SG": {
    "language.label": "Language",
    "language.en": "English",
    "language.zh": "中文",
    "app.title": "HDB Resale Visualizer",
    "app.loadingData": "Loading static data",
    "app.loadingDescription": "Preparing block summaries, detail files, and the market map.",
    "app.missingData": "Static data missing",
    "app.syncDataHint": "Run `bun run sync-data` to generate the static data artifacts for the app.",
    "app.mapTitle": "Singapore resale map",
    "app.lowerMedian": "Lower median",
    "app.higherMedian": "Higher median",
    "tab.filters": "Filters",
    "tab.results": "Results",
    "tab.saved": "Saved",
    "tab.map": "Map",
    "stats.dataThrough": "Data through {month}",
    "stats.txns": "{count} txns",
    "stats.built": "Built {date}",
    "results.median": "Median",
    "results.toMrt": "to MRT",
    "results.selected": "Selected",
    "results.saved": "Saved",
    "results.save": "Save",
    "results.medianResale": "Median resale",
    "results.nearestMrt": "Nearest MRT",
    "results.noMatch": "No match",
    "results.remainingLease": "Remaining lease",
    "results.latestMonth": "Latest month",
    "results.transactions": "{count} recent transactions",
    "results.prev": "Prev",
    "results.next": "Next",
    "results.shortlistCandidates": "Current shortlist candidates",
    "results.filteredBlocks": "Filtered blocks",
    "results.shown": "{count} shown",
    "results.sort": "Sort",
    "results.sort.lowestMedian": "Lowest median first",
    "results.sort.highestMedian": "Highest median first",
    "results.sort.longestLease": "Longest lease first",
    "results.sort.nearestMrt": "Nearest MRT first",
    "results.sort.recentActivity": "Most recent activity",
    "results.selectTown": "Select a town to browse blocks",
    "results.useTownFilter": "Use the Town filter on the left to narrow results.",
    "results.noMatchFilters": "No blocks match your current filters. Try broadening your search or resetting filters.",

  },
  "zh-SG": {
    "language.label": "语言",
    "language.en": "English",
    "language.zh": "中文",
    "app.title": "组屋转售可视化",
    "app.loadingData": "正在加载静态数据",
    "app.loadingDescription": "正在准备组屋摘要、详情文件与市场地图。",
    "app.missingData": "缺少静态数据",
    "app.syncDataHint": "运行 `bun run sync-data` 以生成应用所需的静态数据文件。",
    "app.mapTitle": "新加坡转售地图",
    "app.lowerMedian": "中位价较低",
    "app.higherMedian": "中位价较高",
    "tab.filters": "筛选",
    "tab.results": "结果",
    "tab.saved": "收藏",
    "tab.map": "地图",
    "stats.dataThrough": "数据截至 {month}",
    "stats.txns": "{count} 笔交易",
    "stats.built": "构建于 {date}",
    "results.median": "中位价",
    "results.toMrt": "到地铁",
    "results.selected": "已选中",
    "results.saved": "已收藏",
    "results.save": "收藏",
    "results.medianResale": "转售中位价",
    "results.nearestMrt": "最近地铁站",
    "results.noMatch": "暂无匹配",
    "results.remainingLease": "剩余租期",
    "results.latestMonth": "最新月份",
    "results.transactions": "近期交易 {count} 笔",
    "results.prev": "上一页",
    "results.next": "下一页",
    "results.shortlistCandidates": "当前候选比较",
    "results.filteredBlocks": "筛选后组屋",
    "results.shown": "显示 {count} 条",
    "results.sort": "排序",
    "results.sort.lowestMedian": "中位价从低到高",
    "results.sort.highestMedian": "中位价从高到低",
    "results.sort.longestLease": "租期最长优先",
    "results.sort.nearestMrt": "最近地铁优先",
    "results.sort.recentActivity": "最近交易优先",
    "results.selectTown": "请选择城镇查看组屋",
    "results.useTownFilter": "使用左侧城镇筛选缩小结果范围。",
    "results.noMatchFilters": "当前筛选无匹配组屋。请放宽条件或重置筛选。",

  },
};

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const LOCALE_STORAGE_KEY = "hdb-resale-locale";

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) {
    return template;
  }

  return Object.entries(vars).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === "undefined") {
      return "en-SG";
    }

    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "zh-SG" || saved === "en-SG") {
      return saved;
    }

    return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-SG" : "en-SG";
  });

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: (nextLocale) => {
      setLocale(nextLocale);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
      }
    },
    t: (key, vars) => {
      const text = dictionaries[locale][key] ?? dictionaries["en-SG"][key] ?? key;
      return interpolate(text, vars);
    },
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }

  return context;
}
