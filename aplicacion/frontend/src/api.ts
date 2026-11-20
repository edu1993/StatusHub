const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api'

export type FailureType = 'dns' | 'ssl' | 'http' | 'timeout' | 'connection' | 'unknown'

export type EvaluatedPeriod = {
  days: number
  from: string
  to: string
  duration_seconds: number
}

export type ApiService = {
  id: number
  name: string
  url: string
  check_interval: number
  is_public: boolean
  status: 'up' | 'down'
  uptime: number
  availability_level?: string
  downtime_seconds?: number
  evaluated_period?: EvaluatedPeriod
  status_code: number | null
  latency: number | null
  failure_type?: FailureType | null
  error_message: string | null
  last_checked: string | null
  recent_checks: Array<{
    timestamp: string
    hour_start: string
    latency: number
    status_code: number | null
    status: 'up' | 'down'
    failure_type?: FailureType | null
    error_message: string | null
  }>
}

export type ApiIncident = {
  id: number
  date: string
  resolved_at?: string | null
  resolved_date?: string | null
  end_date?: string | null
  service_name: string
  url: string
  status: 'Abierto' | 'Resuelto'
  http_code: number | null
  latency: number | null
  failure_type?: FailureType | null
  description: string
}

export type IncidentPaginationParams = {
  page: number
  limit: number
  service?: string
  status?: string
  from?: string
  to?: string
}

export type PaginatedIncidents = {
  items: ApiIncident[]
  total: number
  page: number
  limit: number
  totalPages: number
  serverPaginated: boolean
  services?: string[]
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
  public_status_enabled?: boolean
}

export type PublicStatusSettings = {
  public_slug: string
  public_status_enabled: boolean
  public_page_name?: string | null
  message?: string
}

type RawPaginatedIncidents = {
  items?: ApiIncident[]
  data?: ApiIncident[]
  incidents?: ApiIncident[]
  total?: number
  page?: number
  limit?: number
  per_page?: number
  total_pages?: number
  services?: string[]
}

function getToken(): string | null {
  return localStorage.getItem('statushub_token')
}

export function getIncidentResolvedAt(incident: ApiIncident): string | null {
  return incident.resolved_at ?? incident.resolved_date ?? incident.end_date ?? null
}

function extractIncidentArray(payload: ApiIncident[] | RawPaginatedIncidents): ApiIncident[] {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload.incidents)) return payload.incidents
  return []
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verifica tu conexión e intenta nuevamente.')
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string; message?: string } | null
    throw new Error(body?.error ?? body?.message ?? `La solicitud falló (${response.status}).`)
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

export function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string; token: string }> {
  return request<{ message: string; token: string }>('/account/password', {
    method: 'PUT',
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
}

export function deleteAccount(password: string): Promise<{ message: string }> {
  return request<{ message: string }>('/account', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  })
}

export function getPublicStatusSettings(): Promise<PublicStatusSettings> {
  return request<PublicStatusSettings>('/public-status/settings')
}

export function updatePublicStatusSettings(payload: {
  public_status_enabled?: boolean
  public_page_name?: string | null
}): Promise<PublicStatusSettings> {
  return request<PublicStatusSettings>('/public-status/settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function getServices(): Promise<ApiService[]> {
  return request<ApiService[]>('/services')
}

export function getServiceHourChecks(serviceId: number, hourStart: string): Promise<ApiService['recent_checks']> {
  const query = new URLSearchParams({ hour_start: hourStart })
  return request<ApiService['recent_checks']>(`/services/${serviceId}/checks?${query}`)
}

export async function getIncidents(): Promise<ApiIncident[]> {
  const payload = await request<ApiIncident[] | RawPaginatedIncidents>('/incidents')
  return extractIncidentArray(payload)
}

export async function getIncidentsPaginated(params: IncidentPaginationParams): Promise<PaginatedIncidents> {
  const query = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  })
  if (params.service && params.service !== 'Todos') query.set('service', params.service)
  if (params.status && params.status !== 'Todos') query.set('status', params.status)
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)

  const payload = await request<ApiIncident[] | RawPaginatedIncidents>(`/incidents?${query}`)

  if (!Array.isArray(payload) && payload && typeof payload === 'object') {
    const items = extractIncidentArray(payload)
    const limit = payload.limit ?? payload.per_page ?? params.limit
    const total = typeof payload.total === 'number' ? payload.total : items.length
    const totalPages = Math.max(1, payload.total_pages ?? Math.ceil(total / limit))
    const page = Math.min(Math.max(1, payload.page ?? params.page), totalPages)
    return {
      items,
      total,
      page,
      limit,
      totalPages,
      serverPaginated: true,
      services: payload.services,
    }
  }

  const all = Array.isArray(payload) ? payload : []
  const filtered = all.filter((incident) => {
    const date = incident.date.slice(0, 10)
    return (!params.service || params.service === 'Todos' || incident.service_name === params.service)
      && (!params.status || params.status === 'Todos' || incident.status === params.status)
      && (!params.from || date >= params.from)
      && (!params.to || date <= params.to)
  })
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / params.limit))
  const page = Math.min(Math.max(1, params.page), totalPages)
  const start = (page - 1) * params.limit
  return {
    items: filtered.slice(start, start + params.limit),
    total,
    page,
    limit: params.limit,
    totalPages,
    serverPaginated: false,
    services: [...new Set(all.map((incident) => incident.service_name))],
  }
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
    if (value && value !== 'Todos') query.set(key, value)
  })
  let response: Response
  try {
    response = await fetch(`${API_BASE}/export-csv${query.size ? `?${query}` : ''}`, { headers })
  } catch {
    throw new Error('No se pudo conectar con el servidor para exportar el archivo CSV.')
  }
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

export function getPublicStatus(slug: string): Promise<{ company_name?: string | null; services: ApiService[] }> {
  return request<{ company_name?: string | null; services: ApiService[] }>(`/public/status/${encodeURIComponent(slug)}`)
}
