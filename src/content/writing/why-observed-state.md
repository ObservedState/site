---
title: 'Why "observed state"'
description: 'The idea behind the name: every environment has a declared version of itself and an observed one, and the CMDB is where they meet.'
pubDate: 2026-10-07
hub: cmdb
spokes: []
level: intro
format: deep-dive
draft: true
---

> Outline only. Write it in your own voice, then set `draft: false`.

## The two states

- Declared (desired) state: the Terraform, the change record, the architecture diagram, the standard build.
- Observed state: what Discovery, the cloud APIs and monitoring actually report.
- Drift is the gap. Reconciliation is closing it, either by changing reality or by correcting the record.

## Why the CMDB is the meeting point

- It should hold observed state, populated by Discovery, Service Graph Connectors and cloud APIs.
- Most organizations have several competing "declared" states and several "observed" ones, and nobody has reconciled them.
- Event Management, change risk and compliance all quietly depend on that reconciliation being right.

## What this site will cover

- The hub: ServiceNow ITOM and the CMDB.
- The spokes: cloud, IaC, monitoring, data integration, automation and AI.
- Learning paths and a running Drift Log of my own study.

## Closing

One concrete example from the field (sanitized) where declared and observed disagreed, and what it cost.
