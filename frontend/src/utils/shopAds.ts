import type { ShopAd } from "../services/api/admin/adminShopAdService";

export function adCalendarDate(value: string | Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (key: string) => parts.find(p => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function adDestination(input?: string): string {
  const link = input?.trim() || "/shop-by-stores";
  if (/^https?:\/\//i.test(link)) {
    try { const url = new URL(link); return url.username || url.password ? "/shop-by-stores" : url.href; }
    catch { return "/shop-by-stores"; }
  }
  if (!link.startsWith("/") || link.startsWith("//") || /[\\\s\u0000-\u001f]/.test(link)) return "/shop-by-stores";
  const url = new URL(link, "https://hellolocal.in");
  if (url.pathname === "/products") {
    const category = url.searchParams.get("category");
    url.searchParams.delete("category");
    return `${category ? `/category/${encodeURIComponent(category)}` : "/search"}${url.searchParams.size ? `?${url.searchParams}` : ""}`;
  }
  return link;
}

export function openAd(input: string | undefined, navigate: (path: string) => void) {
  const link = adDestination(input);
  if (/^https?:\/\//i.test(link)) window.open(link, "_blank", "noopener,noreferrer");
  else navigate(link);
}

export function isShopAdLive(ad: ShopAd, now = Date.now()) {
  if (!ad.isActive) return false;
  const start = ad.startDate ? Date.parse(ad.startDate) : null;
  const end = ad.endDate || ad.expiresAt;
  return (start === null || (Number.isFinite(start) && start <= now)) &&
    (!end || (Number.isFinite(Date.parse(end)) && Date.parse(end) > now));
}

export function shopAdStatus(ad: ShopAd, now = Date.now()) {
  const end = ad.endDate || ad.expiresAt;
  if (end && Date.parse(end) <= now) return "Expired";
  if (!ad.isActive) return "Paused";
  return ad.startDate && Date.parse(ad.startDate) > now ? "Scheduled" : "Live";
}
