# The Booth That Builds Itself

A live Factory installation with three surfaces:

- `/wall` is a fixed 16:9 LED-wall composition with isolated build slots and live GitHub shipping data.
- `/board` is a five-lane view of the configured Linear team's work.
- `/vote` is a mobile-first public ballot for Linear backlog ideas.

The app uses Next.js App Router, TypeScript, direct Linear and GitHub HTTP adapters, and Upstash Redis. Missing credentials produce deterministic setup states, so development and CI do not need production secrets.

## Local setup

Requirements: Node.js 22+ and npm.

```sh
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000/wall`. The root URL redirects to the wall.

## Commands

```sh
npm run dev          # local Next.js server
npm run lint         # ESLint
npm run typecheck    # strict TypeScript check
npm test             # Vitest suite
npm run build        # production build
npm run test:e2e     # Playwright wall smoke test
npm run seed:linear  # explicitly create missing seed tickets
```

Install the Playwright browser once before the smoke test:

```sh
npx playwright install chromium
```

## Linear

Set `LINEAR_API_KEY` to a server-side Linear personal API key and `LINEAR_TEAM_ID` to the Booth team's UUID. The team should have workflow states that normalize to:

1. Backlog
2. Todo
3. In Progress
4. In Review
5. Done

The adapter uses both state names and Linear state types. Unknown states fall back to Backlog. Board and ballot requests go through internal route handlers, so the API key never reaches the browser.

### Seed tickets

`scripts/seed-linear.ts` contains 20 compact, single-file tickets. Each description has implementation notes, acceptance criteria, exactly one intended file, and a stable `booth-seed` marker. The script checks existing descriptions and skips matching markers, making repeat runs idempotent.

The script writes to Linear only when a developer explicitly runs:

```sh
LINEAR_API_KEY=... LINEAR_TEAM_ID=... npm run seed:linear
```

It is never run by the app, tests, build, or CI.

## GitHub summary

Set `GITHUB_REPOSITORY` as `owner/repository`. Public repositories can be read without `GITHUB_TOKEN`, but GitHub applies a lower unauthenticated rate limit. Add a read-only token for higher limits.

The PR count intentionally contains a seeded double-count defect in `lib/github.ts`. Its desired behavior test is skipped so CI stays green until the corresponding Linear ticket is implemented.

## Voting and Redis

Create an Upstash Redis integration through Vercel Marketplace, then expose:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The Vercel `KV_REST_API_URL` and `KV_REST_API_TOKEN` aliases are also accepted. Without Redis, the app uses an in-process store for deterministic local and CI behavior. That fallback is not persistent and must not be used for a production ballot.

Votes are stored as one Redis set member per browser-generated voter ID per issue. A browser can vote once for each issue. No account or personal information is collected.

## Scheduled promotion

`vercel.json` invokes `/api/promote` every five minutes. Set:

- `CRON_SECRET` so Vercel sends `Authorization: Bearer <secret>`
- `PROMOTION_INTERVAL_MINUTES` to the desired promotion interval, defaulting to 10

The route also checks a Redis last-run timestamp. When due, it chooses the highest-voted issue still in Backlog. Ties resolve by oldest creation time and then issue ID. It resolves the team's Todo state, updates Linear, and clears only the winner's votes after the Linear mutation succeeds. Runs with no votes make no Linear change.

## Testing

Vitest covers registry integrity, Linear state mapping, GitHub summary behavior, vote validation and counting, promotion ordering and reset safety, seed idempotence, and the UI-copy character rule. Playwright opens `/wall`, checks the title and placeholders, and fails on runtime page errors.

All integrations have missing-environment fallbacks. CI runs install from the lockfile, lint, typecheck, unit tests, a production build, and the Chromium smoke test without secrets.

## Deploy to Vercel

1. Import the repository into Vercel.
2. Connect Upstash Redis through Vercel Marketplace.
3. add the Linear, GitHub, Redis, and cron environment variables from `.env.example`.
4. Confirm the cron in `vercel.json` is available for the selected Vercel plan.
5. Deploy and visit `/wall`, `/board`, and `/vote`.

Use a read-only GitHub token and scope all credentials to this project. Never prefix server secrets with `NEXT_PUBLIC_`.
