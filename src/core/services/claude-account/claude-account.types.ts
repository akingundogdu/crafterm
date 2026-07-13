export interface RealUsageWindow {
  utilization: number // 0-100
  resetsAt: number // ms epoch
}
export interface RealUsage {
  fiveHour: RealUsageWindow | null
  sevenDay: RealUsageWindow | null
  sevenDaySonnet: RealUsageWindow | null
  modelName: string | null
  fetchedAt: number
  error?: 'no-token' | 'auth-expired' | 'network' | 'unavailable'
}
export interface OAuthToken {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number // ms epoch, 0 if unknown
}
