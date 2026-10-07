---
title: 'What happened to Cloud Provisioning and Governance, and how I would demo AWS stacks from ServiceNow today'
description: 'CPG was not retired so much as renamed and narrowed. What ServiceNow offers now for deploying, managing and retiring cloud stacks, and the lightest way to demo it against AWS.'
pubDate: 2026-10-07
hub: platform
spokes: [cloud, iac, automation-ai]
level: practitioner
format: teardown
draft: true
---

> Research notes from October 2026, not a finished post. Re-check each claim against current docs before publishing, and confirm the product names with your ServiceNow contacts.

## What changed

- The stack-based provisioning engine (`sn_cmp`) still exists, now as **Cloud Services Catalog (CSC)** under **ITOM Cloud Accelerate**. The Washington DC release renamed ITOM Governance to ITOM Cloud Accelerate, and CSC comes with the Cloud Accelerate entitlements.
- The Cloud Services Catalog API still covers Day-1 provisioning and Day-2 modification, including creating cloud service stacks, running resource operations and reading stack status. CSC is a separate subscription requiring the ITOM Enterprise bundle or Cloud Accelerate.
- What was removed or renamed was the connectors:
  - The Terraform connector became the **Cloud Services Catalog Terraform Connector**.
  - The Google Cloud connector was deprecated in Yokohama; users are pointed to the Terraform connector.
  - The IBM Terraform connector was deprecated in Utah.
  - A cloud-spend dashboard application was deprecated in Xanadu (the plugin list I read did not show its name, so confirm which one).

## Options for demoing AWS stacks

1. **AWS Service Management Connector** (free, from the ServiceNow Store). AWS Service Catalog portfolios appear as ServiceNow catalog items, including StackSets and Terraform products, with ServiceNow approvals. Needs no ITOM entitlement.
2. **IntegrationHub CloudFormation spoke** plus Flow Designer. Create, update and delete stack actions, change sets, StackSets. Requires an IntegrationHub subscription. The free **Cloud Deployment Automation** store app ships catalog items and flows for create and delete stack as a scaffold.
3. **HashiCorp's ServiceNow Service Catalog for Terraform**, which adds an approval gate (plan, approve, apply). Needs HCP Terraform.
4. **CSC itself**, only if you hold the entitlement and the demo is about ServiceNow's cloud governance story.

## Demo hygiene

- Dedicated AWS demo account, SCPs limiting regions and instance types, a budget alarm.
- An "expires in N hours" catalog variable and a scheduled flow that deletes the stack.
- A least-privilege launch role scoped to resources tagged `demo=true`.
- A "reset demo" catalog item that tears down everything a prospect launched.

## Sources

- [ITOM Cloud Accelerate release notes (Yokohama)](https://www.servicenow.com/docs/r/PbLI49fkISDFEQlMw_00Gg/l9U0WQmrLUE~q23JthZwGg)
- [ITOM Cloud Accelerate release notes (Washington DC)](https://www.servicenow.com/docs/r/Iru_OmfY8svQHlgM89Nuiw/U70hW8B4EU74gocDZVXMxg)
- [Changes to plugins in the Zurich release](https://www.servicenow.com/docs/r/zurich/release-notes/plugin-changes.html)
- [Cloud Services Catalog API (Zurich)](https://www.servicenow.com/docs/r/MVRCUFVyKWd7vUoUukbW6g/ZCEbxsRXBDGpf5nOw35Xuw)
- [AWS CloudFormation spoke](https://docs.servicenow.com/bundle/utah-integrate-applications/page/administer/integrationhub-store-spokes/concept/aws-cloudformation.html)
- [AWS Service Management Connector for ServiceNow](https://aws.amazon.com/blogs/mt/how-to-install-and-configure-the-aws-service-catalog-connector-for-servicenow)
- [HashiCorp: ServiceNow Catalog for Terraform approval workflow](https://www.hashicorp.com/blog/servicenow-catalog-for-terraform-adds-approval-workflow-integration)
