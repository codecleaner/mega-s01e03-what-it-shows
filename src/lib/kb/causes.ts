// How the support desk tells which cause a report belongs to. Pages explain it; this file is what runs.

// `meta.intakeTag` is what intake guessed from the reporter's browser, the moment the report came
// in. It is a guess. The cause depends on the tenant: where they are, and which booking form they
// run (locales.ts). The two disagree more often than intake would like.
export type Report = {
  id: string;
  receivedAt: string;
  tenant: string;
  channel: 'app' | 'email' | 'form';
  subject: string;
  body: string;
  meta: { browserLocale: string; intakeTag: string };
  mergedInto: number | null;
  mergedAt: string | null;
};

export type Tenant = { handle: string; name: string; locale: string; form: 'booking-v2' | 'booking-v3' };

export type Cause = 'parser' | 'hint';
export const CAUSES: readonly Cause[] = ['parser', 'hint'];

// What booking-v3 printed while the reports in #4471 were arriving. Keep this historical value
// separate from dateHintForTenant: CauseTable uses it to explain the incident after the fix ships.
const HISTORICAL_DATE_HINT: Record<Tenant['form'], string> = {
  'booking-v2': 'DD/MM/YYYY',
  'booking-v3': 'MM/DD/YYYY',
};

// Does this locale write the day before the month? Asked of the platform, never typed in a list.
export function dayFirst(locale: string): boolean {
  const order = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(Date.UTC(2026, 0, 2, 12)))
    .map((p) => p.type);
  return order.indexOf('day') < order.indexOf('month');
}

// The booking form and parser both take their order from the tenant, not a global default.
export function dateHintForTenant(t: Tenant): string {
  return dayFirst(t.locale) ? 'DD/MM/YYYY' : 'MM/DD/YYYY';
}

export type ParsedDate = { year: number; month: number; day: number };

export function parseDateForTenant(value: string, t: Tenant): ParsedDate {
  const parts = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!parts) throw new Error(`Invalid date: ${value}`);

  const [, first, second, year] = parts;
  const day = dayFirst(t.locale) ? Number(first) : Number(second);
  const month = dayFirst(t.locale) ? Number(second) : Number(first);
  if (month < 1 || month > 12 || day < 1 || day > 31) throw new Error(`Invalid date: ${value}`);

  return { year: Number(year), month, day };
}

// The reports below were created before this fix. A day-first tenant's dates came out flipped:
// that is `parser`. Through booking-v3's form the tenant's people type what the hint tells them,
// month first, and the form reads it the tenant's way: that is `hint`, a different bug.
export function causeOf(r: Pick<Report, 'channel'>, t: Tenant | undefined): Cause | null {
  if (!t || !dayFirst(t.locale)) return null;
  return r.channel === 'form' && HISTORICAL_DATE_HINT[t.form].startsWith('MM') ? 'hint' : 'parser';
}

export function sameCause(a: Pick<Report, 'channel'>, ta: Tenant | undefined, b: Pick<Report, 'channel'>, tb: Tenant | undefined): boolean {
  const ca = causeOf(a, ta);
  return ca !== null && ca === causeOf(b, tb);
}

// The ticket system exports in pages that overlap: a report can come twice. One id, one report.
export function uniqueById(reports: Report[]): Report[] {
  return [...new Map(reports.map((r) => [r.id, r])).values()];
}

export type CauseGroup = {
  cause: Cause | 'unplaced';
  reports: Report[];
  // What intake tagged these reports as: tag → count.
  taggedAs: Record<string, number>;
  tenants: number;
  firstSeen: string;
  lastSeen: string;
  mergedInto: number[];
};

export function groupByCause(reports: Report[], tenantOf: (r: Report) => Tenant | undefined): CauseGroup[] {
  const byCause = new Map<CauseGroup['cause'], Report[]>();
  for (const r of reports) {
    const cause = causeOf(r, tenantOf(r)) ?? 'unplaced';
    byCause.set(cause, [...(byCause.get(cause) ?? []), r]);
  }
  return [...byCause.entries()]
    .map(([cause, rs]) => {
      const days = rs.map((r) => r.receivedAt.slice(0, 10)).sort();
      return {
        cause,
        reports: rs,
        taggedAs: rs.reduce<Record<string, number>>((n, r) => ({ ...n, [r.meta.intakeTag]: (n[r.meta.intakeTag] ?? 0) + 1 }), {}),
        tenants: new Set(rs.map((r) => r.tenant)).size,
        firstSeen: days[0],
        lastSeen: days[days.length - 1],
        mergedInto: [...new Set(rs.flatMap((r) => (r.mergedInto ? [r.mergedInto] : [])))],
      };
    })
    .sort((a, b) => b.reports.length - a.reports.length);
}

// A ticket is the cause most of its reports share; the rest were merged into the wrong place.
export function ticketCause(groups: CauseGroup[], ticket: number): CauseGroup['cause'] | null {
  return groups.find((g) => g.mergedInto.includes(ticket))?.cause ?? null;
}

// Reports the desk read differently from their cause (desk-notes.json): counted where they're filed,
// footnoted under it.
export function readAs(g: CauseGroup, ids: readonly string[]): number {
  return g.reports.filter((r) => ids.includes(r.id)).length;
}
