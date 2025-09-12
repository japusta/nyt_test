// src/App.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from './app/store'
import { selectSections, upsertMany, Article, selectMode, setMode } from './features/news/newsSlice'
import {
  useGetArchiveQuery,
  useLazyGetArchiveQuery,
  useGetTimesWireQuery,
  useLazyGetTimesWireQuery,
} from './features/news/nytApi'

function monthAdd(d: Date, delta: number) { const nd = new Date(d); nd.setDate(1); nd.setMonth(nd.getMonth()+delta); return nd }
function prevMonth(d: Date) { return monthAdd(d, -1) }
function ymKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()+1}` }

export default function App() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector(selectMode)

  const [cursor, setCursor] = useState<Date | null>(null)
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set())
  const [booted, setBooted] = useState(false)

  // guard: актуальный режим для игнора устаревших ответов
  const modeRef = useRef(mode)
  useEffect(() => { modeRef.current = mode }, [mode])

  // ===== Archive: текущий месяц (polling)
  const currentMonth = useMemo(() => new Date(), [])
  const { data: currentData } = useGetArchiveQuery(
    { year: currentMonth.getFullYear(), month: currentMonth.getMonth()+1 },
    { pollingInterval: 60_000, skip: !booted || mode !== 'archive' }
  )
  const [triggerArchive, { isFetching: isFetchingArchive }] = useLazyGetArchiveQuery()
  const [loadingMonth, setLoadingMonth] = useState(false)

  // ===== TimesWire: первая страница + пагинация offset
  const [twOffset, setTwOffset] = useState(0)
  const [twLoading, setTwLoading] = useState(false)
  const [twEnd, setTwEnd] = useState(false)

  const { data: twData } = useGetTimesWireQuery(
    { source: 'nyt', section: 'all', limit: 20, offset: 0 },
    { skip: mode !== 'timeswire' }
  )
  const [triggerTW] = useLazyGetTimesWireQuery()

  const [toast, setToast] = useState<string | null>(null)

  // ===== Инициализация при смене режима
  useEffect(() => {
    setBooted(false)
    setCursor(null)
    setLoadedMonths(new Set())
    // Сброс параметров TimesWire
    setTwOffset(0); setTwLoading(false); setTwEnd(false)

    if (mode !== 'archive') { setBooted(true); return }

    let cancelled = false
    ;(async () => {
      let probe = prevMonth(new Date())
      for (let i=0; i<24; i++) {
        try {
          const res = await triggerArchive({ year: probe.getFullYear(), month: probe.getMonth()+1 }).unwrap()
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

  // ===== Archive: вливаем поллинг текущего месяца
  useEffect(() => {
    if (mode !== 'archive') return
    if (!currentData?.docs) return
    dispatch(upsertMany(currentData.docs))
    setToast('New articles loaded')
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [currentData, dispatch, mode])

  // ===== TimesWire: первая страница
  useEffect(() => {
    if (mode !== 'timeswire') return
    if (!twData?.docs) return
    dispatch(upsertMany(twData.docs))
    setTwOffset(20)                          // следующая страница
    setTwEnd(twData.docs.length < 20)        // если меньше 20 — дальше нечего грузить
  }, [twData, dispatch, mode])

  // ===== Секции
  const sections = useAppSelector(selectSections)

  // ===== Sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  // Archive: бесконечная прокрутка по месяцам
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
        const res = await triggerArchive({ year: next.getFullYear(), month: next.getMonth()+1 }).unwrap()
        if (cancelled || modeRef.current !== 'archive') return
        if (res.docs?.length) {
          dispatch(upsertMany(res.docs))
          setLoadedMonths(new Set([...Array.from(loadedMonths), key]))
        }
        setCursor(next)
      } finally {
        if (!cancelled) setLoadingMonth(false)
      }
    }, { rootMargin: '1000px 0px 0px 0px' })

    io.observe(el)
    return () => { cancelled = true; io.disconnect() }
  }, [cursor, loadedMonths, triggerArchive, dispatch, loadingMonth, mode])

  // TimesWire: бесконечная прокрутка offset'ами (0,20,40…)
  useEffect(() => {
    if (mode !== 'timeswire' || twEnd) return
    const el = sentinelRef.current
    if (!el) return
    let cancelled = false

    const io = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || twLoading) return

      setTwLoading(true)
      try {
        const res = await triggerTW({
          source: 'nyt',
          section: 'all',
          limit: 20,              // TimesWire: 1..20
          offset: twOffset        // 0, 20, 40, ...
        }).unwrap()

        // игнорируем устаревшие ответы, НО не выходим до finally
        const batch = (cancelled || modeRef.current !== 'timeswire') ? [] : (res.docs ?? [])

        if (batch.length) {
          dispatch(upsertMany(batch))
          setTwOffset(prev => prev + batch.length)
        }
        if (batch.length < 20) setTwEnd(true)
      } catch {
        // при ошибке можно показать тост, но лоадер всё равно снимем
      } finally {
        if (!cancelled) setTwLoading(false)
      }
    }, { rootMargin: '1000px 0px 0px 0px' })

    io.observe(el)
    return () => { cancelled = true; io.disconnect() }
  }, [mode, twOffset, twLoading, twEnd, triggerTW, dispatch])

  return (
    <div className="container">
      <Header onSelectMode={(m)=>dispatch(setMode(m))} current={mode} />
      {toast && <div className="toast">{toast}</div>}
      <div className="list">
        {!booted && <Loader active={true} />}
        {booted && sections.length === 0 && (
          <div style={{padding:'16px', color:'#9aa8b1'}}>No data available from NYTimes yet. Try switching mode or check your API key.</div>
        )}
        {sections.map(sec => (
          <Section key={sec.date} date={sec.date} items={sec.items} />
        ))}
        <div ref={sentinelRef} className="sentinel" />
      </div>
      <Loader active={isFetchingArchive || loadingMonth || twLoading || !booted} />
    </div>
  )
}

function Header({ onSelectMode, current }:{ onSelectMode:(m:'archive'|'timeswire')=>void, current:'archive'|'timeswire' }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="header">
        <button className="icon-btn" aria-label="Menu" onClick={() => setOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M4 12h16M4 18h16" stroke="#c7d2fe" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        <div className="title">NYTimes — Mobile Feed</div>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} onSelectMode={onSelectMode} current={current} />
    </>
  )
}

function Drawer({ open, onClose, onSelectMode, current }:{ open:boolean, onClose:()=>void, onSelectMode:(m:'archive'|'timeswire')=>void, current:'archive'|'timeswire' }) {
  return (
    <div className={"drawer"+(open ? " open" : "")} style={{display: open ? 'grid' : 'none'}}>
      <div className="drawer__backdrop" onClick={onClose} />
      <div className="drawer__panel">
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
          <div style={{fontWeight:700}}>Menu</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6l-12 12" stroke="#c7d2fe" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="menu-item" role="button" aria-pressed={current==='archive'} onClick={()=>{ onSelectMode('archive'); onClose(); }}>
          Load via Archive {current==='archive' ? '✓' : ''}
        </div>
        <div className="menu-item" role="button" aria-pressed={current==='timeswire'} onClick={()=>{ onSelectMode('timeswire'); onClose(); }}>
          Load via TimesWire {current==='timeswire' ? '✓' : ''}
        </div>
        <div className="menu-item">About</div>
      </div>
    </div>
  )
}

function Section({ date, items }:{ date:string, items: Article[] }) {
  return (
    <section aria-label={date}>
      <div className="date-sep">{date}</div>
      <div style={{display:'grid', gap:10}}>
        {items.map(a => <Card key={a.id} a={a} />)}
      </div>
    </section>
  )
}

function Card({ a }:{ a: Article }) {
  return (
    <a className="card" href={a.web_url} target="_blank" rel="noreferrer">
      {a.image && <img src={a.image} alt="" loading="lazy" />}
      <div style={{fontWeight:600, lineHeight:1.25}}>{a.abstract}</div>
      <div className="meta">
        <span className="source">{a.source ?? 'NYTimes'}</span>
        <time dateTime={a.pub_date_iso}>{new Date(a.pub_date_iso).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</time>
      </div>
    </a>
  )
}

function Loader({ active }:{ active:boolean }) {
  if (!active) return null
  return (
    <div className="loader">
      <div className="dots" aria-label="Loading">
        <div className="dot" />
        <div className="dot" />
        <div className="dot" />
      </div>
    </div>
  )
}
