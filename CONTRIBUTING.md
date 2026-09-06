# Contributing

Use Node.js 22+, PostgreSQL 18 with pgvector, and npm.

Run `npm run demo:setup` before developing. Keep all fixtures fictional and explain which architectural or demo behaviour each fixture exercises.

Do not query protected knowledge directly from application routes or UI code. Add permission-sensitive work to a repository/service that receives a client from `withActorTransaction`.

Before opening a change, run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
