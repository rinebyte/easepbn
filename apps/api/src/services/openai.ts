// src/services/openai.ts
import OpenAI from 'openai'
import { env } from '../config/env'

export interface GeneratedArticle {
  title: string
  content: string
  excerpt: string
  metaTitle: string
  metaDescription: string
  tags: string[]
}

export interface GenerationResult {
  article: GeneratedArticle
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
}

// Pricing per 1M tokens (as of 2024)
const MODEL_PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  'gpt-4o': { inputPer1M: 2.50, outputPer1M: 10.00 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.60 },
  'gpt-4-turbo': { inputPer1M: 10.00, outputPer1M: 30.00 },
  'gpt-4': { inputPer1M: 30.00, outputPer1M: 60.00 },
  'gpt-3.5-turbo': { inputPer1M: 0.50, outputPer1M: 1.50 },
}

function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING['gpt-4o-mini']
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPer1M
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPer1M
  return inputCost + outputCost
}

let openaiClient: OpenAI | null = null

function getClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  }
  return openaiClient
}

export class OpenAIService {
  static async generateArticle(
    systemPrompt: string,
    userPrompt: string,
    model: string = 'gpt-4o-mini',
    maxTokens: number = 4000,
    temperature: number = 0.7
  ): Promise<GenerationResult> {
    const client = getClient()

    const response = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        {
          role: 'system',
          content:
            systemPrompt +
            '\n\nIMPORTANT: You MUST respond with ONLY a valid JSON object. No markdown code blocks, no explanation text, just the raw JSON.',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      response_format: { type: 'json_object' },
    })

    const usage = response.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    const rawContent = response.choices[0]?.message?.content ?? '{}'

    let parsed: Partial<GeneratedArticle>
    try {
      parsed = JSON.parse(rawContent) as Partial<GeneratedArticle>
    } catch {
      throw new Error(`Failed to parse OpenAI JSON response: ${rawContent.slice(0, 200)}`)
    }

    const article: GeneratedArticle = {
      title: parsed.title ?? 'Untitled Article',
      content: parsed.content ?? '',
      excerpt: parsed.excerpt ?? '',
      metaTitle: parsed.metaTitle ?? parsed.title ?? '',
      metaDescription: parsed.metaDescription ?? '',
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    }

    const estimatedCostUsd = calculateCost(model, usage.prompt_tokens, usage.completion_tokens)

    return {
      article,
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      estimatedCostUsd,
    }
  }
}
