import { createEntityAdapter, createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../../app/store'
import type { NytDoc } from './nytApi'

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
})

export type FeedMode = 'archive' | 'timeswire'

export type Article = {
  id: string
  abstract: string
  web_url: string
  pub_date_iso: string
  source?: string
  image?: string | null
}

function pickImage(doc: NytDoc): string | null {
  const staticBase = 'https://static01.nyt.com/'
  const mm = doc.multimedia ?? []
  const pref =
    mm.find(x => (x.subtype ?? '').toLowerCase().includes('threebytwo') || x.subtype === 'xlarge' || x.subtype === 'superJumbo')
    || mm[0]
  if (!pref?.url) return null
  const url = pref.url
  return url.startsWith('http') ? url : staticBase + url.replace(/^\/+/, '')
}

function toArticle(d: NytDoc) {
  return {
    id: d._id,
    abstract: d.abstract,
    web_url: d.web_url,
    pub_date_iso: d.pub_date,
    source: d.source,
    image: pickImage(d),
  }
}

const adapter = createEntityAdapter<Article>({
  sortComparer: (a, b) => new Date(b.pub_date_iso).getTime() - new Date(a.pub_date_iso).getTime(),
})

const slice = createSlice({
  name: 'news',
  initialState: adapter.getInitialState<{ newestIso: string | null; mode: FeedMode }>({
    newestIso: null,
    mode: 'timeswire',      // ← ТЕПЕРЬ ПО УМОЛЧАНИЮ TimesWire
  }),
  reducers: {
    setMode(state, action: PayloadAction<FeedMode>) {
      state.mode = action.payload
      adapter.removeAll(state)
      state.newestIso = null
    },
    upsertMany(state, action: PayloadAction<NytDoc[]>) {
      const beforeTop = state.ids.length ? (state.entities[state.ids[0] as string]?.pub_date_iso ?? null) : null
      adapter.upsertMany(state, action.payload.map(toArticle))
      const afterTop = state.ids.length ? (state.entities[state.ids[0] as string]?.pub_date_iso ?? null) : null
      if (afterTop && afterTop !== beforeTop) state.newestIso = afterTop
    },
  },
})

export const { upsertMany, setMode } = slice.actions
export default slice.reducer

const baseSelectors = adapter.getSelectors<RootState>(s => s.news)
export const selectMode = (s: RootState) => s.news.mode

export const selectSections = createSelector(baseSelectors.selectAll, items => {
  const byDate = new Map<string, Article[]>()
  for (const a of items) {
    const key = a.pub_date_iso.slice(0, 10)
    const bucket = byDate.get(key) ?? []
    bucket.push(a)
    byDate.set(key, bucket)
  }
  const entries = Array.from(byDate.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  return entries.map(([key, items]) => ({ date: dateFmt.format(new Date(key)), items }))
})