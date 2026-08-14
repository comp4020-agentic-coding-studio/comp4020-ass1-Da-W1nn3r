import { getDateRange, timelineData } from "./src/data";
import { parseDate } from "./src/dates";
import { currentHeadline } from "./src/headline";
import {
  TRAVEL_DURATION_FRACTION,
  companyNameAt,
  cumulativeActualByCompany,
  cumulativeGivenActualByCompany,
  cumulativeGivenPaperByCompany,
  cumulativePaperByCompany,
  cumulativeTotals,
} from "./src/model";
import { CanvasRenderer, TRACK_PADDING_X } from "./src/renderer";
import type { ScaleMode } from "./src/renderer";
import { Scrubber } from "./src/scrub";
import { getTheme, applyTheme, setTheme, watchSystemTheme } from "./src/theme";
import type { Theme } from "./src/theme";
import { Tooltip } from "./src/tooltip";
import type { Hoverable } from "./src/types";

const canvas = document.querySelector<HTMLCanvasElement>("#timeline-canvas")!;
const tooltipEl = document.querySelector<HTMLElement>("#tooltip")!;
const hudPaper = document.querySelector<HTMLElement>("#hud-paper")!;
const hudActual = document.querySelector<HTMLElement>("#hud-actual")!;
const hudLimbo = document.querySelector<HTMLElement>("#hud-limbo")!;
const scaleToggleBtn = document.querySelector<HTMLButtonElement>("#scale-toggle")!;
const playToggleBtn = document.querySelector<HTMLButtonElement>("#play-toggle")!;
const themeToggleBtn = document.querySelector<HTMLButtonElement>("#theme-toggle")!;
const headlineEl = document.querySelector<HTMLElement>("#headline")!;
const headlineTextEl = document.querySelector<HTMLElement>("#headline-text")!;

/** Pixels per second the headline ticker scrolls at, so its speed reads the same regardless of text length. */
const HEADLINE_SPEED_PX_PER_SECOND = 220;
/** Clamp on how long one headline's scroll cycle can take — long descriptions still finish in a
 * readable amount of time instead of leaving a stale headline on screen for a minute. */
const HEADLINE_MIN_DURATION_SECONDS = 6;
const HEADLINE_MAX_DURATION_SECONDS = 16;

/** Average Gregorian month length, so autoplay advances at a steady 1 month per real second. */
const MS_PER_MONTH = (365.25 / 12) * 24 * 60 * 60 * 1000;

const data = timelineData;
const dateRange = getDateRange(data);
const travelDurationMs = (dateRange.max - dateRange.min) * TRAVEL_DURATION_FRACTION;
const renderer = new CanvasRenderer(canvas);
const scrubber = new Scrubber(dateRange.min, dateRange.max, dateRange.min);
const tooltip = new Tooltip(tooltipEl);

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

let hoverables: Hoverable[] = [];
let hoveredId: string | null = null;
let scaleMode: ScaleMode = "received";
let isPlaying = false;
let theme: Theme = getTheme();

/** Displays `text` in the ticker and scrolls it across once, at a speed proportional to its length. */
function playHeadline(text: string): void {
  headlineTextEl.textContent = text;
  headlineTextEl.classList.remove("scroll");
  void headlineTextEl.offsetWidth;
  const distance = headlineEl.clientWidth + headlineTextEl.scrollWidth;
  const duration = Math.min(
    HEADLINE_MAX_DURATION_SECONDS,
    Math.max(HEADLINE_MIN_DURATION_SECONDS, distance / HEADLINE_SPEED_PX_PER_SECOND),
  );
  headlineTextEl.style.animationDuration = `${duration}s`;
  headlineTextEl.classList.add("scroll");
}

/**
 * Picks whatever's current at the scrubbed time and plays it. Only called once the previous
 * headline has fully scrolled off (see the `animationend` listener below) — never mid-scroll —
 * so scrubbing past several transactions in a row doesn't cut the ticker off partway through.
 */
function advanceHeadline(): void {
  playHeadline(currentHeadline(data, scrubber.current).text);
}

headlineTextEl.addEventListener("animationend", advanceHeadline);

function setThemeUi(next: Theme, persist: boolean): void {
  theme = next;
  if (persist) setTheme(next);
  else applyTheme(next);
  themeToggleBtn.setAttribute("aria-pressed", String(next === "dark"));
  themeToggleBtn.setAttribute("aria-label", next === "dark" ? "Switch to light mode" : "Switch to dark mode");
  draw();
}

/** A company's display name as of `t` — historical entries show the name in effect at that date, not today's. */
function companyName(id: string, t: number): string {
  const company = data.companies.find((c) => c.id === id);
  return company ? companyNameAt(company, t) : id;
}

function setScaleMode(mode: ScaleMode): void {
  scaleMode = mode;
  scaleToggleBtn.textContent = mode === "given" ? "Given" : "Received";
  scaleToggleBtn.setAttribute("aria-pressed", String(mode === "given"));
  draw();
}

scaleToggleBtn.addEventListener("click", () => setScaleMode(scaleMode === "given" ? "received" : "given"));

function setPlaying(playing: boolean): void {
  isPlaying = playing;
  playToggleBtn.textContent = playing ? "⏸ Pause" : "▶ Play";
  playToggleBtn.setAttribute("aria-pressed", String(playing));
}

playToggleBtn.addEventListener("click", () => setPlaying(!isPlaying));

