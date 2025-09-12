// // RTK Query API for NYTimes (Archive + Article Search fallback; real data only)
// import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

// const API_KEY = import.meta.env.VITE_NYT_API_KEY || 'rJ7XaUF0IQZG7UYu0jp85Mdqpeu5MnbP'
// const OFFLINE = (import.meta.env.VITE_OFFLINE === '1')

// // ==== Types (subset compatible with Archive & Article Search "docs") ====
// export type NytDoc = {
//   _id: string
//   abstract: string
//   web_url: string
//   pub_date: string
//   source?: string
//   multimedia?: { url: string; subtype?: string }[]
// }
// export interface ArchiveResp { docs: NytDoc[] }

// // ==== Helpers ====
// function isCurrentMonth(y: number, m: number) {
//   const now = new Date()
//   return y === now.getFullYear() && m === (now.getMonth() + 1)
// }
// function pad2(n: number) { return String(n).padStart(2, '0') }
// function lastDayOfMonth(y: number, m: number) {
//   // m is 1..12
//   return new Date(y, m, 0).getDate()
// }
// function hasDocs(r: any): r is { data: { response: { docs: NytDoc[] } } } {
//   return !!r?.data?.response?.docs && Array.isArray(r.data.response.docs)
// }

// // ==== Base queries ====
// // Official Archive API (requires key)
// const archiveBaseQuery = fetchBaseQuery({
//   baseUrl: '/nyt/svc/archive/v1',
//   responseHandler: async (res) => {
//     const ct = res.headers.get('content-type') || ''
//     return ct.includes('application/json') ? res.json() : res.text()
//   },
// })

// // Static monthly JSON mirror (no key; sometimes missing for fresh months)
// const staticBaseQuery = fetchBaseQuery({
//   baseUrl: '/nyts',
//   responseHandler: async (res) => {
//     const ct = res.headers.get('content-type') || ''
//     return ct.includes('application/json') ? res.json() : res.text()
//   },
// })

// // Article Search (date-range, for current/locked months)
// const searchBaseQuery = fetchBaseQuery({
//   baseUrl: '/nyt/svc/search/v2',
//   responseHandler: async (res) => {
//     const ct = res.headers.get('content-type') || ''
//     return ct.includes('application/json') ? res.json() : res.text()
//   },
// })

// // Fetch a month via Article Search (paged; capped to avoid rate limits)
// async function fetchMonthViaSearch(
//   y: number,
//   m: number,
//   api: any,
//   extra: any,
//   maxPages = 20 // 20*10=200 docs; поднимайте при необходимости, учитывая лимиты
// ): Promise<NytDoc[]> {
//   const mm = pad2(m)
//   const endDay = lastDayOfMonth(y, m)
//   const begin_date = `${y}${mm}01`
//   const end_date = `${y}${mm}${pad2(endDay)}`

//   const docs: NytDoc[] = []
//   for (let page = 0; page < maxPages; page++) {
//     const r = await searchBaseQuery({
//       url: 'articlesearch.json',
//       params: {
//         'api-key': API_KEY,
//         begin_date,
//         end_date,
//         sort: 'newest',
//         page, // 0..n; по 10 доков на страницу
//       },
//     }, api, extra)

//     const batch: NytDoc[] = r?.data?.response?.docs ?? []
//     docs.push(...batch)
//     if (batch.length < 10) break // страницы закончились
//   }
//   return docs
// }

// /*
// // Fetch a month via Article Search (paged; capped to avoid rate limits)
// const MAX_PAGES = 5;             // не рвём лимиты (50 материалов)
// const SLEEP_MS = 650;            // мягкий троттлинг между страницами

// const sleep = (ms:number) => new Promise(r => setTimeout(r, ms));

// async function fetchMonthViaSearch(y:number, m:number, api:any, extra:any) {
//   const mm = String(m).padStart(2,'0');
//   const endDay = new Date(y, m, 0).getDate();
//   const begin_date = `${y}${mm}01`;
//   const end_date   = `${y}${mm}${String(endDay).padStart(2,'0')}`;

//   const docs:NytDoc[] = [];
//   for (let page=0; page<MAX_PAGES; page++) {
//     const r:any = await searchBaseQuery({
//       url: 'articlesearch.json',
//       params: {
//         'api-key': API_KEY,
//         begin_date, end_date,
//         sort: 'newest',
//         q: 'news',             // ⬅️ обязательный параметр для поискового API
//         page
//       }
//     }, api, extra);

//     const batch = r?.data?.response?.docs ?? [];
//     docs.push(...batch);
//     if (batch.length < 10) break;

//     // бережно относимся к лимиту 10 req/min
//     await sleep(SLEEP_MS);
//   }
//   return docs;
// }

// * */

// // ==== API ====
// export const nytApi = createApi({
//   reducerPath: 'nytApi',
//   baseQuery: archiveBaseQuery,
//   endpoints: (builder) => ({
//     getArchive: builder.query<ArchiveResp, { year: number; month: number }>({
//       // Всегда возвращаем реальные данные NYT (или пустой список), без моков
//       async queryFn(arg, api, extra, baseQuery) {
//         const { year, month } = arg
//         if (OFFLINE) return { data: { docs: [] } }

//         // ---------- НЕ ТЕКУЩИЙ МЕСЯЦ ----------
//         if (!isCurrentMonth(year, month)) {
//           // 1) пробуем статический JSON (быстро, без ключа)
//           const stat = await staticBaseQuery(
//             { url: `/svc/archive/v1/${year}/${month}.json` },
//             api,
//             extra
//           )
//           if (hasDocs(stat)) {
//             return { data: { docs: stat.data.response.docs as NytDoc[] } }
//           }

