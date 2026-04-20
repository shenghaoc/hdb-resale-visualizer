const LINE_COLORS: Record<string, { regex: RegExp; color: string; code: string }> = {
  NSL: { regex: /(JURONG EAST|BUKIT BATOK|BUKIT GOMBAK|CHOA CHU KANG|YEW TEE|KRANJI|MARSILING|WOODLANDS|ADMIRALTY|SEMBAWANG|CANBERRA|YISHUN|KHATIB|YIO CHU KANG|ANG MO KIO|BISHAN|BRADDELL|TOA PAYOH|NOVENA|NEWTON|ORCHARD|SOMERSET|DHOBY GHAUT|CITY HALL|RAFFLES PLACE|MARINA BAY|MARINA SOUTH PIER)/, color: "#d11141", code: "NSL" },
  EWL: { regex: /(PASIR RIS|TAMPINES|SIMEI|TANAH MERAH|BEDOK|KEMBANGAN|EUNOS|PAYA LEBAR|ALJUNIED|KALLANG|LAVENDER|BUGIS|TANJONG PAGAR|OUTRAM PARK|TIONG BAHRU|REDHILL|QUEENSTOWN|COMMONWEALTH|BUONA VISTA|DOVER|CLEMENTI|CHINESE GARDEN|LAKESIDE|BOON LAY|PIONEER|JOO KOON|GUL CIRCLE|TUAS)/, color: "#00a651", code: "EWL" },
  NEL: { regex: /(HARBOURFRONT|CHINATOWN|CLARKE QUAY|LITTLE INDIA|FARRER PARK|BOON KENG|POTONG PASIR|WOODLEIGH|SERANGOON|KOVAN|HOUGANG|BUANGKOK|SENGKANG|PUNGGOL)/, color: "#9b26b6", code: "NEL" },
  CCL: { regex: /(BRAS BASAH|ESPLANADE|PROMENADE|NICOLL HIGHWAY|STADIUM|MOUNTBATTEN|DAKOTA|MACPHERSON|TAI SENG|BARTLEY|LORONG CHUAN|MARYMOUNT|CALDECOTT|BOTANIC GARDENS|FARRER ROAD|HOLLAND VILLAGE|ONE-NORTH|KENT RIDGE|HAW PAR VILLA|PASIR PANJANG|LABRADOR PARK|TELOK BLANGAH|BAYFRONT)/, color: "#fca311", code: "CCL" },
  DTL: { regex: /(BUKIT PANJANG|CASHEW|HILLVIEW|BEAUTY WORLD|KING ALBERT PARK|SIXTH AVENUE|TAN KAH KEE|STEVENS|ROCHOR|DOWNTOWN|TELOK AYER|FORT CANNING|BENCOOLEN|JALAN BESAR|BENDEMEER|GEYLANG BAHRU|MATTAR|UBI|KAKI BUKIT|BEDOK NORTH|BEDOK RESERVOIR|TAMPINES WEST|TAMPINES EAST|UPPER CHANGI|EXPO)/, color: "#00539b", code: "DTL" },
  TEL: { regex: /(WOODLANDS NORTH|WOODLANDS SOUTH|SPRINGLEAF|LENTOR|MAYFLOWER|BRIGHT HILL|UPPER THOMSON|NAPIER|ORCHARD BOULEVARD|GREAT WORLD|HAVELOCK|MAXWELL|SHENTON WAY|MARINA SOUTH|GARDENS BY THE BAY)/, color: "#764c24", code: "TEL" },
  LRT: { regex: /(LRT)/, color: "#7c878e", code: "LRT" }
};

export function getStationDetails(stationName: string): { color: string; lines: string[]; isInterchange: boolean } {
  const name = stationName.toUpperCase();
  const matchedLines: typeof LINE_COLORS[keyof typeof LINE_COLORS][] = [];

  for (const lineKey of Object.keys(LINE_COLORS)) {
    const line = LINE_COLORS[lineKey];
    if (name.match(line.regex)) {
      matchedLines.push(line);
    }
  }

  // Add explicit interchanges that regex might miss or we want to guarantee
  if (name.includes("DHOBY GHAUT") && !matchedLines.find(l => l.code === "CCL")) matchedLines.push(LINE_COLORS.CCL);
  if (name.includes("DHOBY GHAUT") && !matchedLines.find(l => l.code === "NSL")) matchedLines.push(LINE_COLORS.NSL);
  if (name.includes("DHOBY GHAUT") && !matchedLines.find(l => l.code === "NEL")) matchedLines.push(LINE_COLORS.NEL);

  if (name.includes("BISHAN") && !matchedLines.find(l => l.code === "CCL")) matchedLines.push(LINE_COLORS.CCL);
  if (name.includes("SERANGOON") && !matchedLines.find(l => l.code === "CCL")) matchedLines.push(LINE_COLORS.CCL);
  if (name.includes("PAYA LEBAR") && !matchedLines.find(l => l.code === "CCL")) matchedLines.push(LINE_COLORS.CCL);
  if (name.includes("BUONA VISTA") && !matchedLines.find(l => l.code === "CCL")) matchedLines.push(LINE_COLORS.CCL);
  
  // Deduplicate array based on code
  const uniqueLines = Array.from(new Map(matchedLines.map(item => [item.code, item])).values());
  const isInterchange = uniqueLines.length > 1;
  const primaryColor = uniqueLines.length > 0 ? uniqueLines[0].color : "#2563eb";

  return {
    color: primaryColor,
    lines: uniqueLines.map(l => l.code),
    isInterchange
  };
}
