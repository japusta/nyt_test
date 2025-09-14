import type { Article } from '../features/news/newsSlice'
import Card from './Card'

interface SectionProps {
  date: string
  items: Article[]
}

// Section groups a list of articles under a date. Each date becomes a
// sticky separator as the user scrolls. The items are rendered as
// individual cards. Because the Card component anchors the <a> tag,
// clicking a card opens the article in a new tab.
export default function Section({ date, items }: SectionProps) {
  const iso = items[0]?.pub_date_iso?.slice(0,10) // YYYY-MM-DD

  return (
    <section aria-label={date} data-iso={iso}>
      <div className="date-sep">{date}</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((a) => (
          <Card key={a.id} a={a} />
        ))}
      </div>
    </section>
  )
}