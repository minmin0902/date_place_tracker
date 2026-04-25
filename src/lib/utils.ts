import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateInviteCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// All dates in this app are visit-day stamps with no time component, so we
// pin them to America/New_York (EST/EDT) when formatting. That way the
// label reads the same regardless of the viewer's timezone — a YYYY-MM-DD
// stored value won't shift across the date line for non-US users.
const APP_TIMEZONE = "America/New_York";

// Resolve the canonical list of categories for a place / food. Reads
// `categories` first (the multi-select source of truth), falls back
// to a 1-element array of the legacy `category` for rows that haven't
// been migrated. Returns [] when there are no categories assigned.
export function getCategories(item: {
  category?: string | null;
  categories?: string[] | null;
}): string[] {
  if (item.categories && item.categories.length > 0) {
    return item.categories;
  }
  if (item.category) return [item.category];
  return [];
}

// Swap "my" / "partner" rating per viewer so each member of the couple
// always sees their own rating in the "내 별점 / 我的评分" slot. Storage
// convention: `my_rating` belongs to the food's `created_by` user;
// `partner_rating` belongs to the other partner. Legacy rows where
// created_by is null fall back to the as-stored values.
export function ratingsForViewer(
  food: {
    my_rating: number | null;
    partner_rating: number | null;
    created_by?: string | null;
  },
  viewerId: string | undefined
): { myRating: number | null; partnerRating: number | null } {
  if (!viewerId || !food.created_by) {
    return {
      myRating: food.my_rating,
      partnerRating: food.partner_rating,
    };
  }
  const isCreator = food.created_by === viewerId;
  return isCreator
    ? { myRating: food.my_rating, partnerRating: food.partner_rating }
    : { myRating: food.partner_rating, partnerRating: food.my_rating };
}

export function formatDate(date: string | Date, locale: string) {
  let d: Date;
  if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // Anchor a bare YYYY-MM-DD at noon UTC so the EST representation lands
    // squarely on the same calendar day everywhere.
    const [y, m, day] = date.split("-").map(Number);
    d = new Date(Date.UTC(y, m - 1, day, 12));
  } else {
    d = typeof date === "string" ? new Date(date) : date;
  }
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: APP_TIMEZONE,
  }).format(d);
}
