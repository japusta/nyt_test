import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useAppDispatch, useAppSelector } from './app/store'
import { selectSections, upsertMany, selectMode, setMode } from './features/news/newsSlice'
import type { FeedMode } from './features/news/newsSlice'
import {
  useGetArchiveQuery,
  useLazyGetArchiveQuery,
  useGetTimesWireQuery,
  useLazyGetTimesWireQuery,
} from './features/news/nytApi'
import Header from './components/Header'
import Loader from './components/Loader'
import Footer from './components/Footer'
import Card from './components/Card'
import { GroupedVirtuoso } from 'react-virtuoso'

function monthAdd(d: Date, delta: number) {
  const nd = new Date(d)
  nd.setDate(1)
  nd.setMonth(nd.getMonth() + delta)
  return nd
}
function prevMonth(d: Date) { return monthAdd(d, -1) }
function ymKey(d: Date) { return `${d.getFullYear()}-${d.getMonth() + 1}` }

const LOAD_COOLDOWN_MS = 1200

export default function App() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector(selectMode)
  const ids = useAppSelector((s) => s.news.ids as string[])

  const idsRef = useRef<string[]>([])
  useEffect(() => { idsRef.current = ids }, [ids])

  const [cursor, setCursor] = useState<Date | null>(null)
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set())
  const [booted, setBooted] = useState(false)

  const modeRef = useRef<FeedMode>(mode)
  useEffect(() => { modeRef.current = mode }, [mode])

  const categories = ['Science', 'General', 'Entertainment', 'Technology', 'Business', 'Health', 'Sports']
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const currentMonth = useMemo(() => new Date(), [])
  const { data: currentData } = useGetArchiveQuery(
    { year: currentMonth.getFullYear(), month: currentMonth.getMonth() + 1 },
    { pollingInterval: 30_000, skip: !booted || mode !== 'archive' }
  )
  const [triggerArchive, { isFetching: isFetchingArchive }] = useLazyGetArchiveQuery()
  const [loadingMonth, setLoadingMonth] = useState(false)

  const [twOffset, setTwOffset] = useState(0)
  const [twLoading, setTwLoading] = useState(false)
  const [twEnd, setTwEnd] = useState(false)
  const twLoadingRef = useRef(false)
  const twOffsetRef = useRef(0)
  useEffect(() => { twLoadingRef.current = twLoading }, [twLoading])
  useEffect(() => { twOffsetRef.current = twOffset }, [twOffset])

  const { data: twData } = useGetTimesWireQuery(
    {
      source: 'nyt',
      section: selectedCategory === 'all' ? 'all' : selectedCategory.toLowerCase(),
      limit: 20,
      offset: 0,
    },
    { skip: mode !== 'timeswire', pollingInterval: 30_000 }
  )
  const [triggerTW] = useLazyGetTimesWireQuery()

  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    setBooted(false)
    setCursor(null)
    setLoadedMonths(new Set())
    setTwOffset(0)
    setTwLoading(false)
    setTwEnd(false)

    if (mode !== 'archive') { setBooted(true); return }

    let cancelled = false
    ; (async () => {
      let probe = prevMonth(new Date())
      for (let i = 0; i < 24; i++) {
        try {
          const res = await triggerArchive({ year: probe.getFullYear(), month: probe.getMonth() + 1 }).unwrap()
          if (cancelled || modeRef.current !== 'archive') return
          if (res.docs?.length) {
            dispatch(upsertMany(res.docs))
            setLoadedMonths(new Set([ymKey(probe)]))
            setCursor(probe)
            break
          }
        } catch { /* ignore */ }
        probe = prevMonth(probe)
      }
      if (!cancelled) setBooted(true)
    })()

    return () => { cancelled = true }
  }, [mode])

  useEffect(() => {
    if (mode !== 'archive') return
    if (!currentData?.docs) return
    dispatch(upsertMany(currentData.docs))
    setToast('New articles loaded')
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [currentData, dispatch, mode])

  useEffect(() => {
    if (mode !== 'timeswire') return
    if (!twData?.docs) return
    const prevIds = idsRef.current
    const newDocs = twData.docs.filter((d) => !prevIds.includes(d._id))
    dispatch(upsertMany(twData.docs))
    if (prevIds.length === 0) {
      setTwOffset(twData.docs.length)
      setTwEnd(twData.docs.length < 20)
      return
    }
    if (newDocs.length) {
      setTwOffset((prev) => prev + newDocs.length)
      setToast('New articles loaded')
      const t = setTimeout(() => setToast(null), 2200)
      return () => clearTimeout(t)
    }
  }, [twData, dispatch, mode])

  const sections = useAppSelector(selectSections)

  const [titleIso, setTitleIso] = useState<string>(() => {
    const today = new Date()
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  })

  const groupCounts = useMemo(() => sections.map((sec) => sec.items.length), [sections])

  const groupHeaderPositions = useMemo(() => {
    const positions: number[] = []
    let pos = 0
    for (const count of groupCounts) {
      positions.push(pos)     
      pos += 1 + count        
    }
    return positions
  }, [groupCounts])

  useEffect(() => {
    if (sections.length === 0) {
      const today = new Date()
      setTitleIso(
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      )
    } else {
      const first = sections[0]
      const iso = first.items[0]?.pub_date_iso?.slice(0, 10) ?? ''
      if (iso) setTitleIso(iso)
    }
  }, [sections])

  const loadingRef = useRef(false)
  const lastLoadAtRef = useRef(0)

  const loadMoreSafe = useCallback(async () => {
    // 1) не пускаем параллельные запросы
    if (loadingRef.current) return
    // 2) троттл
    const now = Date.now()
    if (now - lastLoadAtRef.current < LOAD_COOLDOWN_MS) return
    loadingRef.current = true
    lastLoadAtRef.current = now

    try {
      if (modeRef.current === 'archive') {
        if (!cursor || loadingMonth) return
        const next = prevMonth(cursor)
        const key = ymKey(next)
        if (loadedMonths.has(key)) { setCursor(next); return }

        setLoadingMonth(true)
        const res = await triggerArchive({ year: next.getFullYear(), month: next.getMonth() + 1 }).unwrap()
        if (modeRef.current !== 'archive') return
        if (res.docs?.length) {
          dispatch(upsertMany(res.docs))
          setLoadedMonths(new Set([...Array.from(loadedMonths), key]))
        }
        setCursor(next)
      } else {
        if (twEnd || twLoadingRef.current) return
        twLoadingRef.current = true
        setTwLoading(true)

        const res = await triggerTW({
          source: 'nyt',
          section: selectedCategory === 'all' ? 'all' : selectedCategory.toLowerCase(),
          limit: 20,
          offset: twOffsetRef.current,
        }).unwrap()

        const batch = res?.docs ?? []
        if (modeRef.current === 'timeswire' && batch.length) {
          dispatch(upsertMany(batch))
          const nextOff = twOffsetRef.current + batch.length
          twOffsetRef.current = nextOff
          setTwOffset(nextOff)
        }
        if (batch.length < 20) setTwEnd(true)
      }
    } catch (e: any) {
      if (e?.status === 429) {
        setTimeout(() => { lastLoadAtRef.current = 0 }, 1500)
      }
      setToast('Failed to load more articles')
      setTimeout(() => setToast(null), 2200)
    } finally {
      loadingRef.current = false
      setLoadingMonth(false)
      setTwLoading(false)
      twLoadingRef.current = false
    }
  }, [cursor, loadingMonth, loadedMonths, triggerArchive, dispatch, twEnd, triggerTW, selectedCategory])

  return (
    <div className="container">
      <Header
        onSelectMode={(m) => dispatch(setMode(m))}
        current={mode}
        categories={categories}
        onCategorySelect={(cat) => {
          const value = cat.toLowerCase()
          setSelectedCategory(value === 'general' ? 'all' : value)
          setTwOffset(0)
          setTwEnd(false)
        }}
        titleDateISO={titleIso}
      />

      {toast && <div className="toast">{toast}</div>}

      <div className="list">
        {!booted && <Loader active={true} />}
        {booted && sections.every((sec) => sec.items.length === 0) && (
          <div style={{ padding: '16px', color: 'var(--muted)' }}>
            No data available yet. Try switching mode or check your API key.
          </div>
        )}
        {booted && sections.length > 0 && (
          <GroupedVirtuoso
            useWindowScroll
            groupCounts={groupCounts}
            groupContent={(groupIndex) => (
              <div className="date-sep">{sections[groupIndex].date}</div>
            )}
            itemContent={(itemIndex, groupIndex) => {
              const group = sections[groupIndex]
              const article = group?.items?.[itemIndex]
              // Защита от overscan: возвращаем минимум 1px высоты, чтобы избежать
              // предупреждения "Zero-sized element, this should not happen".
              if (!article) return <div style={{ height: 1 }} />
              return <Card a={article} />
            }}
            endReached={() => {
              loadMoreSafe()
            }}
            rangeChanged={({ startIndex }) => {
              let currentGroup = 0
              for (let i = 0; i < groupHeaderPositions.length; i++) {
                if (startIndex >= groupHeaderPositions[i]) currentGroup = i
                else break
              }
              const iso = sections[currentGroup]?.items?.[0]?.pub_date_iso?.slice(0, 10)
              if (iso && iso !== titleIso) setTitleIso(iso)
            }}
            increaseViewportBy={{ top: 0, bottom: 600 }}
          />
        )}
      </div>
      {/* <Loader active={isFetchingArchive || loadingMonth || twLoading || !booted} /> */}
      <Footer />
    </div>
  )
}
