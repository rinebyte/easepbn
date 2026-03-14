// src/services/imageGeneration.ts

const PEXELS_API_KEY = process.env.PEXELS_API_KEY ?? ''
const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY ?? ''

interface ImageResult {
  url: string
  alt: string
  source: 'pexels' | 'unsplash'
  photographerName?: string
  photographerUrl?: string
}

export class ImageGenerationService {
  /**
   * Search for a relevant stock photo based on keyword.
   * Tries Pexels first, falls back to Unsplash.
   */
  static async findImage(keyword: string): Promise<ImageResult | null> {
    if (PEXELS_API_KEY) {
      const result = await this.searchPexels(keyword)
      if (result) return result
    }

    if (UNSPLASH_ACCESS_KEY) {
      const result = await this.searchUnsplash(keyword)
      if (result) return result
    }

    return null
  }

  private static async searchPexels(query: string): Promise<ImageResult | null> {
    try {
      const response = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
        {
          headers: { Authorization: PEXELS_API_KEY },
          signal: AbortSignal.timeout(10_000),
        }
      )

      if (!response.ok) return null

      const data = (await response.json()) as {
        photos: Array<{
          src: { large: string }
          alt: string
          photographer: string
          photographer_url: string
        }>
      }

      if (!data.photos?.length) return null

      // Pick a random photo from results for variety
      const photo = data.photos[Math.floor(Math.random() * data.photos.length)]!
      return {
        url: photo.src.large,
        alt: photo.alt || query,
        source: 'pexels',
        photographerName: photo.photographer,
        photographerUrl: photo.photographer_url,
      }
    } catch {
      return null
    }
  }

  private static async searchUnsplash(query: string): Promise<ImageResult | null> {
    try {
      const response = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
        {
          headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
          signal: AbortSignal.timeout(10_000),
        }
      )

      if (!response.ok) return null

      const data = (await response.json()) as {
        results: Array<{
          urls: { regular: string }
          alt_description: string
          user: { name: string; links: { html: string } }
        }>
      }

      if (!data.results?.length) return null

      const photo = data.results[Math.floor(Math.random() * data.results.length)]!
      return {
        url: photo.urls.regular,
        alt: photo.alt_description || query,
        source: 'unsplash',
        photographerName: photo.user.name,
        photographerUrl: photo.user.links.html,
      }
    } catch {
      return null
    }
  }
}
