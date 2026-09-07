# Contributing

Use Node.js 22+, PostgreSQL 18 with pgvector, and npm.

Run `npm run demo:setup` before developing. Keep all fixtures fictional and explain which architectural or demo behaviour each fixture exercises.

New source connectors must use the source object/version and sync-run lifecycle. Source-native identifiers map through `resource_identity_keys`; do not create duplicate canonical Resources for an account, folder, or document already resolved elsewhere.

Do not query protected knowledge directly from application routes or UI code. Add permission-sensitive work to a repository/service that receives a client from `withActorTransaction`.

Before opening a change, run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
