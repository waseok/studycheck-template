/**
 * GET /api/onboarding/config — 온보딩 화면 진입용 (Express 불필요)
 */
export default function handler(_req: any, res: any) {
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json')
  res.end(
    JSON.stringify({
      success: true,
      templateRepo: 'waseok/studycheck-template',
      github: {
        clientId: '',
        authorizeUrl: 'https://github.com/login/oauth/authorize',
        configured: false,
      },
      vercel: {
        clientId: '',
        authorizeUrl: 'https://vercel.com/integrations',
        configured: false,
      },
      supabase: {
        clientId: '',
        authorizeUrl: 'https://supabase.com/dashboard',
        configured: false,
      },
      defaults: {
        repoVisibility: 'private',
        supabaseRegion: 'ap-northeast-2',
      },
    })
  )
}
