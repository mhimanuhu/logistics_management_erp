/**
 * Number to Indian Rupee Words Converter
 * e.g.  65507.70  →  "SIXTY-FIVE THOUSAND FIVE HUNDRED AND SEVEN RUPEES AND SEVENTY PAISA ONLY"
 */

const ones = [
  "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
  "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
  "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];

const tens = [
  "", "", "TWENTY", "THIRTY", "FORTY", "FIFTY",
  "SIXTY", "SEVENTY", "EIGHTY", "NINETY",
];

function twoDigits(n) {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return tens[t] + (o ? "-" + ones[o] : "");
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h && rest) return ones[h] + " HUNDRED AND " + twoDigits(rest);
  if (h) return ones[h] + " HUNDRED";
  return twoDigits(rest);
}

/**
 * Convert a number to Indian number system words
 * Supports up to 99,99,99,999 (99 crore)
 */
function numberToWords(num) {
  if (num === 0) return "ZERO";

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const hundred = num;

  const parts = [];
  if (crore) parts.push(twoDigits(crore) + " CRORE");
  if (lakh) parts.push(twoDigits(lakh) + " LAKH");
  if (thousand) parts.push(twoDigits(thousand) + " THOUSAND");
  if (hundred) parts.push(threeDigits(hundred));

  return parts.join(" ");
}

/**
 * Convert an amount (with paisa) to words
 * @param {number} amount - e.g. 65507.70
 * @returns {string} - e.g. "SIXTY-FIVE THOUSAND FIVE HUNDRED AND SEVEN RUPEES AND SEVENTY PAISA ONLY"
 */
function amountToWords(amount) {
  const rupees = Math.floor(amount);
  const paisa = Math.round((amount - rupees) * 100);

  let result = numberToWords(rupees) + " RUPEES";
  if (paisa > 0) {
    result += " AND " + numberToWords(paisa) + " PAISA";
  }
  result += " ONLY";

  return result;
}

module.exports = { amountToWords, numberToWords };
