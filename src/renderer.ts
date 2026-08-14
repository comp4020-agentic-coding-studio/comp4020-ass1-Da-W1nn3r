import { formatYear, parseDate } from "./dates";
import { computeNodePositions } from "./layout";
import {
  TRAVEL_DURATION_FRACTION,
  companyNameAt,
  cumulativeActualByCompany,
  cumulativeGivenActualByCompany,
  cumulativeGivenPaperByCompany,
  cumulativePaperByCompany,
  establishedCompanies,
  establishedDatesByCompany,
  inFlightTransactions,
  nodeActualRadius,
  nodeRadius,
  transactionRadius,
} from "./model";
import { CATEGORICAL, CHROME_LIGHT, STATUS, categoricalColor, chromeFor } from "./palette";
import type { ChromeColors } from "./palette";
import type { Theme } from "./theme";
import type { Hoverable, Point, TimelineData } from "./types";

/** A node's eased-toward-target position, plus its grow-in/shrink-out progress (0 = not yet drawn, 1 = fully grown). */
interface AnimatedNode extends Point {
  growT: number;
}

/** How quickly a node's position closes the gap to its target each second — matches Scrubber's easing rate. */
const NODE_EASE_RATE_PER_SECOND = 6;
/** How quickly a node's displayed paper/actual value closes the gap to its true cumulative total each second — so a node's radius grows smoothly instead of popping the instant a transaction settles. */
const VALUE_EASE_RATE_PER_SECOND = 6;
/** Seconds for a newly-established node to grow from nothing to full size. */
const GROW_DURATION_SECONDS = 0.5;
/** Shrink-out runs a bit quicker than grow-in, so scrubbing back past a company's establishing date feels snappy. */
const SHRINK_DURATION_SECONDS = 0.3;
/** Below this, a shrinking (no-longer-established) node is dropped instead of drawn as a sliver. */
const NODE_VANISH_GROW_T = 0.01;
/** Caps the per-frame delta used for node easing, so a throttled/backgrounded tab doesn't snap nodes on return. */
const MAX_NODE_EASE_DELTA_SECONDS = 0.1;

/** Cubic ease-out: fast at first, slowing toward the end — used to turn a node's linear grow progress into its visual scale. */
function easeOutCubic(x: number): number {
  const inv = 1 - x;
  return 1 - inv * inv * inv;
}

/** Which side of a transaction a node's size reflects. */
export type ScaleMode = "received" | "given";

const TIMELINE_TRACK_HEIGHT = 140;
export const TRACK_PADDING_X = 48;
const MIN_HOVER_RADIUS = 10;
const MIN_YEAR_LABEL_SPACING_PX = 40;
const MIN_MARKER_SPACING_PX = 14;
const DODGE_MAX_OFFSET_PX = 20;
const DODGE_CANDIDATE_STEP_PX = 1;
const RELEASE_ROW_OFFSET_PX = 16;
const EVENT_ROW_OFFSET_PX = 66;
const LABEL_LINE_HEIGHT_PX = 15;
const LABEL_FONT = "600 13px system-ui, sans-serif";

/**
 * Vertical offsets to keep same-row markers from overlapping when their dates fall close
 * together. Two earlier lane-based versions each fixed one symptom and reintroduced another: a
 * fixed-magnitude cap on a marker's offset collapsed distinct lanes onto the same value once a
 * cluster needed more lanes than the cap allowed; removing the cap let a narrow mobile canvas —
 * which needs far more lanes than desktop for the same date cluster, since less pixel width means
 * less room to separate markers by x alone — push offsets far enough to hit the row above/below;
 * shrinking the per-lane step to stay in bounds then shrunk the *gap between lanes* far enough that
 * two markers close in x could still land within a few pixels of each other. All three treated x
 * and y as independent, lane-derived quantities instead of checking actual distance. This version
 * instead searches a fixed set of candidate y-offsets (multiples of `DODGE_CANDIDATE_STEP_PX`, up
 * to `maxOffset` either side of zero) and, for each marker in x order, picks the smallest-magnitude
 * candidate whose real 2D distance to every already-placed marker in this row is at least
 * `minDistance` — falling back to whichever candidate maximizes that distance if the cluster is too
 * dense for any candidate to fully clear it.
 */
