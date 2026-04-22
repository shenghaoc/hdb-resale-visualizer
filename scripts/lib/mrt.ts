type LineCode = "NSL" | "EWL" | "NEL" | "CCL" | "DTL" | "TEL" | "LRT";

const LINE_METADATA: Record<LineCode, { color: string; stations: Set<string> }> = {
  NSL: {
    color: "#d11141",
    stations: new Set([
      "JURONG EAST", "BUKIT BATOK", "BUKIT GOMBAK", "CHOA CHU KANG", "YEW TEE", "KRANJI", "MARSILING", "WOODLANDS",
      "ADMIRALTY", "SEMBAWANG", "CANBERRA", "YISHUN", "KHATIB", "YIO CHU KANG", "ANG MO KIO", "BISHAN", "BRADDELL",
      "TOA PAYOH", "NOVENA", "NEWTON", "ORCHARD", "SOMERSET", "DHOBY GHAUT", "CITY HALL", "RAFFLES PLACE", "MARINA BAY",
      "MARINA SOUTH PIER",
    ]),
  },
  EWL: {
    color: "#00a651",
    stations: new Set([
      "PASIR RIS", "TAMPINES", "SIMEI", "TANAH MERAH", "BEDOK", "KEMBANGAN", "EUNOS", "PAYA LEBAR", "ALJUNIED", "KALLANG",
      "LAVENDER", "BUGIS", "TANJONG PAGAR", "OUTRAM PARK", "TIONG BAHRU", "REDHILL", "QUEENSTOWN", "COMMONWEALTH", "BUONA VISTA",
      "DOVER", "CLEMENTI", "JURONG EAST", "CHINESE GARDEN", "LAKESIDE", "BOON LAY", "PIONEER", "JOO KOON", "GUL CIRCLE",
      "TUAS CRESCENT", "TUAS WEST ROAD", "TUAS LINK", "CHANGI AIRPORT", "EXPO",
    ]),
  },
  NEL: {
    color: "#9b26b6",
    stations: new Set([
      "HARBOURFRONT", "OUTRAM PARK", "CHINATOWN", "CLARKE QUAY", "DHOBY GHAUT", "LITTLE INDIA", "FARRER PARK",
      "BOON KENG", "POTONG PASIR", "WOODLEIGH", "SERANGOON", "KOVAN", "HOUGANG", "BUANGKOK", "SENGKANG", "PUNGGOL",
    ]),
  },
  CCL: {
    color: "#fca311",
    stations: new Set([
      "DHOBY GHAUT", "BRAS BASAH", "ESPLANADE", "PROMENADE", "NICOLL HIGHWAY", "STADIUM", "MOUNTBATTEN", "DAKOTA",
      "PAYA LEBAR", "MACPHERSON", "TAI SENG", "BARTLEY", "SERANGOON", "LORONG CHUAN", "BISHAN", "MARYMOUNT", "CALDECOTT",
      "BOTANIC GARDENS", "FARRER ROAD", "HOLLAND VILLAGE", "BUONA VISTA", "ONE-NORTH", "KENT RIDGE", "HAW PAR VILLA",
      "PASIR PANJANG", "LABRADOR PARK", "TELOK BLANGAH", "HARBOURFRONT", "BAYFRONT", "PROMENADE", "MARINA BAY",
    ]),
  },
  DTL: {
    color: "#00539b",
    stations: new Set([
      "BUKIT PANJANG", "CASHEW", "HILLVIEW", "BEAUTY WORLD", "KING ALBERT PARK", "SIXTH AVENUE", "TAN KAH KEE",
      "BOTANIC GARDENS", "STEVENS", "NEWTON", "LITTLE INDIA", "ROCHOR", "BUGIS", "PROMENADE", "BAYFRONT", "DOWNTOWN",
      "TELOK AYER", "CHINATOWN", "FORT CANNING", "BENCOOLEN", "JALAN BESAR", "BENDEMEER", "GEYLANG BAHRU", "MATTAR",
      "MACPHERSON", "UBI", "KAKI BUKIT", "BEDOK NORTH", "BEDOK RESERVOIR", "TAMPINES WEST", "TAMPINES", "TAMPINES EAST",
      "UPPER CHANGI", "EXPO",
    ]),
  },
  TEL: {
    color: "#764c24",
    stations: new Set([
      "WOODLANDS NORTH", "WOODLANDS", "WOODLANDS SOUTH", "SPRINGLEAF", "LENTOR", "MAYFLOWER", "BRIGHT HILL",
      "UPPER THOMSON", "CALDECOTT", "STEVENS", "NAPIER", "ORCHARD BOULEVARD", "ORCHARD", "GREAT WORLD",
      "HAVELOCK", "OUTRAM PARK", "MAXWELL", "SHENTON WAY", "MARINA BAY", "MARINA SOUTH", "GARDENS BY THE BAY", "TANJONG RHU",
      "KATONG PARK", "TANJONG KATONG", "MARINE PARADE", "MARINE TERRACE", "SIGLAP", "BAYSHORE", "SUNGEI BEDOK",
    ]),
  },
  LRT: {
    color: "#7c878e",
    stations: new Set(),
  },
};

