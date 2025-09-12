# Core Line — React Test Task

Mobile news feed for NYTimes Archive (real data).

## Stack
- React + TypeScript
- Redux Toolkit + RTK Query
- Vite

## Run
```bash
npm i
npm run dev
```
Optional `.env`:
```
VITE_NYT_API_KEY=<your key>
# VITE_OFFLINE=1  # (only for demo/offline)
```

## How data is fetched (real NYT only)
- **Previous months**: fetched from `static.nytimes.com` (public JSON, no key) via Vite proxy `/nyts`.
- **Current month**: fetched from `api.nytimes.com` (requires key) via Vite proxy `/nyt`. If access is denied (403/429), UI stays stable and just doesn't add new items.

The app boots by probing backwards from the previous month to find the latest available archive (e.g., 2024/09), then supports infinite scroll to older months. Grouping by date, click-through to NYTimes, sticky date headers, left-menu button, and bottom loading dots are implemented per the test requirements.
