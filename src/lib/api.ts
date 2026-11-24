class ApiClient {
  private token: string | null = null;
  private csrfToken: string | null = null;

  setCredentials(token: string | null, csrfToken: string | null) {
    this.token = token;
    this.csrfToken = csrfToken;
  }

  getToken() {
    return this.token;
  }

  async request<T>(
    url: string,
    options: RequestInit & { extraHeaders?: Record<string, string> } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.extraHeaders || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    if (this.csrfToken && options.method && options.method !== 'GET') {
      headers['X-CSRF-Token'] = this.csrfToken;
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    const text = await res.text();
    let parsed: any = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { error: text || 'Terjadi kesalahan pada server.' };
    }

    if (!res.ok) {
      throw new Error(parsed?.error || `Permintaan gagal (${res.status})`);
    }

    return parsed as T;
  }
}

export const api = new ApiClient();

export function formatDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function formatDurationSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
