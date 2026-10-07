---
title: 'Your CMDB is a desired-state document'
description: 'Most CMDBs claim to hold observed state but are maintained like declared state. A look at where the two quietly diverge.'
pubDate: 2026-10-07
hub: cmdb
spokes: [data]
level: architect
format: deep-dive
draft: true
---

> Outline only. This one is an opinion piece, so the examples matter more than the structure.

## The claim

A CMDB is supposed to describe what is. In practice it is often edited by hand, loaded from spreadsheets, or populated by sources nobody has ranked, which makes it a record of what someone once intended.

## Where it shows up

- Manually created CIs that Discovery never confirms.
- Several sources writing the same attributes with no precedence rules.
- CIs that outlive the thing they describe because nothing retires them.
- Relationships that were modeled once and never re-observed.

## What changes if you treat it as observed state

- Source precedence is a design decision, not an accident of load order.
- Every CI carries evidence of when it was last observed, and staleness has a policy.
- Hand edits to discovered attributes are exceptions that expire.

## What I would measure

Pick three numbers (for example, share of CIs observed in the last 30 days) and show how to compute them.

## Closing

One sanitized example from a source-consolidation project.
