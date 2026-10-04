/** A display-series point whose x coordinate is an increasing instant or position. */
export interface SeriesPoint {
  readonly x: number;
  readonly y: number;
}

/** Largest-triangle-three-buckets display selection. Raw points remain unchanged. */
export function downsampleLttb<T extends SeriesPoint>(
  points: readonly T[],
  threshold: number,
): readonly T[] {
  if (!Number.isInteger(threshold) || threshold < 3)
    throw new RangeError('invalid-display-threshold');
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!;
    if (
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y) ||
      (index > 0 && point.x <= points[index - 1]!.x)
    ) {
      throw new RangeError('invalid-display-series');
    }
  }
  if (points.length <= threshold) return points.slice();
  const selected: T[] = [points[0]!];
  const bucketSize = (points.length - 2) / (threshold - 2);
  let anchorIndex = 0;
  for (let bucket = 0; bucket < threshold - 2; bucket += 1) {
    const averageStart = Math.floor((bucket + 1) * bucketSize) + 1;
    const averageEnd = Math.min(
      Math.floor((bucket + 2) * bucketSize) + 1,
      points.length,
    );
    let averageX = 0;
    let averageY = 0;
    for (let index = averageStart; index < averageEnd; index += 1) {
      averageX += points[index]!.x;
      averageY += points[index]!.y;
    }
    averageX /= averageEnd - averageStart;
    averageY /= averageEnd - averageStart;
    const rangeStart = Math.floor(bucket * bucketSize) + 1;
    const rangeEnd = Math.floor((bucket + 1) * bucketSize) + 1;
    const anchor = points[anchorIndex]!;
    let maximumArea = -1;
    let candidateIndex = rangeStart;
    for (let index = rangeStart; index < rangeEnd; index += 1) {
      const point = points[index]!;
      const area = Math.abs(
        (anchor.x - averageX) * (point.y - anchor.y) -
          (anchor.x - point.x) * (averageY - anchor.y),
      );
      if (area > maximumArea) {
        maximumArea = area;
        candidateIndex = index;
      }
    }
    selected.push(points[candidateIndex]!);
    anchorIndex = candidateIndex;
  }
  selected.push(points.at(-1)!);
  return selected;
}
