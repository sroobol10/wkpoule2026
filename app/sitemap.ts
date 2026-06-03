import type { MetadataRoute } from 'next'

const BASE = 'https://www.mijnwkpoule.nl'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 1,
    },
    {
      url: `${BASE}/registreren`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE}/hoe-werkt-het`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
  ]
}
