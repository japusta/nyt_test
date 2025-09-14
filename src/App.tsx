import { useEffect, useMemo, useRef, useState } from 'react'
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
import Section from './components/Section'
import Loader from './components/Loader'

// Helpers to compute neighbouring months and keys. These are defined
// outside of the component to avoid re-creating them on every render.
function monthAdd(d: Date, delta: number) {
  const nd = new Date(d)
  nd.setDate(1)
  nd.setMonth(nd.getMonth() + delta)
  return nd
}
function prevMonth(d: Date) { return monthAdd(d, -1) }
function ymKey(d: Date) { return `${d.getFullYear()}-${d.getMonth() + 1}` }

export default function App() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector(selectMode)
  const ids = useAppSelector((s) => s.news.ids as string[])

  const idsRef = useRef<string[]>([])
  useEffect(() => { idsRef.current = ids }, [ids])

  const [cursor, setCursor] = useState<Date | null>(null)
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set())
  const [booted, setBooted] = useState(false)
  const [titleIso, setTitleIso] = useState<string>(() => new Date().toISOString().slice(0,10))


  // Store the latest mode in a ref so asynchronous callbacks reference
  // up-to-date values. Without this stale closures could trigger state
  // updates for the wrong mode.
  const modeRef = useRef<FeedMode>(mode)
  useEffect(() => { modeRef.current = mode }, [mode])

  // Category filtering. The default category 'all' yields the full feed.
  const categories = ['Science', 'General', 'Entertainment', 'Technology', 'Business', 'Health', 'Sports']
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // ===== Archive: current month (polling)
  const currentMonth = useMemo(() => new Date(), [])
  const { data: currentData } = useGetArchiveQuery(
    { year: currentMonth.getFullYear(), month: currentMonth.getMonth() + 1 },
    { pollingInterval: 30_000, skip: !booted || mode !== 'archive' }
  )
  const [triggerArchive, { isFetching: isFetchingArchive }] = useLazyGetArchiveQuery()
  const [loadingMonth, setLoadingMonth] = useState(false)

  // ===== TimesWire: first page + pagination offset
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

  // ===== Initialisation when mode changes =====
  useEffect(() => {
    setBooted(false)
    setCursor(null)
    setLoadedMonths(new Set())
    // Reset TimesWire parameters
    setTwOffset(0)
    setTwLoading(false)
    setTwEnd(false)

    if (mode !== 'archive') { setBooted(true); return }

    let cancelled = false
    ;(async () => {
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
        } catch {}
        probe = prevMonth(probe)
      }
      if (!cancelled) setBooted(true)
    })()

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // ===== Archive: merge polling results for current month =====
  useEffect(() => {
    if (mode !== 'archive') return
    if (!currentData?.docs) return
    dispatch(upsertMany(currentData.docs))
    setToast('New articles loaded')
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [currentData, dispatch, mode])

  // ===== TimesWire: first page + polling =====
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

  // ===== Selectors =====
  const sections = useAppSelector(selectSections)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // ===== Archive: infinite scroll by months =====
  useEffect(() => {
    if (mode !== 'archive') return
    if (!cursor) return
    const el = sentinelRef.current
    if (!el) return
    let cancelled = false

    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loadingMonth) return
      const next = prevMonth(cursor)
      const key = ymKey(next)
      if (loadedMonths.has(key)) { setCursor(next); return }
      try {
        setLoadingMonth(true)
        const res = await triggerArchive({ year: next.getFullYear(), month: next.getMonth() + 1 }).unwrap()
        if (cancelled || modeRef.current !== 'archive') return
        if (res.docs?.length) {
          dispatch(upsertMany(res.docs))
          setLoadedMonths(new Set([...Array.from(loadedMonths), key]))
        }
        setCursor(next)
      } finally {
        if (!cancelled) setLoadingMonth(false)
      }
    }, { rootMargin: '0px 0px 1000px 0px' })

    io.observe(el)
    return () => { cancelled = true; io.disconnect() }
  }, [cursor, loadedMonths, triggerArchive, dispatch, loadingMonth, mode])

  // ===== TimesWire: infinite scroll by offsets (0,20,40…) =====
  useEffect(() => {
    if (mode !== 'timeswire' || twEnd) return
    const el = sentinelRef.current
    if (!el) return
    let cancelled = false

    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || twLoadingRef.current) return

      setTwLoading(true)
      twLoadingRef.current = true
      try {
        const res = await triggerTW({
          source: 'nyt',
          section: selectedCategory === 'all' ? 'all' : selectedCategory.toLowerCase(),
          limit: 20,
          offset: twOffsetRef.current,
        }).unwrap()

        const batch = (cancelled || modeRef.current !== 'timeswire') ? [] : (res.docs ?? [])

        if (batch.length) {
          dispatch(upsertMany(batch))
          setTwOffset((prev) => {
            const next = prev + batch.length
            twOffsetRef.current = next
            return next
          })
        }
        if (batch.length < 20) setTwEnd(true)
      } catch (e: any) {
        const msg = e?.status === 429 ? 'Too many requests. Please wait…' : 'Failed to load more articles'
        setToast(msg)
        setTimeout(() => setToast(null), 2200)
      } finally {
        if (!cancelled) {
          setTwLoading(false)
          twLoadingRef.current = false
        }
      }
    }, { rootMargin: '0px 0px 1000px 0px' })

    io.observe(el)
    return () => { cancelled = true; io.disconnect() }
  }, [mode, twEnd, triggerTW, dispatch, selectedCategory])

  useEffect(() => {
  function updateTitleFromScroll() {
    const secs = Array.from(document.querySelectorAll<HTMLElement>('section[data-iso]'))
    if (!secs.length) return
    const headerOffset = 72 // подстрой, если у тебя другая высота шапки
    let current: HTMLElement | null = null
    for (const el of secs) {
      const top = el.getBoundingClientRect().top
      if (top <= headerOffset) current = el
      else break
    }
    const iso = (current ?? secs[0]).dataset.iso
    if (iso) setTitleIso(iso)
  }
  updateTitleFromScroll()
  window.addEventListener('scroll', updateTitleFromScroll, { passive: true })
  return () => window.removeEventListener('scroll', updateTitleFromScroll)
}, [sections])  // пересчитать, когда список секций меняется


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
        titleDateISO={titleIso}          // ← НОВОЕ

      />
      {toast && <div className="toast">{toast}</div>}
      <div className="list">
        {!booted && <Loader active={true} />}
        {booted && sections.length === 0 && (
          <div style={{ padding: '16px', color: 'var(--muted)' }}>
            No data available yet. Try switching mode or check your API key.
          </div>
        )}
        {sections.map((sec) => (
          <Section key={sec.date} date={sec.date} items={sec.items} />
        ))}
        <div ref={sentinelRef} className="sentinel" />
      </div>
      <Loader active={isFetchingArchive || loadingMonth || twLoading || !booted} />
    </div>
  )
}