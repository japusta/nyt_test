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
import Footer from './components/Footer'

function monthAdd(d: Date, delta: number) {
  const nd = new Date(d)
  nd.setDate(1)
  nd.setMonth(nd.getMonth() + delta)
  return nd
}
function prevMonth(d: Date) { return monthAdd(d, -1) }
function ymKey(d: Date) { return `${d.getFullYear()}-${d.getMonth() + 1}` }

// --- анти-спам задержка для API, чтобы избежать 429 ---
const LOAD_COOLDOWN_MS = 1500 // базовая пауза между подгрузками
const BACKOFF_429_MS = 3500   // пауза при 429

export default function App() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector(selectMode)
  const ids = useAppSelector((s) => s.news.ids as string[])

  const idsRef = useRef<string[]>([])
  useEffect(() => { idsRef.current = ids }, [ids])

  const [cursor, setCursor] = useState<Date | null>(null)
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set())
  const [booted, setBooted] = useState(false)
  const [titleIso, setTitleIso] = useState<string>(() => new Date().toISOString().slice(0, 10))

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

  const nextArchiveAllowedAtRef = useRef(0)
  const nextTWAllowedAtRef = useRef(0)

  useEffect(() => {
    setBooted(false)
    setCursor(null)
    setLoadedMonths(new Set())
    setTwOffset(0)
    setTwLoading(false)
    setTwEnd(false)

    nextArchiveAllowedAtRef.current = 0
    nextTWAllowedAtRef.current = 0

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
  }, [mode, triggerArchive, dispatch])

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
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (mode !== 'archive') return
    if (!cursor) return
    const el = sentinelRef.current
    if (!el) return
    let cancelled = false

    const io = new IntersectionObserver(async ([entry]) => {
      const now = Date.now()
      if (!entry.isIntersecting) return
      if (loadingMonth) return
      if (now < nextArchiveAllowedAtRef.current) return

      nextArchiveAllowedAtRef.current = now + LOAD_COOLDOWN_MS

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
      } catch (e: any) {
        // при 429 делаем бэкофф
        if (e?.status === 429) {
          nextArchiveAllowedAtRef.current = Date.now() + BACKOFF_429_MS
          setToast('Too many requests. Please wait…')
          setTimeout(() => setToast(null), 2200)
        }
      } finally {
        if (!cancelled) setLoadingMonth(false)
      }
    }, { rootMargin: '0px 0px 1000px 0px' })

    io.observe(el)
    return () => { cancelled = true; io.disconnect() }
  }, [cursor, loadedMonths, triggerArchive, dispatch, loadingMonth, mode])

  useEffect(() => {
    if (mode !== 'timeswire' || twEnd) return
    const el = sentinelRef.current
    if (!el) return
    let cancelled = false

    const io = new IntersectionObserver(async ([entry]) => {
      const now = Date.now()
      if (!entry.isIntersecting) return
      if (twLoadingRef.current) return
      if (now < nextTWAllowedAtRef.current) return

      nextTWAllowedAtRef.current = now + LOAD_COOLDOWN_MS

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
        if (e?.status === 429) {
          nextTWAllowedAtRef.current = Date.now() + BACKOFF_429_MS
          setToast('Too many requests. Please wait…')
          setTimeout(() => setToast(null), 2200)
        } else {
          setToast('Failed to load more articles')
          setTimeout(() => setToast(null), 2200)
        }
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
      const headerOffset = 72
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
  }, [sections])

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
      {/* <Loader active={isFetchingArchive || loadingMonth || twLoading || !booted} /> */}
      <Footer />
    </div>
  )
}
