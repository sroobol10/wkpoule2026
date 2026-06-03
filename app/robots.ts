import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/login', '/registreren'],
        disallow: '/',  // rest vereist login
      },
    ],
    sitemap: 'https://www.mijnwkpoule.nl/sitemap.xml',
  }
}
