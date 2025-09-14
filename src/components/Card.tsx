import type { Article } from '../features/news/newsSlice'

interface CardProps {
  a: Article
}

export default function Card({ a }: CardProps) {
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
      {a.image && <img className="card-img" src={a.image} alt="" loading="lazy" />}
      <div className="card-content">
        <div className="card-source">{source}</div>
        <div className="card-title">{a.abstract}</div>
        <div className="card-time">{dateStr}</div>
      </div>
    </a>
  )
}