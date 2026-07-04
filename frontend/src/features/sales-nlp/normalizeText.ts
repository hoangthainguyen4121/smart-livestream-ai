const SLANG_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bbn\b/g, "bao nhieu"],
  [/\bbnhieu\b/g, "bao nhieu"],
  [/\bbao nhiu\b/g, "bao nhieu"],
  [/\bnhiu\b/g, "nhieu"],
  [/\bnhiu tien\b/g, "bao nhieu tien"],
  [/\bib gia\b/g, "gia bao nhieu"],
  [/\bcon k\b/g, "con khong"],
  [/\bcon ko\b/g, "con khong"],
  [/\bcon hok\b/g, "con khong"],
  [/\bcon hong\b/g, "con khong"],
  [/\bcòn k\b/g, "con khong"],
  [/\bcòn ko\b/g, "con khong"],
  [/\bcòn hok\b/g, "con khong"],
  [/\bcòn hông\b/g, "con khong"],
  [/\bmau den k\b/g, "mau den khong"],
  [/\bfreeship k\b/g, "freeship khong"],
  [/\bdc k\b/g, "duoc khong"],
  [/\bship sg dc k\b/g, "ship sg duoc khong"],
  [/\blink dau\b/g, "xin link"],
  [/\bship hn\b/g, "ship ha noi"],
  [/\btp hcm\b/g, "tp ho chi minh"],
  [/\bde em 1 cai\b/g, "lay 1 cai"],
  [/\bnhieu tien\b/g, "bao nhieu tien"],
  [/\bfreeship\b/g, "mien phi ship"],
];

export function normalizeText(comment: string): string {
  let text = comment
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0111/g, "d");

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
