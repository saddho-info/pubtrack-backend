const ISBN13_PATTERN = /^\d{13}$/;
const ISBN10_PATTERN = /^\d{9}[\dX]$/;

export function normalizeIsbn(input: string): string {
  return input.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn13(digits: string): boolean {
  if (!ISBN13_PATTERN.test(digits)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const digit = Number(digits[i]);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }

  const check = (10 - (sum % 10)) % 10;
  return check === Number(digits[12]);
}

export function isValidIsbn10(digits: string): boolean {
  if (!ISBN10_PATTERN.test(digits)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    sum += Number(digits[i]) * (10 - i);
  }

  const remainder = 11 - (sum % 11);
  const check =
    remainder === 11 ? '0' : remainder === 10 ? 'X' : String(remainder);
  return digits[9] === check;
}

export function formatIsbn13(digits: string): string {
  if (!ISBN13_PATTERN.test(digits)) {
    return digits;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 12)}-${digits.slice(12)}`;
}

export function formatIsbn10(digits: string): string {
  if (!ISBN10_PATTERN.test(digits)) {
    return digits;
  }
  return `${digits.slice(0, 1)}-${digits.slice(1, 6)}-${digits.slice(6, 9)}-${digits.slice(9)}`;
}
