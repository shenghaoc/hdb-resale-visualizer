export type AmenityLayerType = 'mrt-station' | 'mrt-exit' | 'school';

const MIN_ZOOM: Record<AmenityLayerType, number> = {
  'mrt-station': 11,
  'mrt-exit': 12,
  'school': 12,
};

export function shouldShowAmenityLayer(zoom: number, layerType: AmenityLayerType): boolean {
  return zoom >= MIN_ZOOM[layerType];
}

export function getAmenityMinZoom(layerType: AmenityLayerType): number {
  return MIN_ZOOM[layerType];
}
