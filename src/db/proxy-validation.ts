import type { PayeeType } from './repository';

/**
 * Proxy validation and normalization for PayNow references.
 * Mobile numbers and UENs (Unique Entity Numbers).
 */

// ============================================================================
// Mobile Number Validation
// ============================================================================

/**
 * Validates and normalizes a Singapore mobile number.
 * Accepts: 8-digit local (starting with 6/8/9) or +65XXXXXXXX format.
 * Returns: Normalized +65XXXXXXXX format, or null if invalid.
 */
export function normalizeMobile(input: string): string | null {
  if (typeof input !== 'string') return null;
  
  const trimmed = input.trim();
  if (!trimmed) return null;
  
  // Remove all non-digit characters except leading +
  const cleaned = trimmed.replace(/[^0-9+]/g, '');
  
  // Handle +65XXXXXXXX format
  if (cleaned.startsWith('+65')) {
    const digits = cleaned.slice(3);
    if (/^[689]\d{7}$/.test(digits)) {
      return `+65${digits}`;
    }
    return null;
  }
  
  // Handle 65XXXXXXXX format (without +)
  if (cleaned.startsWith('65') && cleaned.length === 10) {
    const digits = cleaned.slice(2);
    if (/^[689]\d{7}$/.test(digits)) {
      return `+65${digits}`;
    }
    return null;
  }
  
  // Handle 8-digit local format
  if (/^[689]\d{7}$/.test(cleaned)) {
    return `+65${cleaned}`;
  }
  
  return null;
}

// ============================================================================
// UEN Validation
// ============================================================================

/**
 * Validates a Singapore UEN (Unique Entity Number).
 * Rules:
 * - 9-13 characters (alphanumeric)
 * - Must start with a letter or digit
 * - No special characters except hyphens
 * 
 * Returns: true if valid, false otherwise.
 */
export function isValidUEN(input: string): boolean {
  if (typeof input !== 'string') return false;
  
  const trimmed = input.trim();
  if (!trimmed) return false;
  
  // UEN format: 9-13 alphanumeric characters (with optional hyphens)
  // Examples: 201234567A, T09XX0000L, S12FC0001A
  const uenRegex = /^[A-Z0-9\-]{9,13}$/i;
  
  if (!uenRegex.test(trimmed)) return false;
  
  // Must start with a letter or digit
  if (!/^[A-Z0-9]/i.test(trimmed)) return false;
  
  return true;
}

// ============================================================================
// Proxy Type Detection
// ============================================================================

/**
 * Detects the proxy type (mobile or UEN) from an input string.
 * Returns: { type: 'mobile' | 'uen', normalized: string } or null if invalid.
 */
export function detectProxyType(input: string): { type: PayeeType; normalized: string } | null {
  // Try mobile first
  const mobile = normalizeMobile(input);
  if (mobile) {
    return { type: 'mobile', normalized: mobile };
  }
  
  // Try UEN
  if (isValidUEN(input)) {
    return { type: 'uen', normalized: input.trim().toUpperCase() };
  }
  
  return null;
}

// ============================================================================
// Reference Generator
// ============================================================================

/**
 * Base32 alphabet (RFC 4648, no padding).
 */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Generates a 10-character base32 reference string using crypto.getRandomValues.
 * This is cryptographically random and suitable for payment references.
 */
export function generateRef(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  
  let result = '';
  for (let i = 0; i < 10; i++) {
    const index = bytes[i]! & 31; // 5 bits (0-31)
    result += BASE32_ALPHABET[index];
  }
  
  return result;
}
