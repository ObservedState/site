---
title: 'How this site runs: S3, CloudFront and CI for a few dollars a month'
description: 'The build, hosting and deploy pipeline behind observedstate.dev, written up as my first AWS lab.'
pubDate: 2026-10-07
hub: platform
spokes: [cloud, iac]
level: practitioner
format: field-note
draft: true
---

> Outline only. Fill in the real numbers once the site is live.

## The shape

- Astro builds static HTML. No database, no server.
- A private S3 bucket behind CloudFront with Origin Access Control.
- GitHub Actions deploys with OIDC, so there are no long-lived AWS keys anywhere.
- DNS in Route 53, certificate from ACM.

## Decisions worth explaining

- Why CloudFront needs a small function to resolve `/path/` to `/path/index.html` when the origin is the S3 REST endpoint.
- Why OIDC with a role scoped to one repo and one branch.
- Cache strategy: hashed assets cached for a year, HTML kept fresh by invalidation.

## What it costs

Actual monthly bill, and what drives it. Add the budget alarm you set.

## What I would do differently

A short honest list. Link the Terraform once it exists.
