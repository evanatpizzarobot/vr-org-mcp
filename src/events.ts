/**
 * Pure helpers for the events tool. Kept out of the network layer so the
 * upcoming-filter, sort, and cap logic can be unit-tested without a live fetch
 * (mirrors how matchHeadset is a pure, tested helper).
 */

export interface RawEvent {
  id?: string;
  name?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  venue?: string;
  url?: string;
  category?: string;
  featured?: boolean;
}

export interface MappedEvent {
  name: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  venue: string | null;
  url: string | null;
  category: string | null;
  featured: boolean;
}

export function mapEvent(e: RawEvent): MappedEvent {
  return {
    name: e.name ?? null,
    description: e.description ?? null,
    start_date: e.startDate ?? null,
    end_date: e.endDate ?? null,
    location: e.location ?? null,
    venue: e.venue ?? null,
    url: e.url ?? null,
    category: e.category ?? null,
    featured: e.featured ?? false,
  };
}

/**
 * Filter to upcoming events (unless includePast), sort soonest-first, and cap
 * at limit. `today` is an ISO date (YYYY-MM-DD); an event counts as upcoming
 * when its end date, or its start date when it has no end, is today or later,
 * so multi-day events currently running are still returned.
 */
export function selectEvents(
  raw: unknown,
  opts: { today: string; includePast: boolean; limit: number },
): { items: MappedEvent[]; total: number } {
  const events: RawEvent[] = Array.isArray(raw) ? raw : [];
  let list = events.filter(
    (e): e is RawEvent => !!e && typeof e.startDate === "string",
  );
  if (!opts.includePast) {
    list = list.filter((e) => String(e.endDate ?? e.startDate) >= opts.today);
  }
  list.sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));
  const total = list.length;
  const limit = Number.isFinite(opts.limit) && opts.limit > 0 ? Math.floor(opts.limit) : 0;
  const items = list.slice(0, limit).map(mapEvent);
  return { items, total };
}
