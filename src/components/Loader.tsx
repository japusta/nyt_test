interface LoaderProps {
  active: boolean
}

// Loader displays a simple three-dot spinner when active. The caller
// controls visibility by passing the `active` flag. Keeping the dots in
// the DOM but hidden would allow for smoother animations, however
// conditionally rendering saves on DOM nodes when inactive.
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