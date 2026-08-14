import type { Company, Point } from "./types";

const LAYOUT_RADIUS_FRACTION = 0.35;

/**
 * Deterministic circular layout of company nodes, centered in the area above the
 * bottom timeline track. Fine for a handful of companies; a force layout would be
 * overkill here.
 */
export function computeNodePositions(
  companies: Company[],
  canvasWidth: number,
  canvasHeight: number,
  timelineTrackHeight: number,
): Map<string, Point> {
  const plotHeight = canvasHeight - timelineTrackHeight;
  const center: Point = { x: canvasWidth / 2, y: plotHeight / 2 };
  const layoutRadius = Math.min(canvasWidth, plotHeight) * LAYOUT_RADIUS_FRACTION;

  const positions = new Map<string, Point>();
  companies.forEach((company, index) => {
    const angle = (index / companies.length) * 2 * Math.PI - Math.PI / 2;
    positions.set(company.id, {
      x: center.x + layoutRadius * Math.cos(angle),
      y: center.y + layoutRadius * Math.sin(angle),
    });
  });
  return positions;
}
