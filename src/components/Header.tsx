import { useState } from 'react'
import Drawer from './Drawer'
import type { FeedMode } from '../features/news/newsSlice'

interface HeaderProps {
  onSelectMode: (m: FeedMode) => void
  current: FeedMode
  categories: string[]
  onCategorySelect?: (category: string) => void
  titleDateISO?: string            // ← НОВОЕ

}

export default function Header({ onSelectMode, current, categories, onCategorySelect, titleDateISO }: HeaderProps) {
  const [open, setOpen] = useState(false)
  const today = new Date()
  const baseDate = titleDateISO ? new Date(titleDateISO) : new Date()

  const dateStr = `${String(baseDate.getDate()).padStart(2,'0')}.${String(baseDate.getMonth()+1).padStart(2,'0')}.${baseDate.getFullYear()}`
  
  return (
    <>
      <div className="header">
        <div className="header-top">
          <button className="icon-btn" aria-label="Menu" onClick={() => setOpen(true)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="#000000" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="brand-name">BESIDER</div>
        </div>
        <div className="header-title">News for {dateStr}</div>
      </div>
      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        onSelectMode={onSelectMode}
        current={current}
        categories={categories}
        onCategorySelect={onCategorySelect}
      />
    </>
  )
}