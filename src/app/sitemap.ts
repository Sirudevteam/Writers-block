import type { MetadataRoute } from "next"

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://writersblock.siru.ai"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/editor`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ]
}
