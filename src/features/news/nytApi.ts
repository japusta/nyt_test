import { createApi, fetchBaseQuery, retry } from '@reduxjs/toolkit/query/react'

const API_KEY = (import.meta as any).env?.VITE_NYT_API_KEY ?? 'oB0U5qaFGgKOeDAUAPaS7drPAwwYUDnu'
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

const timesWireBaseQuery = fetchBaseQuery({
  baseUrl: '/nyt/svc/news/v3/content',
  responseHandler: async (res) => {
    const ct = res.headers.get('content-type') || ''
    return ct.includes('application/json') ? res.json() : res.text()
  },
})

const timesWireRetryBaseQuery = retry(timesWireBaseQuery, {
  retryCondition: (error: any, _args, { attempt }) => {
    const status = typeof error?.status === 'number' ? error.status : 0
    return attempt <= 3 && (status === 429 || status >= 500)
  },
})

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

    getTimesWire: builder.query<
      ArchiveResp,
      { source?: 'all' | 'nyt' | 'inyt'; section?: string; hours?: number; limit?: number; offset?: number }
    >({
      async queryFn(arg, api, extra) {
        if (OFFLINE) return { data: { docs: [] } }

        const source = arg.source ?? 'nyt'
        const section = arg.section ?? 'all'
        const limit = Math.min(20, Math.max(1, arg.limit ?? 20))
        const offset = Math.max(0, arg.offset ?? 0)

        const path = `${source}/${section}.json`
        const res: any = await timesWireRetryBaseQuery({
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