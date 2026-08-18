# E-Commerce Platform

Foundation monorepo for the web storefront and REST API.

## Requirements

- Node.js 24 LTS
- pnpm 10

## Development

Copy each `.env.example` to `.env.local` (web) or `.env` (API), then run:

```bash
pnpm install
pnpm dev
```

The web app runs at `http://localhost:3000`. The API runs at
`http://localhost:4000/api/v1`, with health available at `/health`.
