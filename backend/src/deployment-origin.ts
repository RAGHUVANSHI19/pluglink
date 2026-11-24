export function configuredAppOrigin() {
  if (process.env.APP_ORIGIN !== undefined) return process.env.APP_ORIGIN;
  if (process.env.VERCEL !== '1') return undefined;
  const hostname = process.env.VERCEL_ENV === 'production'
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL
    : process.env.VERCEL_URL;
  return hostname ? `https://${hostname}` : undefined;
}