themeToggleBtn.addEventListener("click", () => setThemeUi(theme === "dark" ? "light" : "dark", true));
watchSystemTheme((next) => setThemeUi(next, false));

function draw(): void {
  hoverables = renderer.render(data, scrubber.current, dateRange, hoveredId, scaleMode, theme);
  const totals = cumulativeTotals(data, scrubber.current);
  hudPaper.textContent = money.format(totals.paper);
  hudActual.textContent = money.format(totals.actual);
  hudLimbo.textContent = money.format(totals.paper - totals.actual);
}

function findHoverable(x: number, y: number): Hoverable | null {
  let closest: Hoverable | null = null;
  let closestDistance = Infinity;
  for (const h of hoverables) {
    const distance = Math.hypot(h.x - x, h.y - y);
    if (distance <= h.r && distance < closestDistance) {
      closest = h;
      closestDistance = distance;
    }
  }
  return closest;
}

function tooltipHtml(hoverable: Hoverable): string {
  if (hoverable.kind === "node") {
    const company = data.companies.find((c) => c.id === hoverable.id);
    const paperByCompany = scaleMode === "given" ? cumulativeGivenPaperByCompany : cumulativePaperByCompany;
    const actualByCompany = scaleMode === "given" ? cumulativeGivenActualByCompany : cumulativeActualByCompany;
    const paper = paperByCompany(data, scrubber.current, travelDurationMs).get(hoverable.id) ?? 0;
    const actual = actualByCompany(data, scrubber.current, travelDurationMs).get(hoverable.id) ?? 0;
    const verb = scaleMode === "given" ? "given" : "received";
    const name = company ? companyNameAt(company, scrubber.current) : hoverable.id;
    return `<strong>${name}</strong><br>
      Cumulative paper value ${verb}: ${money.format(paper)}<br>
      Cumulative actual value ${verb}: ${money.format(actual)}`;
  }
  if (hoverable.kind === "transaction") {
    const tx = data.transactions.find((t) => t.id === hoverable.id);
    if (!tx) return "";
    const txDate = parseDate(tx.date);
    return `<strong>${companyName(tx.from, txDate)} → ${companyName(tx.to, txDate)}</strong><br>
      ${tx.date}<br>
      Paper: ${money.format(tx.paperValue)} · Actual: ${money.format(tx.actualValue)}<br>
      ${tx.delivered ? "Delivered" : "Still on paper"}<br>
      <em>${tx.description}</em>`;
  }
  if (hoverable.kind === "event") {
    const event = data.companyEvents.find((e) => e.id === hoverable.id);
    if (!event) return "";
    return `<strong>${companyName(event.company, parseDate(event.date))} — ${event.title}</strong><br>
      ${event.date}<br>
      <em>${event.note}</em>`;
  }
  const index = Number(hoverable.id.split(":").pop());
  const release = data.llmReleases[index];
  if (!release) return "";
  return `<strong>${companyName(release.company, parseDate(release.date))} — ${release.model}</strong><br>
    ${release.date}<br>
    <em>${release.note}</em>`;
}

function setup(): void {
  renderer.resize();
  setThemeUi(theme, false);
}

window.addEventListener("resize", () => {
  setup();
  playHeadline(headlineTextEl.textContent ?? "");
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    setPlaying(false);
    scrubber.scrollBy(event.deltaY);
  },
  { passive: false },
);

let dragPointerId: number | null = null;

function dateForClientX(clientX: number): number {
  const rect = canvas.getBoundingClientRect();
  const plotWidth = rect.width - 2 * TRACK_PADDING_X;
  const fraction = (clientX - rect.left - TRACK_PADDING_X) / (plotWidth || 1);
  return dateRange.min + fraction * (dateRange.max - dateRange.min);
}

canvas.addEventListener("pointerdown", (event) => {
  dragPointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  setPlaying(false);
  scrubber.dragTo(dateForClientX(event.clientX));
  draw();
  tooltip.hide();
});

canvas.addEventListener("pointerup", (event) => {
  if (event.pointerId !== dragPointerId) return;
  dragPointerId = null;
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("pointercancel", (event) => {
  if (event.pointerId !== dragPointerId) return;
  dragPointerId = null;
});

let lastFrameMs: number | null = null;
function animate(nowMs: number): void {
  const deltaSeconds = lastFrameMs === null ? 0 : (nowMs - lastFrameMs) / 1000;
  lastFrameMs = nowMs;
  if (isPlaying) {
    const next = scrubber.dragTo(scrubber.current + deltaSeconds * MS_PER_MONTH);
    if (next >= dateRange.max) setPlaying(false);
  }
  scrubber.tick(deltaSeconds);
  draw();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId === dragPointerId) {
    scrubber.dragTo(dateForClientX(event.clientX));
    draw();
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const hit = findHoverable(event.clientX - rect.left, event.clientY - rect.top);
  const nextHoveredId = hit?.id ?? null;
  if (nextHoveredId !== hoveredId) {
    hoveredId = nextHoveredId;
    draw();
  }
  if (hit) {
    tooltip.show(tooltipHtml(hit), event.clientX, event.clientY);
  } else {
    tooltip.hide();
  }
});

canvas.addEventListener("pointerleave", () => {
  tooltip.hide();
  if (hoveredId) {
    hoveredId = null;
    draw();
  }
});

setup();
advanceHeadline();
