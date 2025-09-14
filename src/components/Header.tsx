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

// The Header renders a sticky bar with a hamburger button and a title.
// When the button is tapped the drawer slides in from the left. The title
// displays the current date in DD/MM/YYYY format to mirror the reference
// screenshots. Categories and feed modes are passed through to the
// drawer so selections can be propagated up to App.
export default function Header({ onSelectMode, current, categories, onCategorySelect, titleDateISO }: HeaderProps) {
  const [open, setOpen] = useState(false)
  const today = new Date()
  // Format the date as DD.MM.YYYY (e.g. 15.06.2023) for display
  // Format date as DD.MM.YYYY to match the reference design
  const d = titleDateISO ? new Date(titleDateISO) : new Date()

  const dateStr = `${String(today.getDate()).padStart(2, '0')}.${String(today.getMonth() + 1).padStart(2, '0')}.${today.getFullYear()}`
  
  return (
    <>
      <div className="header">
        {/* Top bar with menu button and brand */}
        <div className="header-top">
          <button className="icon-btn" aria-label="Menu" onClick={() => setOpen(true)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="brand-name">BESIDER</div>
        </div>
        {/* Page title with current date */}
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