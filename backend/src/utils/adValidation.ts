import { adError } from "../services/adLifecycleService";

export function validAdDate(value: unknown, name = "Date"): Date {
  const date = new Date(value as string);
  if (!value || !Number.isFinite(date.getTime())) adError(`${name} is invalid.`);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && date.toISOString().slice(0, 10) !== value) {
    adError(`${name} is invalid.`);
  }
  return date;
}

export function validAdDuration(value: unknown): number {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 365) adError("Duration must be between 1 and 365 whole days.");
  return days;
}

export function validAdLink(value: unknown, fallback = "/shop-by-stores"): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || value.length > 2048) adError("Invalid advertisement destination.");
  const link = (value as string).trim();
  if (/[\s\\\u0000-\u001f]/.test(link)) adError("Invalid advertisement destination.");
  if (/^https?:\/\//i.test(link)) {
    try { const url = new URL(link); if (url.username || url.password) adError("Invalid destination."); return url.href; }
    catch { adError("Invalid advertisement URL."); }
  }
  if (!link.startsWith("/") || link.startsWith("//")) adError("Use a site path or an https:// URL.");
  return link;
}

export function validateAdContent(data: any) {
  for (const key of ["shopName", "tagline", "imageUrl"]) {
    if (typeof data[key] !== "string" || !data[key].trim()) adError("Shop name, tagline and image are required.");
  }
  if (data.shopName.length > 200 || data.tagline.length > 500 || (data.description?.length ?? 0) > 2000) {
    adError("Advertisement text is too long.");
  }
  // Existing local /assets images remain supported alongside uploaded HTTPS images.
  validAdLink(data.imageUrl);
}
