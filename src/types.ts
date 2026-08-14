export interface CompanyRename {
  /** Date the company's displayed name became `name`. */
  date: string;
  name: string;
}

export interface Company {
  id: string;
  /** Name used before the first applicable entry in `renames` (or always, if there are none). */
  name: string;
  /** Ordered by when each name took effect; `companyNameAt` picks the latest one at or before a given date. */
  renames?: CompanyRename[];
}

export interface Transaction {
  id: string;
  date: string;
  from: string;
  to: string;
  paperValue: number;
  actualValue: number;
  delivered: boolean;
  description: string;
}

export interface LlmRelease {
  date: string;
  company: string;
  model: string;
  note: string;
}

export interface CompanyEvent {
  id: string;
  date: string;
  company: string;
  title: string;
  note: string;
}

export interface TimelineData {
  companies: Company[];
  transactions: Transaction[];
  llmReleases: LlmRelease[];
  companyEvents: CompanyEvent[];
}

export interface Point {
  x: number;
  y: number;
}

export type HoverableKind = "node" | "transaction" | "release" | "event";

export interface Hoverable {
  kind: HoverableKind;
  x: number;
  y: number;
  r: number;
  id: string;
}
