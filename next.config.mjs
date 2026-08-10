/** @type {import('next').NextConfig} */

// boreaapp.com is served by this same project rather than a second app: the
// Borea pages live under /borea, and these rewrites let the apex domain serve
// them at clean top-level URLs. Shared pages (privacy, terms, support) already
// cover Borea, so they're reached directly rather than duplicated.
const BOREA_HOST = '(www\\.)?boreaapp\\.com'

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/',
          has: [{ type: 'host', value: BOREA_HOST }],
          destination: '/borea',
        },
        // Borea has its own privacy policy and terms now, so the apex serves
        // those rather than the studio-wide pages.
        {
          source: '/privacy',
          has: [{ type: 'host', value: BOREA_HOST }],
          destination: '/borea/privacy',
        },
        {
          source: '/terms',
          has: [{ type: 'host', value: BOREA_HOST }],
          destination: '/borea/terms',
        },
      ],
    }
  },
}

export default nextConfig
