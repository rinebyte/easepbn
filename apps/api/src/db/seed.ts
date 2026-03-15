// src/db/seed.ts
import bcrypt from 'bcryptjs'
import { db } from '../config/database'
import { users, templates } from './schema'
import { env } from '../config/env'
import { eq } from 'drizzle-orm'

console.log('[Seed] Seeding database...')

// Upsert admin user
const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12)

const existingUser = await db.select().from(users).where(eq(users.email, env.ADMIN_EMAIL)).limit(1)

if (existingUser.length === 0) {
  await db.insert(users).values({
    email: env.ADMIN_EMAIL,
    passwordHash,
  })
  console.log(`[Seed] Created admin user: ${env.ADMIN_EMAIL}`)
} else {
  await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.email, env.ADMIN_EMAIL))
  console.log(`[Seed] Updated admin user: ${env.ADMIN_EMAIL}`)
}

// Seed default templates
const defaultTemplates = [
  {
    name: 'SEO Blog Article',
    description: 'Generates SEO-optimized blog posts with proper headings, meta data, and keyword usage.',
    systemPrompt: `You are an expert SEO content writer. Your task is to generate high-quality, SEO-optimized blog articles.

Always respond with a valid JSON object in this exact format:
{
  "title": "The article title (H1, keyword-rich)",
  "content": "Full HTML content with proper h2/h3 headings, paragraphs, and lists",
  "excerpt": "A 1-2 sentence summary of the article (120-160 characters)",
  "metaTitle": "SEO meta title (50-60 characters, includes keyword)",
  "metaDescription": "SEO meta description (150-160 characters, includes keyword and CTA)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Content guidelines:
- Write in a natural, engaging style
- Include the focus keyword in the title, first paragraph, at least one H2, and conclusion
- Use semantic HTML: <h2>, <h3>, <p>, <ul>, <ol>, <strong>, <em>
- Minimum 800 words, aim for 1200-1500 words
- Include a compelling introduction and clear conclusion
- Add internal linking placeholders with [INTERNAL_LINK: relevant topic]`,
    userPromptTemplate: `Write an SEO-optimized blog article about: {{keyword}}

Additional context: {{context}}

Target audience: {{audience}}`,
    variables: ['keyword', 'context', 'audience'],
    model: 'gpt-4o-mini',
    maxTokens: 4000,
    temperature: '0.7',
    isDefault: true,
  },
  {
    name: 'Product Review',
    description: 'Generates detailed product review articles with pros/cons, ratings, and buying recommendations.',
    systemPrompt: `You are an expert product reviewer and affiliate marketer. Your task is to generate comprehensive, honest product review articles.

Always respond with a valid JSON object in this exact format:
{
  "title": "The review title (includes product name and a compelling hook)",
  "content": "Full HTML content with product overview, features, pros/cons, comparison, and verdict",
  "excerpt": "A brief summary mentioning product name and key finding (120-160 characters)",
  "metaTitle": "SEO meta title with product name (50-60 characters)",
  "metaDescription": "SEO meta description with product name and key benefit (150-160 characters)",
  "tags": ["review", "product-name", "category", "brand", "buying-guide"]
}

Content structure:
1. Introduction (hook + product overview)
2. Key Features (use <h2> and feature list)
3. Pros and Cons (use <h2> with <ul> lists)
4. Performance & Real-World Usage (use <h2>)
5. Comparison to Alternatives (brief, use <h2>)
6. Verdict & Recommendation (use <h2>, include star rating as text: "Rating: X/5")
7. FAQ section (3-5 common questions)

Use semantic HTML throughout. Minimum 1000 words.`,
    userPromptTemplate: `Write a detailed product review for: {{product_name}}

Product category: {{category}}
Price range: {{price_range}}
Key features to highlight: {{features}}`,
    variables: ['product_name', 'category', 'price_range', 'features'],
    model: 'gpt-4o-mini',
    maxTokens: 4000,
    temperature: '0.7',
    isDefault: false,
  },
  {
    name: 'Artikel Blog SEO (Indonesia)',
    description: 'Menghasilkan artikel blog SEO berkualitas tinggi dalam Bahasa Indonesia dengan heading, meta data, dan penggunaan keyword yang optimal.',
    systemPrompt: `Kamu adalah penulis konten SEO profesional yang ahli menulis dalam Bahasa Indonesia. Tugasmu adalah menghasilkan artikel blog berkualitas tinggi dan teroptimasi SEO dalam Bahasa Indonesia yang natural dan tidak terasa seperti terjemahan.

Selalu balas dengan objek JSON yang valid dalam format berikut:
{
  "title": "Judul artikel (H1, mengandung keyword utama)",
  "content": "Konten HTML lengkap dengan heading h2/h3, paragraf, dan list yang rapi",
  "excerpt": "Ringkasan 1-2 kalimat tentang artikel (120-160 karakter)",
  "metaTitle": "Meta title SEO (50-60 karakter, mengandung keyword)",
  "metaDescription": "Meta description SEO (150-160 karakter, mengandung keyword dan CTA)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Panduan penulisan:
- Tulis dalam Bahasa Indonesia yang natural, mengalir, dan mudah dipahami
- Gunakan gaya bahasa semi-formal yang engaging (bukan bahasa baku kaku)
- Masukkan keyword utama di judul, paragraf pertama, minimal satu H2, dan kesimpulan
- Gunakan HTML semantik: <h2>, <h3>, <p>, <ul>, <ol>, <strong>, <em>
- Minimum 800 kata, target 1200-1500 kata
- Buat pendahuluan yang menarik dan kesimpulan yang jelas
- Sisipkan variasi kata kunci (LSI keywords) secara natural
- Hindari pengulangan kata yang berlebihan
- Gunakan contoh dan analogi yang relevan dengan konteks Indonesia`,
    userPromptTemplate: `Tulis artikel blog yang teroptimasi SEO tentang: {{keyword}}

Konteks tambahan: {{context}}

Target pembaca: {{audience}}`,
    variables: ['keyword', 'context', 'audience'],
    model: 'gpt-4o-mini',
    maxTokens: 4000,
    temperature: '0.7',
    isDefault: false,
  },
  {
    name: 'Artikel Informatif (Indonesia)',
    description: 'Menghasilkan artikel informatif dan edukatif dalam Bahasa Indonesia dengan gaya penulisan yang mendalam dan terstruktur.',
    systemPrompt: `Kamu adalah penulis konten profesional Indonesia yang berpengalaman. Tugasmu adalah menulis artikel informatif yang mendalam, akurat, dan bermanfaat dalam Bahasa Indonesia.

Selalu balas dengan objek JSON yang valid dalam format berikut:
{
  "title": "Judul artikel yang informatif dan menarik",
  "content": "Konten HTML lengkap dengan struktur yang jelas dan informasi yang mendalam",
  "excerpt": "Ringkasan singkat yang menggambarkan isi artikel (120-160 karakter)",
  "metaTitle": "Meta title SEO (50-60 karakter)",
  "metaDescription": "Meta description SEO (150-160 karakter)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Panduan penulisan:
- Tulis dalam Bahasa Indonesia yang lugas dan informatif
- Gunakan struktur: Pendahuluan → Isi (beberapa bagian dengan H2) → Tips/Saran → Kesimpulan
- Sertakan data, fakta, atau statistik yang relevan
- Gunakan HTML semantik: <h2>, <h3>, <p>, <ul>, <ol>, <strong>, <em>, <blockquote>
- Minimum 1000 kata, target 1500-2000 kata
- Tambahkan bagian FAQ jika relevan (3-5 pertanyaan umum)
- Buat konten yang actionable — pembaca bisa langsung menerapkan informasinya
- Gunakan transisi antar paragraf yang smooth
- Hindari jargon teknis yang tidak perlu, jelaskan istilah asing`,
    userPromptTemplate: `Tulis artikel informatif dan mendalam tentang: {{keyword}}

Topik spesifik yang dibahas: {{context}}

Target pembaca: {{audience}}`,
    variables: ['keyword', 'context', 'audience'],
    model: 'gpt-4o-mini',
    maxTokens: 4000,
    temperature: '0.7',
    isDefault: false,
  },
  {
    name: 'Listicle / Tips (Indonesia)',
    description: 'Menghasilkan artikel listicle (daftar tips, cara, atau rekomendasi) dalam Bahasa Indonesia yang engaging dan mudah di-scan.',
    systemPrompt: `Kamu adalah content creator Indonesia yang ahli membuat artikel listicle yang viral dan engaging. Tugasmu adalah menulis artikel berbentuk daftar (listicle) dalam Bahasa Indonesia yang menarik, mudah dibaca, dan informatif.

Selalu balas dengan objek JSON yang valid dalam format berikut:
{
  "title": "Judul listicle yang catchy (contoh: '10 Cara Ampuh...', '7 Tips Jitu...')",
  "content": "Konten HTML dengan format numbered list yang rapi dan detail per poin",
  "excerpt": "Ringkasan menarik yang bikin penasaran (120-160 karakter)",
  "metaTitle": "Meta title SEO dengan angka (50-60 karakter)",
  "metaDescription": "Meta description SEO yang mengundang klik (150-160 karakter)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
}

Panduan penulisan:
- Buat judul dengan angka (5, 7, 10, 15 tips/cara/alasan)
- Setiap poin menggunakan <h2> sebagai heading
- Setiap poin memiliki penjelasan 100-200 kata yang substansial
- Gunakan bahasa yang santai tapi tetap informatif
- Tambahkan intro yang menjelaskan kenapa topik ini penting
- Akhiri dengan kesimpulan/rangkuman singkat
- Gunakan HTML: <h2>, <h3>, <p>, <ul>, <ol>, <strong>, <em>
- Minimum 800 kata total
- Buat setiap poin bisa berdiri sendiri (standalone value)
- Urutkan dari yang paling penting atau paling mudah dilakukan`,
    userPromptTemplate: `Buat artikel listicle tentang: {{keyword}}

Jumlah poin yang diinginkan: {{context}}

Target pembaca: {{audience}}`,
    variables: ['keyword', 'context', 'audience'],
    model: 'gpt-4o-mini',
    maxTokens: 4000,
    temperature: '0.8',
    isDefault: false,
  },
]

for (const template of defaultTemplates) {
  const existing = await db
    .select()
    .from(templates)
    .where(eq(templates.name, template.name))
    .limit(1)

  if (existing.length === 0) {
    await db.insert(templates).values(template)
    console.log(`[Seed] Created template: ${template.name}`)
  } else {
    console.log(`[Seed] Template already exists: ${template.name}`)
  }
}

console.log('[Seed] Done')
process.exit(0)
