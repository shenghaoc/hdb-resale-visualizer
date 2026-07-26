export type FlatTypeCohortRefinement = {
  flatType: string;
  flatModel: string;
  areaMin: number | null;
  areaMax: number | null;
  startMonth: string | null;
  endMonth: string | null;
};

export function requiresFlatTypeCohortMetadata(input: FlatTypeCohortRefinement): boolean {
  return Boolean(
    input.flatType &&
    (input.flatModel ||
      input.areaMin !== null ||
      input.areaMax !== null ||
      input.startMonth !== null ||
      input.endMonth !== null),
  );
}

export function hasCompleteFlatTypeCohortMetadata(
  blocks: ReadonlyArray<{ flatTypeCohorts?: unknown }>,
): boolean {
  return blocks.length > 0 && blocks.every((block) => block.flatTypeCohorts !== undefined);
}
