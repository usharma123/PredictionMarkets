export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

export function calculateSimilarity(a: string, b: string): number {
  const normalizedA = normalizeTitle(a)
  const normalizedB = normalizeTitle(b)

  if (normalizedA === normalizedB) return 1
  if (!normalizedA || !normalizedB) return 0

  const distance = levenshteinDistance(normalizedA, normalizedB)
  const maxLength = Math.max(normalizedA.length, normalizedB.length)

  if (maxLength === 0) return 1

  return 1 - distance / maxLength
}

export function extractKeywords(title: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "will", "be", "to", "in", "on", "at",
    "for", "of", "by", "with", "if", "or", "and", "this", "that",
  ])

  return normalizeTitle(title)
    .split(" ")
    .filter((word) => word.length > 2 && !stopWords.has(word))
}

export function keywordOverlap(a: string, b: string): number {
  const keywordsA = new Set(extractKeywords(a))
  const keywordsB = new Set(extractKeywords(b))

  if (keywordsA.size === 0 || keywordsB.size === 0) return 0

  let overlap = 0
  for (const word of keywordsA) {
    if (keywordsB.has(word)) overlap++
  }

  return overlap / Math.min(keywordsA.size, keywordsB.size)
}
