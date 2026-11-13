const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export type ApiService = {
  id: number
  name: string
  url: string
  check_interval: number
  is_public: boolean
  status: 'up' | 'down'
  uptime: number
  status_code: number | null
  latency: number | null
  error_message: string | null
  last_checked: string | null
  recent_checks: Array<{
    timestamp: string
    hour_start: string
    latency: number
    status_code: number | null
    status: 'up' | 'down'
    error_message: string | null
  }>
}

export type ApiIncident = {
  id: number
  date: string
  service_name: string
  url: string
  status: 'Abierto' | 'Resuelto'
  http_code: number | null
  latency: number | null
  description: string
}

export type ServiceInput = {
  name: string
  url: string
  check_interval: number
  is_public: boolean
}

export type AuthResult = {
  token: string
  email: string
  public_slug: string
}

function getToken(): string | null {
  return localStorage.getItem('statushub_token')
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `La solicitud falló (${response.status}).`)
  }

  return response.json() as Promise<T>
}

export function login(email: string, password: string): Promise<AuthResult> {
  return request<AuthResult>('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function register(email: string, password: string, termsAccepted: boolean): Promise<AuthResult> {
  return request<AuthResult>('/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, terms_accepted: termsAccepted }),
  })
}

export function forgotPassword(email: string): Promise<{ message: string; simulated: boolean }> {
  return request<{ message: string; simulated: boolean }>('/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function resetPassword(token: string, password: string): Promise<{ message: string }> {
  return request<{ message: string }>('/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export function getServices(): Promise<ApiService[]> {
  return request<ApiService[]>('/services')
}

export function getServiceHourChecks(serviceId: number, hourStart: string): Promise<ApiService['recent_checks']> {
  const query = new URLSearchParams({ hour_start: hourStart })
  return request<ApiService['recent_checks']>(`/services/${serviceId}/checks?${query}`)
}

export function getIncidents(): Promise<ApiIncident[]> {
  return request<ApiIncident[]>('/incidents')
}

export function saveService(service: ServiceInput, id?: number): Promise<{ id: number }> {
  return request<{ id: number }>(id ? `/services/${id}` : '/services', {
    method: id ? 'PUT' : 'POST',
    body: JSON.stringify(service),
  })
}

export function deleteService(id: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/services/${id}`, { method: 'DELETE' })
}

export async function downloadIncidents(filters: {
  from?: string
  to?: string
  service?: string
  status?: string
} = {}): Promise<void> {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const query = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value)
  })
  const response = await fetch(`${API_BASE}/export-csv${query.size ? `?${query}` : ''}`, { headers })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new Error(body?.error ?? `La exportación falló (${response.status}).`)
  }

  const file = await response.blob()
  const objectUrl = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = 'incidentes_statushub.csv'
  link.click()
  URL.revokeObjectURL(objectUrl)
}

export function getPublicStatus(slug: string): Promise<{ services: ApiService[] }> {
  return request<{ services: ApiService[] }>(`/public/status/${encodeURIComponent(slug)}`)
}
