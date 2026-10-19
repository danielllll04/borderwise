# BorderWise frontend
React + TypeScript + Vite + Tailwind. Tabs: Home, Compare, Split, Agent, ATM & Alerts (EN/中文).

    cp .env.example .env     # VITE_USE_MOCK=true works without the backend
    pnpm install             # or npm install
    pnpm dev                 # http://localhost:5173

All network code: `src/api/api.ts` (live) and `src/api/mock.ts` (same contract).
Not backed by the server yet: Compare (`src/api/compare.ts` seeded), Split settlement (mock only).
