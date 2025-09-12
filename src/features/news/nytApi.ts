// RTK Query API for NYTimes (Archive + TimesWire)
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

// чтобы TS не ругался на import.meta.env без vite-env.d.ts
const API_KEY = (import.meta as any).env?.VITE_NYT_API_KEY ?? 'YOUR_NYT_API_KEY'
const OFFLINE = ((import.meta as any).env?.VITE_OFFLINE === '1')

export type NytDoc = {
  _id: string
  abstract: string
  web_url: string
  pub_date: string
  source?: string
  multimedia?: { url: string; subtype?: string }[]
}
export interface ArchiveResp { docs: NytDoc[] }

function isCurrentMonth(y: number, m: number) {
  const now = new Date()
  return y === now.getFullYear() && m === now.getMonth() + 1
}
function hasDocs(r: any): r is { data: { response: { docs: NytDoc[] } } } {
  return !!r?.data?.response?.docs && Array.isArray(r.data.response.docs)
}

// ------- base queries -------
const archiveBaseQuery = fetchBaseQuery({
  baseUrl: '/nyt/svc/archive/v1',
  responseHandler: async (res) => {
    const ct = res.headers.get('content-type') || ''
    return ct.includes('application/json') ? res.json() : res.text()
  },
})
const staticBaseQuery = fetchBaseQuery({
  baseUrl: '/nyts',
  responseHandler: async (res) => {
    const ct = res.headers.get('content-type') || ''
    return ct.includes('application/json') ? res.json() : res.text()
  },
})
// ВАЖНО: базовый URL заканчивается на /content
const timesWireBaseQuery = fetchBaseQuery({
  baseUrl: '/nyt/svc/news/v3/content',
  responseHandler: async (res) => {
    const ct = res.headers.get('content-type') || ''
    return ct.includes('application/json') ? res.json() : res.text()
  },
})

// Нормализация TimesWire -> наш тип
function mapTimesWire(items: any[]): NytDoc[] {
  return (items ?? []).map((it: any) => ({
    _id: it.uri || it.url,
    abstract: it.abstract ?? it.title ?? '',
    web_url: it.url,
    pub_date: it.published_date,
    source: it.source,
    multimedia: Array.isArray(it.multimedia)
      ? it.multimedia.filter((m: any) => m?.url).map((m: any) => ({ url: m.url, subtype: m.format }))
      : [],
  }))
}

export const nytApi = createApi({
  reducerPath: 'nytApi',
  baseQuery: archiveBaseQuery,
  endpoints: (builder) => ({

    // A) Архив (static -> official)
    getArchive: builder.query<ArchiveResp, { year: number; month: number }>({
      async queryFn(arg, api, extra, baseQuery) {
        const { year, month } = arg
        if (OFFLINE) return { data: { docs: [] } }

        if (!isCurrentMonth(year, month)) {
          const stat: any = await staticBaseQuery({ url: `/svc/archive/v1/${year}/${month}.json` }, api, extra)
          if (hasDocs(stat)) return { data: { docs: stat.data.response.docs as NytDoc[] } }

          const arch: any = await baseQuery({ url: `/${year}/${month}.json`, params: { 'api-key': API_KEY } })
          if (hasDocs(arch)) return { data: { docs: arch.data.response.docs as NytDoc[] } }

          return { data: { docs: [] } }
        }

        const arch: any = await baseQuery({ url: `/${year}/${month}.json`, params: { 'api-key': API_KEY } })
        if (hasDocs(arch)) return { data: { docs: arch.data.response.docs as NytDoc[] } }
        return { data: { docs: [] } }
      },
    }),

    // B) TimesWire — последние материалы
    getTimesWire: builder.query<
      ArchiveResp,
      { source?: 'all' | 'nyt' | 'inyt'; section?: string; hours?: number; limit?: number; offset?: number }
    >({
      async queryFn(arg, api, extra) {
        if (OFFLINE) return { data: { docs: [] } }

        const source = arg.source ?? 'nyt'
        const section = arg.section ?? 'all'

        // ЛИМИТ СТРОГО 1..20 (иначе 400)
        const limit = Math.min(20, Math.max(1, arg.limit ?? 20))
        const offset = Math.max(0, arg.offset ?? 0)

        // НЕ ставим ведущий "/" — иначе URL может собраться неправильно
        const path = `${source}/${section}.json`; // → /nyt/svc/news/v3/content/nyt/all.json


        const res: any = await timesWireBaseQuery({
          url: path,
          params: { 'api-key': API_KEY, limit, offset },
        }, api, extra)

        const items = res?.data?.results ?? []
        return { data: { docs: mapTimesWire(items) } }
      },
    }),
  }),
})

export const {
  useGetArchiveQuery,
  useLazyGetArchiveQuery,
  useGetTimesWireQuery,
  useLazyGetTimesWireQuery,
} = nytApi