const EXPLICIT_INTERCHANGES: Record<string, LineCode[]> = {
  "BISHAN": ["NSL", "CCL"],
  "BUKIT PANJANG": ["DTL", "LRT"],
  "BUONA VISTA": ["EWL", "CCL"],
  "CALDECOTT": ["CCL", "TEL"],
  "CHINATOWN": ["NEL", "DTL"],
  "CHOA CHU KANG": ["NSL", "LRT"],
  "DHOBY GHAUT": ["NSL", "NEL", "CCL"],
  "EXPO": ["EWL", "DTL"],
  "HARBOURFRONT": ["NEL", "CCL"],
  "JURONG EAST": ["NSL", "EWL"],
  "LITTLE INDIA": ["NEL", "DTL"],
  "MACPHERSON": ["CCL", "DTL"],
  "MARINA BAY": ["NSL", "CCL", "TEL"],
  "NEWTON": ["NSL", "DTL"],
  "OUTRAM PARK": ["EWL", "NEL", "TEL"],
  "PAYA LEBAR": ["EWL", "CCL"],
  "PROMENADE": ["CCL", "DTL"],
  "PUNGGOL": ["NEL", "LRT"],
  "SENGKANG": ["NEL", "LRT"],
  "SERANGOON": ["NEL", "CCL"],
  "STEVENS": ["DTL", "TEL"],
  "TAMPINES": ["EWL", "DTL"],
  "WOODLANDS": ["NSL", "TEL"],
};

function normalizeStationBaseName(stationName: string) {
  return stationName
    .toUpperCase()
    .replace(/\s+(MRT|LRT)\s+STATION$/, "")
    .trim();
}

export function getStationDetails(stationName: string): { color: string; lines: string[]; isInterchange: boolean } {
  const normalizedName = stationName.toUpperCase();
  const stationBaseName = normalizeStationBaseName(stationName);
  const matchedLines: LineCode[] = [];

  const lineCodes = Object.keys(LINE_METADATA) as LineCode[];
  for (const lineCode of lineCodes) {
    if (lineCode === "LRT") {
      if (normalizedName.endsWith("LRT STATION")) {
        matchedLines.push("LRT");
      }
      continue;
    }

    if (LINE_METADATA[lineCode].stations.has(stationBaseName)) {
      matchedLines.push(lineCode);
    }
  }

  const guaranteedLines = EXPLICIT_INTERCHANGES[stationBaseName];
  if (guaranteedLines) {
    for (const lineCode of guaranteedLines) {
      if (!matchedLines.includes(lineCode)) {
        matchedLines.push(lineCode);
      }
    }
  }

  if (matchedLines.length === 0) {
    if (/^CC\d+/u.test(stationBaseName)) {
      matchedLines.push("CCL");
    } else if (/^DT\d+/u.test(stationBaseName)) {
      matchedLines.push("DTL");
    }
  }

  const isInterchange = matchedLines.length > 1;
  const primaryLine = matchedLines[0];

  return {
    color: primaryLine ? LINE_METADATA[primaryLine].color : "#2563eb",
    lines: matchedLines,
    isInterchange,
  };
}
