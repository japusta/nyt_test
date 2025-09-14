import type { Article } from '../features/news/newsSlice'

interface CardProps {
  a: Article
}

// Card displays a single article. An optional image is shown at the top,
// followed by the headline and a metadata row with the source and
// publication time. The entire card is clickable and opens the
// original article in a new tab to prevent losing the current feed.
export default function Card({ a }: CardProps) {
  // Format publication date/time as shown in the reference: e.g. "Feb 26, 2023, 16.32 PM"
  const pub = new Date(a.pub_date_iso)
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false
  })
  const dateStr = `${dateFormatter.format(pub)}, ${timeFormatter.format(pub)}`
  const source = a.source || 'NYTimes'
  return (
    <a className="card" href={a.web_url} target="_blank" rel="noreferrer">
      {/* Thumbnail image shown on the left; only render when present */}
      {a.image && <img className="card-img" src={a.image} alt="" loading="lazy" />}
      <div className="card-content">
        {/* Source label */}
        <div className="card-source">{source}</div>
        {/* Headline */}
        <div className="card-title">{a.abstract}</div>
        {/* Publication date/time */}
        <div className="card-time">{dateStr}</div>
      </div>
    </a>
  )
}