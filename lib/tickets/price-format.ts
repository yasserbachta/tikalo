// Format mimicry for the resale price overlay (see overlay-price.ts). The
// replacement amount should look native to the carrier's document: same
// thousands/decimal separators, same decimal count, and the currency token in
// the same position with the same spacing. We derive all of that from the
// matched printed text itself ("DZD 100180.00" → prefix "DZD ", dot decimals;
// "97.086,16D" → dot thousands, comma decimals, attached "D" suffix) rather
// than from a currency list, so any carrier style is reproduced verbatim.

interface AmountParts {
  intDigits: string;
  decDigits: string;
}

interface AmountFormat extends AmountParts {
  thousandsSep: string; // "" when the document shows no grouping
  decimalSep: string; // "" when the document shows no decimals
}

// Split "<prefix><numeric core><suffix>" where the core starts and ends on a
// digit. Returns null when there is no digit at all.
function splitCore(
  text: string,
): { prefix: string; core: string; suffix: string } | null {
  const m = text.match(/^([^\d]*?)(\d[\d.,\s ]*\d|\d)([^\d]*)$/);
  if (!m) return null;
  return { prefix: m[1], core: m[2], suffix: m[3] };
}

// Parse a numeric core like "97.086,16" / "12 500,00" / "100180.00" / "1.234".
// Heuristics: a trailing group of 1-2 digits after '.'/',' is a decimal
// fraction; a single separator followed by exactly 3 digits is a thousands
// separator (prices here are ≥ 4 digits far more often than they carry
// 3-decimal precision); spaces are always thousands separators. Returns null
// when the grouping is inconsistent (caller falls back to plain formatting).
export function parseAmountCore(core: string): AmountFormat | null {
  const s = core.trim();
  if (!/^\d[\d.,\s]*\d$|^\d$/.test(s)) return null;

  const groups: string[] = [];
  const seps: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\d/.test(ch)) {
      cur += ch;
      continue;
    }
    if (cur === "") {
      // Two separators in a row (e.g. ". ,") — not a number format we trust.
      return null;
    }
    groups.push(cur);
    cur = "";
    // Normalize any whitespace separator (incl. NBSP) to a plain space.
    seps.push(/\s/.test(ch) ? " " : ch);
  }
  groups.push(cur);

  if (seps.length === 0) {
    return { intDigits: groups[0], decDigits: "", thousandsSep: "", decimalSep: "" };
  }

  const lastSep = seps[seps.length - 1];
  const lastGroup = groups[groups.length - 1];
  const lastIsDecimal =
    lastSep !== " " && lastGroup.length >= 1 && lastGroup.length <= 2;

  const decDigits = lastIsDecimal ? lastGroup : "";
  const decimalSep = lastIsDecimal ? lastSep : "";
  const intGroups = lastIsDecimal ? groups.slice(0, -1) : groups;
  const intSeps = lastIsDecimal ? seps.slice(0, -1) : seps;

  // Whatever separates the integer groups is the thousands separator; it must
  // be consistent and every group after the first must have exactly 3 digits.
  let thousandsSep = "";
  if (intSeps.length > 0) {
    thousandsSep = intSeps[0];
    for (const sep of intSeps) {
      if (sep !== thousandsSep) return null;
    }
    for (let g = 1; g < intGroups.length; g++) {
      if (intGroups[g].length !== 3) return null;
    }
    if (thousandsSep === decimalSep) return null;
  }

  return {
    intDigits: intGroups.join(""),
    decDigits,
    thousandsSep,
    decimalSep,
  };
}

function groupThousands(intDigits: string, sep: string): string {
  if (!sep) return intDigits;
  let out = "";
  for (let i = 0; i < intDigits.length; i++) {
    const fromEnd = intDigits.length - i;
    if (out && fromEnd % 3 === 0) out += sep;
    out += intDigits[i];
  }
  return out;
}

/**
 * Render `newPrice` in the exact style of `matchedText` (the carrier's printed
 * price as found in the PDF). Returns `fallback` when either side can't be
 * parsed confidently.
 */
export function mimicPriceFormat(
  matchedText: string,
  newPrice: string,
  fallback: string,
): string {
  const matched = splitCore(matchedText);
  if (!matched) return fallback;
  const docFormat = parseAmountCore(matched.core);
  if (!docFormat) return fallback;

  const next = splitCore(newPrice);
  if (!next) return fallback;
  const nextAmount = parseAmountCore(next.core);
  if (!nextAmount) return fallback;

  const intDigits = nextAmount.intDigits.replace(/^0+(?=\d)/, "");
  // Match the document's decimal count, but never round away extra precision
  // the agency typed — that would silently change the price.
  const decCount = Math.max(docFormat.decDigits.length, nextAmount.decDigits.length);
  const decDigits = nextAmount.decDigits.padEnd(decCount, "0");

  let out = groupThousands(intDigits, docFormat.thousandsSep);
  if (decDigits) {
    // The document may print no decimals at all; pick a separator that can't
    // collide with its thousands separator.
    const decimalSep =
      docFormat.decimalSep || (docFormat.thousandsSep === "." ? "," : ".");
    out += decimalSep + decDigits;
  }

  return matched.prefix + out + matched.suffix;
}
