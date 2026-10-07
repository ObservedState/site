# Deploying observedstate.dev

One-time setup in AWS and GitHub, after which every push to `main` builds and deploys the site. Replace the `<PLACEHOLDERS>` as you go. Nothing here is a secret: all the values go in repository **variables**, not secrets.

Everything below can be created in the console first. Codifying it in Terraform is a good lab and the natural next step (see the end).

## 1. S3 bucket

- A new bucket in your preferred region. **Block all public access** stays on.
- No static website hosting. CloudFront reads the bucket privately through Origin Access Control.

## 2. Certificate

- ACM certificate in **us-east-1** (required for CloudFront) for `observedstate.dev` and `www.observedstate.dev`.
- DNS validation: with the zone in Route 53, the console offers a "Create records" button.
- `.dev` is on the browser HSTS preload list, so browsers only load it over HTTPS. The certificate has to exist before the site works at all.

## 3. CloudFront distribution

- **Origin:** the S3 bucket (REST endpoint, not the website endpoint), with a new **Origin Access Control** (signing: always).
- **Default root object:** `index.html`.
- **Viewer protocol policy:** redirect HTTP to HTTPS. Compression on.
- **Alternate domain names:** `observedstate.dev` and `www.observedstate.dev`, with the certificate from step 2.
- **Viewer-request function:** create a CloudFront Function from `infra/cloudfront-rewrite.js` and attach it. Without it, `/writing/foo/` returns an error, because the origin is the S3 REST endpoint and S3 does not resolve directory indexes.
- **Custom error responses:** map both **403** and **404** to `/404.html` with response code **404**. S3 returns 403 for a missing key when the caller cannot list the bucket, which is the case here.
- After creation, copy the bucket policy that the console offers for OAC, or use this one:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowCloudFrontRead",
      "Effect": "Allow",
      "Principal": { "Service": "cloudfront.amazonaws.com" },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::<BUCKET>/*",
      "Condition": {
        "StringEquals": {
          "AWS:SourceArn": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
        }
      }
    }
  ]
}
```

## 4. DNS

In Route 53, create **A** and **AAAA** alias records for `observedstate.dev` (and `www` if you want it) pointing at the distribution. Decide whether `www` should redirect to the apex. The simplest approach is to serve both the same, then add a redirect function later.

## 5. GitHub OIDC role

No long-lived AWS keys. GitHub proves who it is, and AWS hands out short-lived credentials.

1. IAM, Identity providers, add provider: URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`. (Skip if it already exists in the account.)
2. Create an IAM role for the web identity above with this **trust policy**. Replace `<REPO>` with the site repository's name, which pins the role to that repo and to the `main` branch:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:ObservedState/<REPO>:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

3. Attach this **permissions policy** to the role. It can upload, delete and invalidate, and nothing else:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::<BUCKET>"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::<BUCKET>/*"
    },
    {
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::<ACCOUNT_ID>:distribution/<DISTRIBUTION_ID>"
    }
  ]
}
```

Note: the trust policy matches the job's `ref`. If you later add `environment:` to the deploy job in the workflow, GitHub changes the `sub` claim to `repo:ObservedState/<REPO>:environment:<NAME>` and the role will refuse to be assumed until you update the trust policy.

## 6. GitHub repository variables

Settings, Secrets and variables, Actions, **Variables**:

| Variable | Value |
|---|---|
| `AWS_REGION` | the bucket's region, for example `us-east-1` |
| `AWS_ROLE_ARN` | ARN of the role from step 5 |
| `S3_BUCKET` | bucket name |
| `CLOUDFRONT_DISTRIBUTION_ID` | distribution ID |

Also recommended on the repo: protect `main` and require the **build** check to pass before merging.

## 7. First deploy

1. Run `npm install` locally and commit `package-lock.json`.
2. Push to `main`, or run the workflow by hand from the Actions tab.
3. Check `https://observedstate.dev/`, a deep link such as `/spokes/cloud/`, the 404 page, `/rss.xml` and `/sitemap-index.xml`.

## Cost and housekeeping

- A static site this size is typically a few dollars a month or less, mostly Route 53 and CloudFront requests. Put a **budget alarm** on the account anyway.
- Hashed assets under `_astro/` are never deleted by the workflow. Prune old ones occasionally, or add a lifecycle rule.

## Next: codify it

Everything above is a good first Terraform project: the bucket, OAC, distribution, function, certificate, records, OIDC provider and role. Keep it in `infra/` and add a plan-on-pull-request job. Write it up for the Drift Log while you are at it.
