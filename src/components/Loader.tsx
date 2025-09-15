interface LoaderProps {
  active: boolean;
}

export default function Loader({ active }: LoaderProps) {
  if (!active) return null;
  return (
    <div className="loader">
      <div className="spinner" aria-label="Loading">
        <div></div><div></div><div></div><div></div>
        <div></div><div></div><div></div><div></div>
      </div>
    </div>
  );
}
