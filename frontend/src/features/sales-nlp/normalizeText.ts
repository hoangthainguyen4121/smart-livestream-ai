const SLANG_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bbn\b/g, "bao nhieu"],
  [/\bbnhieu\b/g, "bao nhieu"],
  [/\bbao nhiu\b/g, "bao nhieu"],
  [/\bnhiu\b/g, "nhieu"],
  [/\bcòn k\b/g, "con khong"],
  [/\bcòn ko\b/g, "con khong"],
  [/\bcòn hok\b/g, "con khong"],
  [/\bmau den k\b/g, "mau den khong"],
  [/\blink dau\b/g, "xin link"],
  [/\bship hn\b/g, "ship ha noi"],
  [/\btp hcm\b/g, "tp ho chi minh"],
];

export function normalizeText(comment: string): string {
  let text = comment
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const [pattern, replacement] of SLANG_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  return text
    .replace(/[?!.,…]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeToken(value: string): string {
  return normalizeText(value);
}
