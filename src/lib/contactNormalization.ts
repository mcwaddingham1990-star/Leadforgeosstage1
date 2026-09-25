/**
 * Contact-data normalization helpers used at UI/save/PDF boundaries.
 *
 * Mobile autofill/input-method replay can occasionally append the same
 * phone value to itself. For a single-phone field, collapse only an exact
 * duplicated half when that half itself contains a plausible phone number.
 */
export function normalizeContactPhone(value: string | undefined | null): string {
  let current = String(value || "").trim();
  while (current.length > 1 && current.length % 2 === 0) {
    const half = current.slice(0, current.length / 2);
    if (half !== current.slice(current.length / 2)) break;
    const digits = half.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) break;
    current = half;
  }
  return current;
}

/**
 * Older estimate code synthesized "<customer name> Inc" whenever the
 * company field was blank. Suppress only that exact historical fallback
 * when rendering customer-facing documents.
 */
export function normalizeEstimateCompany(customerName: string, company: string | undefined | null): string {
  const cleanCompany = String(company || "").trim();
  if (!cleanCompany) return "";
  const synthetic = `${String(customerName || "").trim()} Inc`.trim();
  return cleanCompany.localeCompare(synthetic, undefined, { sensitivity: "accent" }) === 0 ? "" : cleanCompany;
}