function dodgeOffsets(xs: number[], minDistance: number, maxOffset: number): number[] {
  const order = xs.map((_, i) => i).sort((a, b) => xs[a]! - xs[b]!);
  const offsets = Array.from<number>({ length: xs.length }).fill(0);
  const candidates: number[] = [0];
  for (let magnitude = DODGE_CANDIDATE_STEP_PX; magnitude <= maxOffset; magnitude += DODGE_CANDIDATE_STEP_PX) {
    candidates.push(magnitude, -magnitude);
  }
  const placed: Point[] = [];
  for (const i of order) {
    const x = xs[i]!;
    let best = candidates[0]!;
    let bestDistance = -Infinity;
    for (const candidate of candidates) {
      let nearest = Infinity;
      for (const point of placed) {
        nearest = Math.min(nearest, Math.hypot(x - point.x, candidate - point.y));
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = candidate;
      }
      if (nearest >= minDistance) break;
    }
    offsets[i] = best;
    placed.push({ x, y: best });
  }
  return offsets;
}

export class CanvasRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  private readonly nodeAnim = new Map<string, AnimatedNode>();
  private readonly valueAnim = new Map<string, { paper: number; actual: number }>();
  private lastRenderTimeMs: number | null = null;
  private chrome: ChromeColors = CHROME_LIGHT;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  render(
    data: TimelineData,
    t: number,
    dateRange: { min: number; max: number },
    hoveredId: string | null,
    scaleMode: ScaleMode = "received",
    theme: Theme = "light",
  ): Hoverable[] {
    const { ctx, width, height } = this;
    this.chrome = chromeFor(theme);
    const hoverables: Hoverable[] = [];
    const plotHeight = height - TIMELINE_TRACK_HEIGHT;
    const minDimension = Math.min(width, plotHeight);
    const xForDate = (date: number): number =>
      TRACK_PADDING_X +
      ((date - dateRange.min) / (dateRange.max - dateRange.min || 1)) * (width - 2 * TRACK_PADDING_X);

    const establishedDates = establishedDatesByCompany(data);
    const established = establishedCompanies(data, t, establishedDates);
    const targets = computeNodePositions(established, width, height, TIMELINE_TRACK_HEIGHT);
    const travelDurationMs = (dateRange.max - dateRange.min) * TRAVEL_DURATION_FRACTION;

    const nowMs = performance.now();
    const deltaSeconds =
      this.lastRenderTimeMs === null
        ? 0
        : Math.min(MAX_NODE_EASE_DELTA_SECONDS, (nowMs - this.lastRenderTimeMs) / 1000);
    this.lastRenderTimeMs = nowMs;
    const animated = this.stepAnimatedNodes(targets, deltaSeconds);

    ctx.fillStyle = this.chrome.surface;
    ctx.fillRect(0, 0, width, height);

    this.drawTimelineTrack(data, dateRange, xForDate, hoveredId, hoverables);
    this.drawPlayhead(xForDate(t));
    this.drawTransactions(data, t, travelDurationMs, animated, minDimension, hoveredId, hoverables);
    this.drawNodes(
      data,
      t,
      travelDurationMs,
      animated,
      targets,
      plotHeight,
      minDimension,
      hoveredId,
      hoverables,
      scaleMode,
      deltaSeconds,
    );

    return hoverables;
  }

  /**
   * Advances each node's displayed position and grow progress toward its target, using real
   * elapsed time (not `t`) — so a node glides into a newly-evenly-spaced slot whenever the
   * established set changes, however that change happened (play, wheel, or a drag jump). Position
   * uses an asymptotic ease (matches Scrubber); grow/shrink instead accumulates linearly over a
   * fixed duration and is only turned into a visual scale (via `easeOutCubic`) at draw time, so a
   * newly-established node's growth has a definite end rather than an ever-slower approach to it.
   * A node dropped from `targets` (the scrubber moved back before its establishing date) shrinks
   * back to nothing instead of vanishing, then is pruned once it's imperceptibly small.
   */
  private stepAnimatedNodes(targets: Map<string, Point>, deltaSeconds: number): Map<string, AnimatedNode> {
    const ease = 1 - Math.exp(-NODE_EASE_RATE_PER_SECOND * deltaSeconds);
    const growStep = deltaSeconds / GROW_DURATION_SECONDS;
    const shrinkStep = deltaSeconds / SHRINK_DURATION_SECONDS;
    for (const [id, target] of targets) {
      const existing = this.nodeAnim.get(id);
      if (!existing) {
        this.nodeAnim.set(id, { x: target.x, y: target.y, growT: 0 });
      } else {
        existing.x += (target.x - existing.x) * ease;
        existing.y += (target.y - existing.y) * ease;
        existing.growT = Math.min(1, existing.growT + growStep);
      }
    }
    for (const [id, node] of this.nodeAnim) {
      if (targets.has(id)) continue;
      node.growT = Math.max(0, node.growT - shrinkStep);
      if (node.growT < NODE_VANISH_GROW_T) this.nodeAnim.delete(id);
    }
    return this.nodeAnim;
  }

  private drawNodes(
    data: TimelineData,
    t: number,
    travelDurationMs: number,
    animated: Map<string, AnimatedNode>,
    targets: Map<string, Point>,
    plotHeight: number,
    minDimension: number,
    hoveredId: string | null,
    hoverables: Hoverable[],
    scaleMode: ScaleMode,
    deltaSeconds: number,
  ): void {
    const { ctx } = this;
    const paperByCompany = scaleMode === "given" ? cumulativeGivenPaperByCompany : cumulativePaperByCompany;
    const actualByCompany = scaleMode === "given" ? cumulativeGivenActualByCompany : cumulativeActualByCompany;
    const paperTotals = paperByCompany(data, t, travelDurationMs);
    const actualTotals = actualByCompany(data, t, travelDurationMs);
    // Scale against each company's eventual final total, not the current instant's — otherwise a
    // company's node shrinks whenever some other company's total overtakes the previous leader.
    const finalPaperTotals = paperByCompany(data, Infinity, travelDurationMs);
    const maxPaper = Math.max(0, ...finalPaperTotals.values());
    const valueEase = 1 - Math.exp(-VALUE_EASE_RATE_PER_SECOND * deltaSeconds);

    const labelCandidates: { name: string; x: number; y: number }[] = [];

    data.companies.forEach((company, index) => {
      const node = animated.get(company.id);
      if (!node) return;
      const rawPaper = paperTotals.get(company.id) ?? 0;
      const rawActual = actualTotals.get(company.id) ?? 0;
      // Ease the displayed value toward its true cumulative total (rather than reading it
      // straight off), so a node's radius grows in smoothly instead of popping the instant a
      // transaction settles — settling is a step function in time, but the drawn size shouldn't be.
      let value = this.valueAnim.get(company.id);
      if (!value) {
        value = { paper: rawPaper, actual: rawActual };
        this.valueAnim.set(company.id, value);
      } else {
        value.paper += (rawPaper - value.paper) * valueEase;
        value.actual += (rawActual - value.actual) * valueEase;
      }
      const scale = easeOutCubic(node.growT);
      const outerR = nodeRadius(value.paper, maxPaper, minDimension) * scale;
      const innerR = nodeActualRadius(value.actual, maxPaper, minDimension) * scale;
      const color = categoricalColor(index);

      ctx.beginPath();
      ctx.arc(node.x, node.y, outerR, 0, 2 * Math.PI);
      ctx.globalAlpha = 0.3;
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = color;
      ctx.stroke();

      if (innerR > 0) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, innerR, 0, 2 * Math.PI);
        ctx.globalAlpha = 0.88;
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (hoveredId === company.id) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, outerR, 0, 2 * Math.PI);
        ctx.lineWidth = 3;
        ctx.strokeStyle = this.chrome.primaryInk;
        ctx.stroke();
      }

      // Not established at `t` (still shrinking out after a backward scrub) — draw it fading away
      // but keep it out of the label/hover layers, which only concern the currently-live set.
      if (!targets.has(company.id)) return;

      const name = companyNameAt(company, t);
      labelCandidates.push({ name, x: node.x, y: Math.min(node.y + outerR + 6, plotHeight - 14) });
      hoverables.push({ kind: "node", x: node.x, y: node.y, r: outerR, id: company.id });
    });

    this.drawNodeLabels(labelCandidates);
  }

  /**
   * Draws each company's name below its node, pushing a label straight down past any
   * earlier-placed label it would otherwise overlap — needed once enough nodes sit close
   * together (e.g. adjacent slots in the circular layout) that fixed-offset labels collide.
   */
  private drawNodeLabels(candidates: { name: string; x: number; y: number }[]): void {
    const { ctx } = this;
    ctx.font = LABEL_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const labels = candidates.map((c) => ({
      text: c.name,
      x: c.x,
      y: c.y,
      width: ctx.measureText(c.name).width,
    }));

    const order = labels.map((_, i) => i).sort((a, b) => labels[a]!.y - labels[b]!.y);
    const placed: { x: number; y: number; width: number }[] = [];
    for (const i of order) {
      const label = labels[i]!;
      let y = label.y;
      let overlapping = true;
      while (overlapping) {
        overlapping = placed.some(
          (p) =>
            Math.abs(label.x - p.x) < (label.width + p.width) / 2 + 4 && Math.abs(y - p.y) < LABEL_LINE_HEIGHT_PX,
        );
        if (overlapping) y += LABEL_LINE_HEIGHT_PX;
      }
      placed.push({ x: label.x, y, width: label.width });
      label.y = y;
    }

    ctx.fillStyle = this.chrome.primaryInk;
    for (const label of labels) {
      ctx.fillText(label.text, label.x, label.y);
    }
  }

  private drawTransactions(
    data: TimelineData,
    t: number,
    travelDurationMs: number,
    animated: Map<string, AnimatedNode>,
    minDimension: number,
    hoveredId: string | null,
    hoverables: Hoverable[],
  ): void {
    const { ctx } = this;
    const maxTransactionValue = Math.max(0, ...data.transactions.map((tx) => tx.paperValue));

    for (const { transaction, progress } of inFlightTransactions(data, t, travelDurationMs)) {
      const from = animated.get(transaction.from);
      const to = animated.get(transaction.to);
      if (!from || !to) continue;

      const x = from.x + (to.x - from.x) * progress;
      const y = from.y + (to.y - from.y) * progress;
      const r = transactionRadius(transaction.paperValue, maxTransactionValue, minDimension);

      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      if (transaction.delivered) {
        ctx.fillStyle = STATUS.delivered;
        ctx.fill();
      } else {
        ctx.fillStyle = this.chrome.surface;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = STATUS.pledged;
        ctx.stroke();
      }
      if (hoveredId === transaction.id) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.chrome.primaryInk;
        ctx.stroke();
      }

      hoverables.push({ kind: "transaction", x, y, r: Math.max(r, MIN_HOVER_RADIUS), id: transaction.id });
    }
  }

  private drawTimelineTrack(
    data: TimelineData,
    dateRange: { min: number; max: number },
    xForDate: (date: number) => number,
    hoveredId: string | null,
    hoverables: Hoverable[],
  ): void {
    const { ctx, width, height } = this;
    const trackTop = height - TIMELINE_TRACK_HEIGHT;
    const baselineY = trackTop + 100;

    ctx.strokeStyle = this.chrome.baseline;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(TRACK_PADDING_X, baselineY);
    ctx.lineTo(width - TRACK_PADDING_X, baselineY);
    ctx.stroke();

    const minYear = new Date(dateRange.min).getUTCFullYear();
    const maxYear = new Date(dateRange.max).getUTCFullYear();
    const pxPerYear = (width - 2 * TRACK_PADDING_X) / (maxYear - minYear || 1);
    const yearLabelStep = Math.max(1, Math.ceil(MIN_YEAR_LABEL_SPACING_PX / pxPerYear));
    ctx.fillStyle = this.chrome.mutedInk;
    ctx.font = "12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let year = minYear; year <= maxYear; year++) {
      const x = xForDate(Date.UTC(year, 0, 1));
      ctx.strokeStyle = this.chrome.gridline;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, baselineY - 5);
      ctx.lineTo(x, baselineY + 5);
      ctx.stroke();
      if ((year - minYear) % yearLabelStep === 0) {
        ctx.fillText(formatYear(Date.UTC(year, 0, 1)), x, baselineY + 8);
      }
    }

    ctx.textBaseline = "middle";
    const releaseXs = data.llmReleases.map((release) => xForDate(parseDate(release.date)));
    const releaseDodge = dodgeOffsets(releaseXs, MIN_MARKER_SPACING_PX, DODGE_MAX_OFFSET_PX);
    data.llmReleases.forEach((release, index) => {
      const companyIndex = data.companies.findIndex((c) => c.id === release.company);
      const x = releaseXs[index]!;
      const y = trackTop + RELEASE_ROW_OFFSET_PX + releaseDodge[index]!;
      const id = `${release.company}:${release.date}:${index}`;
      const r = 6;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = companyIndex >= 0 ? CATEGORICAL[companyIndex % CATEGORICAL.length]! : this.chrome.mutedInk;
      ctx.fillRect(-r / 2, -r / 2, r, r);
      ctx.restore();
      if (hoveredId === id) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.PI / 4);
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.chrome.primaryInk;
        ctx.strokeRect(-r / 2 - 2, -r / 2 - 2, r + 4, r + 4);
        ctx.restore();
      }

      hoverables.push({ kind: "release", x, y, r: MIN_HOVER_RADIUS, id });
    });

    const eventXs = data.companyEvents.map((event) => xForDate(parseDate(event.date)));
    const eventDodge = dodgeOffsets(eventXs, MIN_MARKER_SPACING_PX, DODGE_MAX_OFFSET_PX);
    data.companyEvents.forEach((event, index) => {
      const companyIndex = data.companies.findIndex((c) => c.id === event.company);
      const x = eventXs[index]!;
      const y = trackTop + EVENT_ROW_OFFSET_PX + eventDodge[index]!;
      const r = 6;

      ctx.beginPath();
      ctx.moveTo(x, y - r / 2);
      ctx.lineTo(x - r / 2, y + r / 2);
      ctx.lineTo(x + r / 2, y + r / 2);
      ctx.closePath();
      ctx.fillStyle = companyIndex >= 0 ? CATEGORICAL[companyIndex % CATEGORICAL.length]! : this.chrome.mutedInk;
      ctx.fill();
      if (hoveredId === event.id) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = this.chrome.primaryInk;
        ctx.stroke();
      }

      hoverables.push({ kind: "event", x, y, r: MIN_HOVER_RADIUS, id: event.id });
    });
  }

  private drawPlayhead(x: number): void {
    const { ctx, height } = this;
    ctx.save();
    ctx.strokeStyle = this.chrome.primaryInk;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
    ctx.restore();
  }
}
