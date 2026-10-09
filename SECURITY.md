# Security Policy

## Reporting a vulnerability

Please **do not** open a public issue for security vulnerabilities.

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/learnermaker/thread-core/security/advisories/new). You will receive a response within 48 hours, and we aim to release a fix within 7 days of confirmation.

## Scope

thread-core is a pure-logic library with no network access, no authentication surface, and one runtime dependency (`zod`). Relevant security concerns include:

- Denial of service via crafted inputs
- Information disclosure through error messages or event payloads
- Bypassing evidence authorization checks

## Supported versions

Only the latest release is actively maintained.
