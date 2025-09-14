interface LoaderProps {
  active: boolean
}

export default function Loader({ active }: LoaderProps) {
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