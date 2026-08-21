# Owners Local OS

Owners Local OS is a mobile-first business operations platform for local business owners. It combines customer and lead management, estimates, scheduling, jobs, inventory, documents, accounting, payroll, reporting, and reviewed AI-assisted data entry.

## Run locally

1. Install Node.js.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and configure the required services.
4. Run `npm run dev`.

Use `npm run lint` for TypeScript validation and `npm run build` for a production build.

## Development requirements

Read [DEVELOPMENT_STANDARDS.md](./DEVELOPMENT_STANDARDS.md) before adding or redesigning data-entry workflows. Manual entry, reviewed AI Snapshot/autopopulate, and the shared financial taxonomy are required project standards.
