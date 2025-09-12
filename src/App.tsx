import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppDispatch, useAppSelector } from './app/store'
import { selectSections, upsertMany, Article } from './features/news/newsSlice'
import { useGetArchiveQuery, useLazyGetArchiveQuery } from './features/news/nytApi'

function monthAdd(d: Date, delta: number) { const nd = new Date(d); nd.setDate(1); nd.setMonth(nd.getMonth()+delta); return nd }
function prevMonth(d: Date) { return monthAdd(d, -1) }
function sameYM(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() }
function ymKey(d: Date) { return `${d.getFullYear()}-${d.getMonth()+1}` }

export default function App() {
  const dispatch = useAppDispatch()
  const [cursor, setCursor] = useState<Date | null>(null)
  const [loadedMonths, setLoadedMonths] = useState<Set<string>>(new Set())
  const [booted, setBooted] = useState(false)

  // current-month polling (won't run until booted & cursor set)
  const currentMonth = useMemo(() => new Date(), [])
  const { data: currentData } = useGetArchiveQuery(
    { year: currentMonth.getFullYear(), month: currentMonth.getMonth()+1 },
    { pollingInterval: 60_000, skip: !booted } // polling only after boot
  )

  const [trigger, { isFetching }] = useLazyGetArchiveQuery()
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // boot: find last available month from NYT (static first)
  useEffect(() => {
    (async () => {
      let probe = prevMonth(new Date())
      for (let i=0; i<24; i++) {
        try {
          const res = await trigger({ year: probe.getFullYear(), month: probe.getMonth()+1 }).unwrap()
          if (res.docs?.length) {
            dispatch(upsertMany(res.docs))
            setLoadedMonths(new Set([ymKey(probe)]))
            setCursor(probe)
            break
          }
        } catch {}
        probe = prevMonth(probe)
      }
      setBooted(true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // merge current month (polling)
  useEffect(() => {
    if (!currentData?.docs) return
    dispatch(upsertMany(currentData.docs))
    setToast('New articles loaded')
    const t = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(t)
  }, [currentData, dispatch])

  // sections grouped by date
  const sections = useAppSelector(selectSections)

  // infinite scroll
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!cursor) return
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(async (entries) => {
      const e = entries[0]
      if (!e.isIntersecting || loadingMonth) return
      const next = prevMonth(cursor)
      const key = ymKey(next)
      if (loadedMonths.has(key)) { setCursor(next); return }
      try {
        setLoadingMonth(true)
        const res = await trigger({ year: next.getFullYear(), month: next.getMonth()+1 }).unwrap()
        dispatch(upsertMany(res.docs))
        setLoadedMonths(new Set([...loadedMonths, key]))
        setCursor(next)
      } catch (err) {
        setToast('Failed to load prev month')
        setTimeout(() => setToast(null), 2500)
      } finally {
        setLoadingMonth(false)
      }
    }, { rootMargin: '900px 0px 0px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [cursor, loadedMonths, trigger, dispatch, loadingMonth])

  return (
    <div className="container">
      <Header />
      {toast && <div className="toast">{toast}</div>}
      <div className="list">
        {!booted && <Loader active={true} />}
        {booted && sections.length === 0 && (
          <div style={{padding:'16px', color:'#9aa8b1'}}>No data available from NYTimes yet. Try scrolling or check your network/API key.</div>
        )}
        {sections.map(sec => (
          <Section key={sec.date} date={sec.date} items={sec.items} />
        ))}
        <div ref={sentinelRef} className="sentinel" />
      </div>
      <Loader active={isFetching || !booted} />
    </div>
  )
}

function Header() {
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
      <Drawer open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function Drawer({ open, onClose }:{ open:boolean, onClose:()=>void }) {
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
        <div className="menu-item">Latest</div>
        <div className="menu-item">Bookmarks (stub)</div>
        <div className="menu-item">Settings (stub)</div>
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
