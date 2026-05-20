import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// Money values from the ERP API are int64 cents (see backend/internal/order/model.go
// and the "Money: stored in cents (integer) in application code" convention in
// CLAUDE.md). Use this helper everywhere on the ERP side that renders an amount
// to dollars. Returns a string with a leading "$" and 2 decimals (e.g. 738807 -> "$7,388.07").
// Portal-side amounts already arrive as dollars (float) — use the portal's own
// formatCurrency helper there, not this one.
export function formatCents(cents: number | null | undefined): string {
    const n = typeof cents === 'number' && isFinite(cents) ? cents : 0;
    return `$${(n / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
