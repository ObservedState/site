---
title: 'Terraform for CMDB architects'
description: 'Learn infrastructure as code from the point of view of someone who owns the record of what exists.'
audience: 'CMDB and ITOM architects'
level: practitioner
spokes: [iac, cloud]
order: 2
draft: true
steps:
  - title: 'Terraform basics: providers, state and plans'
    kind: read
    note: 'Focus on state, since it is the closest thing Terraform has to a CMDB.'
  - title: 'Build a small stack with remote state'
    kind: build
    note: 'An S3 bucket and a CloudFront distribution is enough, and doubles as this site''s hosting.'
  - title: 'Compare Terraform state with what the CMDB says'
    kind: build
    note: 'Two sources of truth, one environment. Write down every disagreement.'
  - title: 'HashiCorp Terraform Associate'
    kind: cert
  - title: 'Write up state versus CMDB'
    kind: write
---

Notes on why state files and CMDBs are two answers to the same question.
