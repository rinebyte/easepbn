// src/services/contentVariation.ts

const WRITING_STYLES = [
  'Write in a conversational, friendly tone as if speaking to a friend.',
  'Write in a professional, authoritative tone with expert-level insight.',
  'Write in an academic, well-researched style with detailed analysis.',
  'Write as a practical how-to guide with step-by-step instructions.',
  'Write as a listicle (numbered list format) with clear headings.',
  'Write in a storytelling narrative style, weaving in personal anecdotes.',
  'Write in a Q&A format, answering common questions about the topic.',
  'Write in a comparison/review style, weighing pros and cons.',
  'Write in a beginner-friendly educational tone with simple explanations.',
  'Write in an opinionated editorial style with a strong point of view.',
  'Write as a case study with real-world examples and data.',
  'Write in a news-style journalistic format with the inverted pyramid structure.',
]

const STRUCTURE_VARIATIONS = [
  'Use short paragraphs (2-3 sentences each) for easy scanning.',
  'Include a detailed table of contents at the beginning.',
  'Start with a compelling statistic or surprising fact.',
  'Open with a relatable problem and present the solution.',
  'Use bullet points and subheadings extensively.',
  'Include a summary/TL;DR section at the top.',
  'End with actionable takeaways the reader can implement today.',
  'Weave in relevant quotes from industry experts.',
]

const LENGTH_MODIFIERS = [
  'Keep the article concise, around 800-1000 words.',
  'Write a comprehensive, in-depth article of 1500-2000 words.',
  'Write a medium-length article of 1000-1500 words.',
  'Write a thorough guide of 2000+ words with detailed sections.',
]

/**
 * Track which styles have been used to avoid repeats within a batch.
 */
const usedStylesPerBatch = new Map<string, Set<number>>()

/**
 * Get variation instructions for a specific site in a batch.
 * Uses deterministic-random selection with tracking to avoid repeats.
 */
export function getVariationInstructions(
  siteIndex: number,
  totalSites: number,
  batchId?: string
): string {
  const trackingKey = batchId ?? 'default'

  if (!usedStylesPerBatch.has(trackingKey)) {
    usedStylesPerBatch.set(trackingKey, new Set())
  }
  const usedStyles = usedStylesPerBatch.get(trackingKey)!

  // Pick a style that hasn't been used yet in this batch
  let styleIndex = siteIndex % WRITING_STYLES.length
  while (usedStyles.has(styleIndex) && usedStyles.size < WRITING_STYLES.length) {
    styleIndex = (styleIndex + 1) % WRITING_STYLES.length
  }
  usedStyles.add(styleIndex)

  // Clean up tracking for completed batches
  if (usedStyles.size >= totalSites || usedStyles.size >= WRITING_STYLES.length) {
    // Schedule cleanup
    setTimeout(() => usedStylesPerBatch.delete(trackingKey), 60_000)
  }

  const style = WRITING_STYLES[styleIndex]!
  const structure = STRUCTURE_VARIATIONS[siteIndex % STRUCTURE_VARIATIONS.length]!
  const length = LENGTH_MODIFIERS[siteIndex % LENGTH_MODIFIERS.length]!

  return [
    '\n\n--- Content Style Instructions ---',
    `Style: ${style}`,
    `Structure: ${structure}`,
    `Length: ${length}`,
    'IMPORTANT: Make this article unique and original. Do not follow a template-like pattern.',
  ].join('\n')
}

/**
 * Generate a unique variation seed for article generation.
 */
export function generateVariationSeed(): string {
  return Math.random().toString(36).substring(2, 10)
}
