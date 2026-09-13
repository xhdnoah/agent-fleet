const SECRET_KEY = /(api[-_]?key|access[-_]?token|auth(?:orization)?|secret|password|credential)/i;
const TOKEN_PATTERNS = [
  { pattern: /\bsk-[A-Za-z0-9_-]{12,}\b/g, replacement: "[REDACTED]" },
  { pattern: /\bgh[opusr]_[A-Za-z0-9]{20,}\b/g, replacement: "[REDACTED]" },
  { pattern: /(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, replacement: "$1[REDACTED]" }
];

export function redactText(value) {
  let result = String(value);
  for (const { pattern, replacement } of TOKEN_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function redactValue(value, key = "") {
  if (SECRET_KEY.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redactValue(child, childKey)]));
  }
  return value;
}
