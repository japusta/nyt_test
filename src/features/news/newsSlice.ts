import { createEntityAdapter, createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit'
import type { RootState } from '../../app/store'
import type { NytDoc } from './nytApi'
import { format } from 'date-fns'

export type Article = {
  id: string
  abstract: string
  web_url: string
  pub_date_iso: string
  source?: string
  image?: string | null
}

function pickImage(doc: NytDoc): string | null {
  const base = 'https://www.nytimes.com/'
  const mm = doc.multimedia ?? []
  if (!mm.length) return null
  const pref = mm.find(m => (m.subtype ?? '').toLowerCase().includes('threebytwo'))
  const url = (pref ?? mm[0]).url
  if (!url) return null
  return url.startsWith('http') ? url : base + url.replace(/^\//,'')
}

function toArticle(d: NytDoc): Article {
  return {
    id: d._id,
    abstract: d.abstract,
    web_url: d.web_url,
    pub_date_iso: d.pub_date,
    source: d.source,
    image: pickImage(d)
  }
}

const adapter = createEntityAdapter<Article>({
  selectId: a => a.id,
  sortComparer: (a, b) => new Date(b.pub_date_iso).getTime() - new Date(a.pub_date_iso).getTime()
})

const slice = createSlice({
  name: 'news',
  initialState: adapter.getInitialState<{ newestIso: string | null }>({ newestIso: null }),
  reducers: {
    upsertMany(state, action: PayloadAction<NytDoc[]>) {
      const beforeTop = state.ids.length ? (state.entities[state.ids[0] as string]?.pub_date_iso ?? null) : null
      adapter.upsertMany(state, action.payload.map(toArticle))
      const afterTop = state.ids.length ? (state.entities[state.ids[0] as string]?.pub_date_iso ?? null) : null
      if (afterTop && afterTop !== beforeTop) state.newestIso = afterTop
    }
  }
})

export const { upsertMany } = slice.actions
export default slice.reducer

const baseSelectors = adapter.getSelectors<RootState>(s => s.news)

export const selectSections = createSelector(
  baseSelectors.selectAll,
  (items) => {
    const byDate = new Map<string, Article[]>()
    for (const a of items) {
      const key = a.pub_date_iso.slice(0,10)
      const bucket = byDate.get(key) ?? []
      bucket.push(a)
      byDate.set(key, bucket)
    }
    const entries = Array.from(byDate.entries())
    entries.sort((a,b) => (a[0] < b[0] ? 1 : -1))
    return entries.map(([key, items]) => ({
      date: format(new Date(key), 'MMMM d, yyyy'),
      items
    }))
  }
)
