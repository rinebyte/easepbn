// src/services/wordpress.ts

export interface WPCategory {
  id: number
  name: string
  slug: string
}

export interface WPTag {
  id: number
  name: string
  slug: string
}

export interface WPPostData {
  title: string
  content: string
  excerpt?: string
  status?: 'publish' | 'draft' | 'pending'
  categories?: number[]
  tags?: number[]
}

export interface WPPost {
  id: number
  link: string
  url?: string
}

function basicAuthHeader(username: string, appPassword: string): string {
  return 'Basic ' + Buffer.from(`${username}:${appPassword}`).toString('base64')
}

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '')
}

export class WordPressService {
  static async testConnection(
    url: string,
    username: string,
    appPassword: string
  ): Promise<{ success: boolean; wpVersion?: string; siteName?: string; error?: string }> {
    try {
      const base = normalizeUrl(url)
      const response = await fetch(`${base}/wp-json/wp/v2/users/me`, {
        headers: {
          Authorization: basicAuthHeader(username, appPassword),
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      // Get WP version from response headers
      const wpVersion = response.headers.get('x-wp-version') ?? undefined

      // Try to get site name from /wp-json endpoint
      let siteName: string | undefined
      try {
        const rootResponse = await fetch(`${base}/wp-json`, {
          signal: AbortSignal.timeout(5_000),
        })
        if (rootResponse.ok) {
          const rootData = (await rootResponse.json()) as { name?: string }
          siteName = rootData.name
        }
      } catch {
        // non-critical
      }

      return { success: true, wpVersion, siteName }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  static async createPost(
    url: string,
    username: string,
    appPassword: string,
    postData: WPPostData
  ): Promise<WPPost> {
    const base = normalizeUrl(url)
    const response = await fetch(`${base}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(username, appPassword),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: postData.title,
        content: postData.content,
        excerpt: postData.excerpt ?? '',
        status: postData.status ?? 'publish',
        categories: postData.categories ?? [],
        tags: postData.tags ?? [],
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      const errorBody = await response.text()
      throw new Error(`WP post creation failed (${response.status}): ${errorBody}`)
    }

    const data = (await response.json()) as { id: number; link: string }
    return { id: data.id, link: data.link, url: data.link }
  }

  /**
   * Delete (trash) a post from WordPress via REST API.
   * Uses ?force=true to permanently delete instead of trashing.
   */
  static async deletePost(
    url: string,
    username: string,
    appPassword: string,
    wpPostId: number,
    force = false
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const base = normalizeUrl(url)
      const response = await fetch(
        `${base}/wp-json/wp/v2/posts/${wpPostId}?force=${force}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: basicAuthHeader(username, appPassword),
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        }
      )

      if (!response.ok) {
        const errorBody = await response.text()
        return { success: false, error: `HTTP ${response.status}: ${errorBody}` }
      }

      return { success: true }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  }

  static async getCategories(
    url: string,
    username: string,
    appPassword: string
  ): Promise<WPCategory[]> {
    const base = normalizeUrl(url)
    const categories: WPCategory[] = []
    let page = 1

    while (true) {
      const response = await fetch(
        `${base}/wp-json/wp/v2/categories?per_page=100&page=${page}`,
        {
          headers: { Authorization: basicAuthHeader(username, appPassword) },
          signal: AbortSignal.timeout(10_000),
        }
      )

      if (!response.ok) break

      const data = (await response.json()) as WPCategory[]
      if (data.length === 0) break

      categories.push(...data)

      const totalPages = parseInt(response.headers.get('x-wp-totalpages') ?? '1', 10)
      if (page >= totalPages) break
      page++
    }

    return categories
  }

  static async resolveCategories(
    url: string,
    username: string,
    appPassword: string,
    names: string[]
  ): Promise<number[]> {
    if (names.length === 0) return []

    const base = normalizeUrl(url)
    const ids: number[] = []

    for (const name of names) {
      // Search for existing category
      const searchResponse = await fetch(
        `${base}/wp-json/wp/v2/categories?search=${encodeURIComponent(name)}&per_page=1`,
        {
          headers: { Authorization: basicAuthHeader(username, appPassword) },
          signal: AbortSignal.timeout(10_000),
        }
      )

      if (searchResponse.ok) {
        const results = (await searchResponse.json()) as WPCategory[]
        const exact = results.find(
          (c) => c.name.toLowerCase() === name.toLowerCase()
        )

        if (exact) {
          ids.push(exact.id)
          continue
        }
      }

      // Create new category
      const createResponse = await fetch(`${base}/wp-json/wp/v2/categories`, {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(username, appPassword),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(10_000),
      })

      if (createResponse.ok) {
        const created = (await createResponse.json()) as WPCategory
        ids.push(created.id)
      }
    }

    return ids
  }

  /**
   * Upload media from a URL to WordPress media library.
   */
  static async uploadMediaFromUrl(
    url: string,
    username: string,
    appPassword: string,
    imageUrl: string,
    altText: string
  ): Promise<number | null> {
    try {
      const base = normalizeUrl(url)

      // Download the image
      const imageResponse = await fetch(imageUrl, {
        signal: AbortSignal.timeout(15_000),
      })
      if (!imageResponse.ok) return null

      const imageBuffer = await imageResponse.arrayBuffer()
      const contentType = imageResponse.headers.get('content-type') ?? 'image/jpeg'
      const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
      const filename = `featured-${Date.now()}.${ext}`

      // Upload to WordPress
      const uploadResponse = await fetch(`${base}/wp-json/wp/v2/media`, {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(username, appPassword),
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type': contentType,
        },
        body: imageBuffer,
        signal: AbortSignal.timeout(30_000),
      })

      if (!uploadResponse.ok) return null

      const mediaData = (await uploadResponse.json()) as { id: number }

      // Set alt text
      await fetch(`${base}/wp-json/wp/v2/media/${mediaData.id}`, {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(username, appPassword),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ alt_text: altText }),
        signal: AbortSignal.timeout(10_000),
      })

      return mediaData.id
    } catch {
      return null
    }
  }

  /**
   * Set the featured image for a WordPress post.
   */
  static async setFeaturedImage(
    url: string,
    username: string,
    appPassword: string,
    wpPostId: number,
    mediaId: number
  ): Promise<boolean> {
    try {
      const base = normalizeUrl(url)
      const response = await fetch(`${base}/wp-json/wp/v2/posts/${wpPostId}`, {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(username, appPassword),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ featured_media: mediaId }),
        signal: AbortSignal.timeout(10_000),
      })

      return response.ok
    } catch {
      return false
    }
  }

  static async resolveTags(
    url: string,
    username: string,
    appPassword: string,
    names: string[]
  ): Promise<number[]> {
    if (names.length === 0) return []

    const base = normalizeUrl(url)
    const ids: number[] = []

    for (const name of names) {
      const searchResponse = await fetch(
        `${base}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}&per_page=1`,
        {
          headers: { Authorization: basicAuthHeader(username, appPassword) },
          signal: AbortSignal.timeout(10_000),
        }
      )

      if (searchResponse.ok) {
        const results = (await searchResponse.json()) as WPTag[]
        const exact = results.find(
          (t) => t.name.toLowerCase() === name.toLowerCase()
        )

        if (exact) {
          ids.push(exact.id)
          continue
        }
      }

      const createResponse = await fetch(`${base}/wp-json/wp/v2/tags`, {
        method: 'POST',
        headers: {
          Authorization: basicAuthHeader(username, appPassword),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
        signal: AbortSignal.timeout(10_000),
      })

      if (createResponse.ok) {
        const created = (await createResponse.json()) as WPTag
        ids.push(created.id)
      }
    }

    return ids
  }
}
