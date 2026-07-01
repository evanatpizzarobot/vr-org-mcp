/**
 * Pure formatters for MCP resources. They turn already-fetched VR.org data into
 * the markdown / HTML a resource read returns, so the formatting is unit-testable
 * without a live fetch (mirrors how src/events.ts and src/match.ts stay pure).
 *
 * Resource URIs:
 *   vrorg://news/latest        vrorg://originals/latest
 *   vrorg://events/upcoming    vrorg://guides
 *   vrorg://article/{slug}     (resource template)
 */

export interface NewsItem {
  title: string | null;
  url: string | null;
  source?: string | null;
  published?: string | null;
}
export interface OriginalItem {
  title: string | null;
  url: string | null;
  author?: string | null;
  published?: string | null;
  snippet?: string | null;
}
export interface EventItem {
  name: string | null;
  start_date?: string | null;
  end_date?: string | null;
  location?: string | null;
  url?: string | null;
}
export interface GuideItem {
  title: string;
  summary: string;
  url: string;
}
export interface ArticleFields {
  title: string | null;
  author?: string | null;
  published?: string | null;
  url?: string | null;
  body_html?: string | null;
}

function dateOnly(d?: string | null): string {
  return typeof d === "string" ? d.slice(0, 10) : "";
}

function metaParens(parts: Array<string | null | undefined>): string {
  const joined = parts.filter(Boolean).join(", ");
  return joined ? ` (${joined})` : "";
}

export function formatNewsIndex(items: NewsItem[]): string {
  const lines = [
    "# Latest VR / AR / XR headlines",
    "",
    "Aggregated live by VR.org from VR-native and filtered general-tech sources.",
    "",
  ];
  const kept = items.filter((it) => it.title);
  for (const it of kept) {
    lines.push(`- [${it.title}](${it.url ?? ""})${metaParens([it.source, dateOnly(it.published)])}`);
  }
  if (kept.length === 0) lines.push("No headlines available right now.");
  return lines.join("\n");
}

export function formatOriginalsIndex(items: OriginalItem[]): string {
  const lines = [
    "# Latest VR.org original articles",
    "",
    "Original reporting, opinion, and guides from the VR.org editorial team. Read any one in full via the vrorg://article/{slug} resource.",
    "",
  ];
  const kept = items.filter((it) => it.title);
  for (const it of kept) {
    lines.push(`- [${it.title}](${it.url ?? ""})${metaParens([it.author, dateOnly(it.published)])}`);
    if (it.snippet) lines.push(`  ${it.snippet}`);
  }
  if (kept.length === 0) lines.push("No articles available.");
  return lines.join("\n");
}

export function formatEventsList(items: EventItem[]): string {
  const lines = [
    "# Upcoming VR / AR / XR events",
    "",
    "From VR.org's industry calendar, soonest first.",
    "",
  ];
  const kept = items.filter((e) => e.name);
  for (const e of kept) {
    const when =
      e.end_date && e.end_date !== e.start_date
        ? `${dateOnly(e.start_date)} to ${dateOnly(e.end_date)}`
        : dateOnly(e.start_date);
    const where = e.location ? `, ${e.location}` : "";
    const link = e.url ? ` ${e.url}` : "";
    lines.push(`- **${e.name}**${when ? ` (${when}${where})` : where ? ` (${where.slice(2)})` : ""}.${link}`);
  }
  if (kept.length === 0) lines.push("No upcoming events listed.");
  return lines.join("\n");
}

export function formatGuidesDoc(guides: GuideItem[]): string {
  const lines = [
    "# VR.org guides: canonical answers",
    "",
    "VR.org's short, authoritative answers to common VR / AR / XR questions, each with its full guide link.",
    "",
  ];
  for (const g of guides) {
    lines.push(`## ${g.title}`, "", g.summary, "", `Guide: ${g.url}`, "");
  }
  return lines.join("\n").trimEnd();
}

export function formatArticle(a: ArticleFields): string {
  const byline = [a.author, dateOnly(a.published)].filter(Boolean).join(", ");
  const header = [
    a.title ? `<h1>${a.title}</h1>` : "",
    byline ? `<p><em>${byline}</em></p>` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const body = a.body_html ?? "";
  const footer = a.url ? `\n<p>Source: <a href="${a.url}">${a.url}</a></p>` : "";
  return `${header}\n${body}${footer}`.trim();
}
