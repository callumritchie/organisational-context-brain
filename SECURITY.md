# Security policy

## Supported versions

This project is an early public prototype. Security fixes are applied to the latest revision on `main`.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository rather than opening a public issue. Include the affected component, reproduction steps, and likely impact. Do not include real organisational data or credentials.

## Deployment warning

The included personas, data, database names, and local/CI passwords are synthetic development fixtures. The `x-demo-actor` header is not authentication. Do not expose this application or its PostgreSQL service to the public internet without replacing the demo persona mechanism with authenticated sessions, rotating every database credential, restricting network access, and completing a deployment-specific security review.
