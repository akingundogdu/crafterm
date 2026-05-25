# Security Policy

## Supported versions

Crafterm is pre-1.0; only the latest `main` receives security fixes.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Instead, report privately via GitHub's
[Private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
("Report a vulnerability" under the repository's **Security** tab), or email the
maintainer.

Please include steps to reproduce, affected version/commit, and impact. You can
expect an initial response within a reasonable time frame, and coordinated
disclosure once a fix is available.

## Notes on local data

Crafterm is a local desktop app. It stores its state as JSON under
`~/.crafterm/`. Saved SSH connection details (including an optional password)
are stored there in plain text on your machine. Treat that directory as
sensitive and avoid syncing it to shared/cloud locations.