//           // 2) фолбэк: официальный Archive API
//           const arch = await baseQuery(
//             { url: `/${year}/${month}.json`, params: { 'api-key': API_KEY } },
//             api,
//             extra
//           )
//           if (hasDocs(arch)) {
//             return { data: { docs: arch.data.response.docs as NytDoc[] } }
//           }

//           // 3) крайний фолбэк: Article Search (если архив отсутствует/закрыт)
//           const viaSearch = await fetchMonthViaSearch(year, month, api, extra)
//           return { data: { docs: viaSearch } }
//         }

//         // ---------- ТЕКУЩИЙ МЕСЯЦ ----------
//         // Часто архив недоступен/редиректит на приватный объект → сразу пробуем Archive,
//         // а при отсутствии JSON идём в Article Search.
//         const arch = await baseQuery(
//           { url: `/${year}/${month}.json`, params: { 'api-key': API_KEY } },
//           api,
//           extra
//         )
//         if (hasDocs(arch)) {
//           return { data: { docs: arch.data.response.docs as NytDoc[] } }
//         }

//         const viaSearch = await fetchMonthViaSearch(year, month, api, extra)
//         return { data: { docs: viaSearch } }
//       },
//     }),
//   }),
// })

// export const { useGetArchiveQuery, useLazyGetArchiveQuery } = nytApi


// RTK Query API for NYTimes (Archive + TimesWire)
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

const API_KEY = import.meta.env.VITE_NYT_API_KEY || 'rJ7XaUF0IQZG7UYu0jp85Mdqpeu5MnbP'
const OFFLINE = (import.meta.env.VITE_OFFLINE === '1')

export type NytDoc = {
  _id: string
  abstract: string
  web_url: string
  pub_date: string
  source?: string
  multimedia?: { url: string; subtype?: string }[]
}
export interface ArchiveResp { docs: NytDoc[] }

// ---------- helpers ----------
function isCurrentMonth(y:number, m:number){
  const now = new Date()
  return y === now.getFullYear() && m === (now.getMonth()+1)
}
function hasDocs(r:any): r is { data:{ response:{ docs:NytDoc[] } } } {
  return !!r?.data?.response?.docs && Array.isArray(r.data.response.docs)
}

// ---------- base queries ----------
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
// TimesWire
const timesWireBaseQuery = fetchBaseQuery({
  baseUrl: '/nyt/svc/news/v3/content',
  responseHandler: async (res) => {
    const ct = res.headers.get('content-type') || ''
    return ct.includes('application/json') ? res.json() : res.text()
  },
})

// Нормализация TimesWire → наш формат
function mapTimesWire(items:any[]):NytDoc[] {
  return (items ?? []).map((it:any) => ({
    _id: it.uri || it.url,                       // у TimesWire есть uri
    abstract: it.abstract ?? it.title ?? '',
    web_url: it.url,
    pub_date: it.published_date,
    source: it.source,
    multimedia: Array.isArray(it.multimedia)
      ? it.multimedia
          .filter((m:any)=>m?.url)
          .map((m:any)=>({ url: m.url, subtype: m.format }))
      : []
  }))
}

// ---------- API ----------
export const nytApi = createApi({
  reducerPath: 'nytApi',
  baseQuery: archiveBaseQuery,
  endpoints: (builder) => ({

    // A) Архив как и раньше (static → archive)
    getArchive: builder.query<ArchiveResp, { year:number; month:number }>({
      async queryFn(arg, api, extra, baseQuery) {
        const { year, month } = arg
        if (OFFLINE) return { data: { docs: [] } }

        if (!isCurrentMonth(year, month)) {
          const stat = await staticBaseQuery(
            { url: `/svc/archive/v1/${year}/${month}.json` }, api, extra
          )
          if (hasDocs(stat)) return { data: { docs: stat.data.response.docs as NytDoc[] } }

          const arch = await baseQuery(
            { url: `/${year}/${month}.json`, params: { 'api-key': API_KEY } }, api, extra
          )
          if (hasDocs(arch)) return { data: { docs: arch.data.response.docs as NytDoc[] } }

          return { data: { docs: [] } }
        }

        const arch = await baseQuery(
          { url: `/${year}/${month}.json`, params: { 'api-key': API_KEY } }, api, extra
        )
        if (hasDocs(arch)) return { data: { docs: arch.data.response.docs as NytDoc[] } }
        return { data: { docs: [] } }
      }
    }),

    // B) TimesWire — «самое новое»
    getTimesWire: builder.query<
      ArchiveResp,
      { source?: 'all'|'nyt'|'inyt'; section?: string; hours?: number; limit?: number; offset?: number }
    >({
      async queryFn(arg, api, extra) {
        if (OFFLINE) return { data: { docs: [] } }
        const source = arg.source ?? 'nyt'     // можно 'all' или 'inyt'
        const section = arg.section ?? 'all'   // или конкретная секция
        const limit = arg.limit ?? 20          // TimesWire обычно отдает до ~20 за раз
        const offset = arg.offset ?? 0

        // путь: /{source}/{section}.json или /{source}/{section}/{hours}.json
        const path = arg.hours
          ? `/${source}/${section}/${arg.hours}.json`
          : `/${source}/${section}.json`

        const res:any = await timesWireBaseQuery({
          url: path,
          params: { 'api-key': API_KEY, limit, offset }
        }, api, extra)

        const items = res?.data?.results ?? []
        return { data: { docs: mapTimesWire(items) } }
      }
    }),
  }),
})

export const {
  useGetArchiveQuery,
  useLazyGetArchiveQuery,
  useGetTimesWireQuery,
  useLazyGetTimesWireQuery,
} = nytApi
