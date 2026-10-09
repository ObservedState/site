# ObservedState setup runbook (Windows 11)

This is the single authoritative setup document for observedstate.dev. It takes a bare Windows 11 PC to a site that builds and deploys itself whenever you merge to `main`. Every command is here. The only other files it uses are the policy and config templates in this `docs/` folder, which are named where they are used.

> **Status of this runbook:** the commands were written against the current AWS CLI v2, GitHub CLI and OpenTofu 1.10+ documentation, but the author could not execute them. Your first run is the test. Every step ends with a **Checkpoint** that says what correct output looks like. When a checkpoint does not match, stop and fix that step before moving on.

## Contents

0. How this runbook works
1. Install the toolchain
2. Git, SSH key and GitHub sign-in
3. Clone the repo, add the scaffold, run it locally
4. Protect the repo (free plan)
5. AWS: pin the account, create the `observedstate` IAM user
6. OpenTofu and its state bucket
7. Build the hosting stack
8. Wire GitHub to AWS and ship
- Day-to-day workflow
- Costs
- Appendix A: undo and start over
- Appendix B: troubleshooting

---

## 0. How this runbook works

### Conventions

- **Terminal:** Windows Terminal with the **PowerShell 7** profile (`pwsh`). Windows PowerShell 5.1 also works. The blocks avoid PowerShell 7-only features. Step 1 installs PowerShell 7.
- **Folders:** the site repo is `C:\dev\site` (GitHub `ObservedState/site`, public). The infrastructure repo is `C:\dev\infra` (GitHub `ObservedState/infra`, private). Keep both outside OneDrive.
- **Run blocks exactly as written.** Text in `<ANGLE_BRACKETS>` is the only thing you replace by hand. Everything else, including variables, is filled in for you.
- **Where commands run:** unless a block begins with `Set-Location`, run it from the **site repo root** (`C:\dev\site`).
- **Stop on error.** If any command prints a red error, do not continue. Compare with the Checkpoint and Appendix B.
- **One terminal per sitting.** Variables live in the terminal. If you open a new one, run the **Session block** at the top of the step you are on.

### Who does what in AWS

| Identity | Used for | How |
|---|---|---|
| `rook` (your existing admin) | Step 5 only (IAM setup, budget), plus the two console tasks in Step 7 (certificate, CloudFront distribution) | CLI profile named in `docs\local.ps1`, and the console |
| `observedstate` (new, least-privilege, CLI-only) | Everything else on AWS | CLI profile `observedstate` |
| GitHub Actions | Deploys the site | Role `observedstate-site-deploy`, over OIDC, no stored keys |

### The account guard

Most of the pain in a multi-account setup is running a command in the wrong account. `docs\session.ps1` defines `Use-AwsProfile`, which sets the profile **and refuses to continue** if the account is not the stacknimbus account you pinned in Step 5.1. Every AWS block in this runbook starts with it.

### Files in this folder

| File | Purpose | Used in |
|---|---|---|
| `session.ps1` | PowerShell helpers: account guard, template rendering, LF file writer | Steps 3 to 8 |
| `local.ps1` | Account ID (392264151451), admin profile (`stacknimbus-rook`), alert email. **Created by you, git-ignored** | Step 5.1 |
| `boundary-policy.json` | Permissions boundary `observedstate-boundary` | 5.4 |
| `operator-policy.json` | Permissions for the `observedstate` user | 5.5 |
| `budget.json`, `budget-notifications.json` | Tag-filtered monthly budget | 5.9 |
| `state-lifecycle.json` | Expires old OpenTofu state versions | 6.2 |
| `bucket-policy.json` | Lets only your CloudFront distribution read the site bucket | 7.5 |
| `route53-aliases.json` | Apex and www aliases to CloudFront | 7.6 |
| `trust-policy.json` | Who may assume the GitHub deploy role | 7.7 |
| `deploy-policy.json` | What the deploy role may do | 7.7 |
| `ruleset-protect-main.json` | Branch protection for `main` | 4.2 |
| `repo-security.json` | Secret scanning settings | 4.3 |

Templates contain `__PLACEHOLDERS__`. `Render-Template` fills them in and writes the result to `docs\rendered\` (git-ignored). It stops if any placeholder is unknown. Never edit the files in `docs\rendered\`.

### Money and plan limits, up front

- **GitHub Free plan:** rulesets and branch protection work on **public** repos only. This is why the site repo is public. The `infra` repo is private and has no branch protection, which is acceptable for a solo repo that deploys nothing by itself. GitHub Team, secret scanning on private repos, and private-repo Actions minutes are paid. None is needed.
- **AWS (stacknimbus account):** an established account, so no free-plan credits are involved. Costs are small: a Route 53 zone (if you do not already have one), a few cents of S3 and CloudFront at blog scale, a free ACM certificate. See the Costs section.
- **Do not use your Free Tier study account** for any of this. Step 5.1 pins the account so you cannot by accident.

---

## 1. Install the toolchain

**Cost:** $0. **AWS needed:** no.

Open Windows Terminal. Run:

```powershell
$packages = 'Git.Git', 'GitHub.cli', 'OpenJS.NodeJS.LTS', 'Microsoft.VisualStudioCode', 'Microsoft.PowerShell', 'Amazon.AWSCLI', 'OpenTofu.Tofu'
foreach ($p in $packages) {
    winget install --id $p -e --accept-package-agreements --accept-source-agreements
}
```

If winget reports that a package is already installed, that is fine. If it reports "No package found matching input criteria", run `winget search <name>` and use the ID it prints.

**Close every terminal window, then reopen Windows Terminal** so the new `PATH` is loaded. In the dropdown, open the profile named **PowerShell** (not "Windows PowerShell"). To make it the default: Settings, Startup, Default profile.

Allow npm to run in PowerShell (your user only, no admin needed):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Install the VS Code extensions:

```powershell
$extensions = 'astro-build.astro-vscode', 'github.vscode-github-actions', 'hashicorp.terraform', 'redhat.vscode-yaml'
foreach ($e in $extensions) { code --install-extension $e }
```

**Checkpoint:**

```powershell
git --version
gh --version
node --version
npm --version
aws --version
tofu --version
$PSVersionTable.PSVersion.ToString()
```

Expected: Git 2.x, gh 2.x, Node 20.3 or newer (the site needs at least 20.3), npm 10 or newer, `aws-cli/2.x`, OpenTofu **1.10 or newer** (needed for S3 state locking without DynamoDB), and PowerShell 7.x.

---

## 2. Git, SSH key and GitHub sign-in

**Cost:** $0. **AWS needed:** no.

### 2.1 Tell Git who you are

```powershell
git config --global user.name "John Jones"
git config --global user.email "<YOUR_GITHUB_EMAIL>"
git config --global init.defaultBranch main
git config --global core.autocrlf false
git config --global pull.ff only
```

Use your GitHub account's email, or the `…@users.noreply.github.com` address shown in GitHub under Settings, Emails.

### 2.2 Make Git use the Windows OpenSSH

Git for Windows bundles its own `ssh`, which cannot see the Windows ssh-agent. Point it at the system one:

```powershell
git config --global core.sshCommand "C:/Windows/System32/OpenSSH/ssh.exe"
```

### 2.3 Start the ssh-agent service (one time, as Administrator)

Right-click Windows Terminal, choose **Run as administrator**, and run:

```powershell
Set-Service -Name ssh-agent -StartupType Automatic
Start-Service ssh-agent
Get-Service ssh-agent | Format-Table Name, Status, StartType
```

**Checkpoint:** `Status` is `Running` and `StartType` is `Automatic`. Close the administrator window and return to your normal terminal.

### 2.4 Create the key and load it

```powershell
$ssh = "$env:SystemRoot\System32\OpenSSH"
New-Item -ItemType Directory -Force "$env:USERPROFILE\.ssh" | Out-Null
& "$ssh\ssh-keygen.exe" -t ed25519 -C "rook@observedstate.dev" -f "$env:USERPROFILE\.ssh\id_ed25519_observedstate"
& "$ssh\ssh-add.exe" "$env:USERPROFILE\.ssh\id_ed25519_observedstate"
& "$ssh\ssh-add.exe" -l
```

Choose a passphrase when `ssh-keygen` asks. `ssh-add` asks for it once, and the agent remembers it.

**Checkpoint:** `ssh-add -l` lists a line ending in `rook@observedstate.dev (ED25519)`.

### 2.5 Tell SSH to use that key for GitHub

```powershell
$sshConfig = "$env:USERPROFILE\.ssh\config"
$already = (Test-Path $sshConfig) -and (Select-String -Path $sshConfig -Pattern 'id_ed25519_observedstate' -Quiet)
if (-not $already) {
    Add-Content -Path $sshConfig -Encoding Ascii -Value @"

Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_observedstate
  IdentitiesOnly yes
"@
}
Get-Content $sshConfig
```

If your config already has a `Host github.com` block for another GitHub account, do not add a second one. Use a different host name instead: change `Host github.com` to `Host github-os`, and from then on clone with `git@github-os:ObservedState/site.git` and use `ssh -T git@github-os` for tests.

### 2.6 Sign in with the GitHub CLI and upload the key

```powershell
gh auth login --hostname github.com --git-protocol ssh --web
gh auth refresh --hostname github.com --scopes admin:public_key,workflow
gh ssh-key add "$env:USERPROFILE\.ssh\id_ed25519_observedstate.pub" --title "OS.dev Windows PC"
gh auth status
```

`gh auth login` opens a browser. Sign in as the GitHub account that owns the `ObservedState` organization. If login already offered to upload your key, `gh ssh-key add` will say the key is already in use, which is fine.

**Checkpoint:** `gh auth status` shows `Logged in to github.com account <you>` with Git operations protocol `ssh`.

### 2.7 Test the SSH connection

```powershell
& "$env:SystemRoot\System32\OpenSSH\ssh.exe" -T git@github.com
```

Accept the host fingerprint on first connection. **Checkpoint:** `Hi <you>! You've successfully authenticated, but GitHub does not provide shell access.` The command exits with code 1, which is expected.

### 2.8 Commit signing: skipped

This runbook does not sign commits. GitHub Desktop cannot use SSH signing reliably, and a wrong key path produces `Couldn't load public key … No such file or directory` on every commit. If you enabled signing earlier, remove it at every level:

```powershell
git config --global --unset-all user.signingkey
git config --global commit.gpgsign false
git config --global --unset-all gpg.format
```

And inside any repo where the error persists:

```powershell
git config --local --unset-all user.signingkey
git config --local commit.gpgsign false
git config --show-origin --get-all user.signingkey
```

The last command prints nothing when no signing key is configured anywhere.

---

## 3. Clone the repo, add the scaffold, run it locally

**Cost:** $0. **AWS needed:** no.

### 3.1 Clone

```powershell
New-Item -ItemType Directory -Force C:\dev | Out-Null
Set-Location C:\dev
gh repo clone ObservedState/site
Set-Location C:\dev\site
git status
```

If you already cloned to another folder, you can keep it, but check that it is not inside OneDrive:

```powershell
$here = (Get-Location).Path
if ($env:OneDrive -and $here.StartsWith($env:OneDrive, [System.StringComparison]::OrdinalIgnoreCase)) { 'MOVE THE REPO: it is inside OneDrive.' } else { 'OK: not inside OneDrive.' }
```

**Checkpoint:** `git status` says `On branch main`. A brand-new empty repo also says `No commits yet`.

### 3.2 Unpack the scaffold (new repo only)

Skip this if the repo already contains the scaffold (it has `package.json` and `src\`). Otherwise, with `observedstate-site.zip` in your Downloads folder:

```powershell
$zip = "$env:USERPROFILE\Downloads\observedstate-site.zip"
$tmp = Join-Path $env:TEMP 'observedstate-unzip'
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
if (Test-Path (Join-Path $tmp 'package.json')) { $src = $tmp } else { $src = (Get-ChildItem $tmp -Directory | Select-Object -First 1).FullName }
robocopy $src C:\dev\site /E /NFL /NDL /NJH /NJS
Remove-Item -Recurse -Force $tmp
```

`robocopy` exit codes 0 to 7 mean success. **Checkpoint:** `Get-ChildItem C:\dev\site -Force | Select-Object -ExpandProperty Name` lists `.github`, `.gitignore`, `.nvmrc`, `docs`, `infra`, `package.json`, `src`, and more.

### 3.3 Line endings and ignore rules

Load the session helpers and write the files with LF line endings and no byte-order mark:

```powershell
Set-Location C:\dev\site
. .\docs\session.ps1

Write-LfFile -Path .gitattributes -Text @'
* text=auto eol=lf
*.png binary
*.ico binary
*.zip binary
'@

$ignore = Get-Content .gitignore -Raw
foreach ($line in 'docs/rendered/', 'docs/local.ps1') {
    if ($ignore -notmatch [regex]::Escape($line)) { $ignore = $ignore.TrimEnd() + "`n" + $line + "`n" }
}
Write-LfFile -Path .gitignore -Text $ignore
Get-Content .gitignore
```

**Checkpoint:** `.gitignore` lists `node_modules/`, `dist/`, `.astro/`, `.env`, `docs/rendered/` and `docs/local.ps1`.

### 3.4 Install, check, build, preview

```powershell
node --version
npm install
npm run check
npm run build
npm run dev
```

`npm run dev` serves `http://localhost:4321` and shows draft content. Press `Ctrl+C` to stop it.

**Expect something to fail the first time.** The scaffold was written without being built. If `npm run check` or `npm run build` prints an error, copy the exact text and get it fixed before going on. `npm install` creates `package-lock.json`. It must be committed, because the deploy workflow runs `npm ci`.

### 3.5 First commit and push

```powershell
git add -A
git status --short
git commit -m "Add Astro scaffold and setup docs"
git push -u origin main
```

Read the `git status --short` output before committing. It must not list `node_modules`, `dist`, `.env`, `docs/rendered` or `docs/local.ps1`. You can also do the commit and push in GitHub Desktop.

**Checkpoint:** the push succeeds. In a few seconds `gh run list --limit 3` shows a **Build and deploy** run. Its **build** job should pass. The **deploy** job fails or skips until Step 8. That is expected.

---

## 4. Protect the repo (free plan)

**Cost:** $0 on a public repo. **AWS needed:** no.

### 4.1 Make sure the site repo is public

Rulesets are free on public repositories only.

```powershell
gh repo view ObservedState/site --json visibility --jq .visibility
```

If the output is `PRIVATE` and you want it public (the recommended path for a blog):

```powershell
gh repo edit ObservedState/site --visibility public --accept-visibility-change-consequences
```

Before making a repo public, confirm that the history contains no secrets, keys or private notes. **Checkpoint:** the command now prints `PUBLIC`.

### 4.2 Add the branch ruleset

The ruleset blocks deleting `main`, blocks force pushes, requires a pull request, and requires the `build` check to pass. **From now on nothing goes to `main` except by a merged pull request**, which is the intent.

```powershell
Set-Location C:\dev\site
gh run list --limit 3
gh api --method POST repos/ObservedState/site/rulesets --input docs/ruleset-protect-main.json --jq '.id'
gh api repos/ObservedState/site/rulesets --jq '.[] | [.id, .name, .enforcement] | @tsv'
```

The `build` check name only exists after a workflow has run once (Step 3.5 does that). **Checkpoint:** the last command prints one line: `<id>  protect-main  active`. To remove the ruleset later: `gh api --method DELETE repos/ObservedState/site/rulesets/<id>`.

**If the repo must stay private** (no rulesets on the free plan), use this local guard instead. It blocks direct pushes to `main` from this clone only:

```powershell
Write-LfFile -Path .git\hooks\pre-push -Text @'
#!/bin/sh
while read local_ref local_sha remote_ref remote_sha; do
  if [ "$remote_ref" = "refs/heads/main" ]; then
    echo "Direct pushes to main are blocked locally. Use a branch and a pull request."
    exit 1
  fi
done
exit 0
'@
```

### 4.3 Free security features

```powershell
gh api --method PUT repos/ObservedState/site/vulnerability-alerts
gh api --method PUT repos/ObservedState/site/automated-security-fixes
gh api --method PATCH repos/ObservedState/site --input docs/repo-security.json --jq '.security_and_analysis'
'{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}' | gh api --method PUT repos/ObservedState/site/actions/permissions/workflow --input -
Test-Path .github\dependabot.yml
```

**Checkpoint:** the `PATCH` prints a JSON object where `secret_scanning` and `secret_scanning_push_protection` show `"status": "enabled"`, and `Test-Path` prints `True`. On a repo that is not public, those two scanning features are a paid add-on and the `PATCH` may be refused, which you can ignore.

If `.github\dependabot.yml` is missing, create it and commit it through a pull request (Step 8.3 shows the flow):

```powershell
Write-LfFile -Path .github\dependabot.yml -Text @'
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
'@
```

### 4.4 Two-factor authentication for the organization (browser only)

There is no CLI for this. Open `https://github.com/organizations/ObservedState/settings/security`, tick **Require two-factor authentication for everyone in the ObservedState organization**, and save. It is free. Make sure your own account has two-factor enabled first.

### 4.5 Secrets rule

The deploy path stores **no secrets** in GitHub. Repository variables hold identifiers only, and AWS access is by OIDC. Never commit access keys, `.tfvars` files with real values, `terraform.tfstate`, or `docs\local.ps1`.

---

## 5. AWS: pin the account, create the `observedstate` IAM user

**Cost:** $0 to set up. **AWS needed:** yes, your existing stacknimbus account.

This step creates a fence inside stacknimbus: one dedicated user whose policy reaches only resources named `observedstate-*`, one Route 53 zone, CloudFront and ACM, plus a permissions boundary so that user cannot create a role more powerful than the deploy role needs.

### 5.1 Create the `stacknimbus-rook` CLI profile and pin the account

Two accounts are in play on your machine, and mixing them up is the main risk in this runbook:

| Account | ID | Purpose | CLI profile |
|---|---|---|---|
| **stacknimbus** | `392264151451` | Everything in this runbook | `stacknimbus-rook` (this step) |
| Cloud Study | `266913478849` | Certification study. **Never build here** | `default` |

Sign-ins in stacknimbus: the **root** user (`admin@stacknimbus.io`) is for emergencies only and is never used by this runbook, and there is no root access key. Day-to-day admin work is done by the IAM user **`rook`**, through the profile **`stacknimbus-rook`**. The runbook never uses the `default` profile.

**Create the profile.** You need an access key for the `rook` IAM user in stacknimbus. In the console (signed in to stacknimbus as `rook`): **IAM > Users > rook > Security credentials > Create access key > Command Line Interface (CLI)**. Copy both values, then:

```powershell
aws configure --profile stacknimbus-rook
# AWS Access Key ID:     (paste)
# AWS Secret Access Key: (paste)
# Default region name:   us-east-1
# Default output format: json
```

If `rook` in stacknimbus signs in with IAM Identity Center instead, run `aws configure sso --profile stacknimbus-rook` and use `aws sso login --profile stacknimbus-rook` at the start of each session.

**Check it before anything else:**

```powershell
aws sts get-caller-identity --profile stacknimbus-rook
```

`Account` must be `392264151451` and `Arn` must end in `user/rook`. If it shows `266913478849`, you pasted the study account's key: run `aws configure --profile stacknimbus-rook` again with the stacknimbus key.

**Pin the account and write `docs\local.ps1`.** Pressing Enter accepts the values in brackets:

```powershell
Set-Location C:\dev\site
. .\docs\session.ps1

$acctInput = Read-Host 'stacknimbus AWS account ID [392264151451]'
if (-not $acctInput) { $acctInput = '392264151451' }
if ($acctInput -notmatch '^\d{12}$') { throw 'That is not a 12-digit account ID.' }
if ($acctInput -eq '266913478849') { throw 'That is the Cloud Study account. Use the stacknimbus account.' }
$adminInput = Read-Host 'CLI profile for the rook user in stacknimbus [stacknimbus-rook]'
if (-not $adminInput) { $adminInput = 'stacknimbus-rook' }
if ($adminInput -eq 'default') { throw 'The default profile is the Cloud Study account. Use stacknimbus-rook.' }
$emailInput = Read-Host 'Email address for budget alerts'
if ($emailInput -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'That does not look like an email address.' }

$localLines = @(
    "`$ExpectedAccount = '$acctInput'",
    "`$AdminProfile    = '$adminInput'",
    "`$SiteRepo        = 'site'",
    "`$AlertEmail      = '$emailInput'"
)
Set-Content -LiteralPath .\docs\local.ps1 -Value $localLines -Encoding Ascii
. .\docs\session.ps1
Get-Content .\docs\local.ps1
```

**Checkpoint:** `Get-Content` shows four lines with your values.

### 5.2 Verify `stacknimbus-rook` is in the right account

```powershell
Use-AwsProfile $AdminProfile
$acct = $Tokens['ACCOUNT_ID']
```

**Checkpoint:** a green `OK  profile=…  account=<your stacknimbus ID>  identity=arn:aws:iam::392264151451:user/rook`.

**If it prints `WRONG ACCOUNT`, stop.** Your admin profile is in a different account than the one you pinned. Either the pinned ID is wrong (fix `docs\local.ps1`) or you are using the wrong profile. Do not continue until this prints `OK`. Anything already built in another account must be undone (Appendix A).

### 5.3 Look around before creating anything

```powershell
aws organizations describe-organization --query Organization.Id --output text
aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[].Arn" --output text
aws s3api list-buckets --query "Buckets[?starts_with(Name, 'observedstate')].Name" --output text
Restore-State
```

How to read it:

- `describe-organization` printing an error `AWSOrganizationsNotInUseException` means a standalone account, which is fine. If it prints an organization ID, service control policies may restrict regions or services. If a later step is denied for no reason you can find, check them.
- If the OIDC list contains an ARN ending `token.actions.githubusercontent.com`, Step 7.7 reuses it.
- The bucket list should be empty. If it shows `observedstate.dev-site-…` or anything else left from earlier attempts, delete it (Appendix A) before Step 7.
- `Restore-State` prints the values it found. `ZONE_ID` is the Route 53 zone ID for `observedstate.dev`. **If it prints `NONE`, the zone is not in this account**: DNS records in Step 7 must be created at whatever hosts the zone, and the Route 53 statements in the policy match nothing, which is harmless.

### 5.4 Create the permissions boundary

```powershell
$f = Render-Template 'boundary-policy.json'
aws iam create-policy --policy-name observedstate-boundary --policy-document $f --description "Permissions boundary for roles created by the observedstate user" --tags Key=Project,Value=observedstate --query Policy.Arn --output text
```

**Checkpoint:** prints `arn:aws:iam::<ID>:policy/observedstate-boundary`. If it says `EntityAlreadyExists`, update the existing policy instead:

```powershell
aws iam create-policy-version --policy-arn "arn:aws:iam::${acct}:policy/observedstate-boundary" --policy-document $f --set-as-default
```

### 5.5 Create the operator policy

```powershell
$f = Render-Template 'operator-policy.json'
aws iam create-policy --policy-name observedstate-operator --policy-document $f --description "Least-privilege policy for the observedstate CLI user" --tags Key=Project,Value=observedstate --query Policy.Arn --output text
```

**Checkpoint:** prints `arn:aws:iam::<ID>:policy/observedstate-operator`. To change it later, edit `docs\operator-policy.json`, run `$f = Render-Template 'operator-policy.json'` again, then `aws iam create-policy-version --policy-arn "arn:aws:iam::${acct}:policy/observedstate-operator" --policy-document $f --set-as-default`.

### 5.6 Create the user and attach the policy

```powershell
aws iam create-user --user-name observedstate --tags Key=Project,Value=observedstate
aws iam attach-user-policy --user-name observedstate --policy-arn "arn:aws:iam::${acct}:policy/observedstate-operator"
aws iam list-attached-user-policies --user-name observedstate --query "AttachedPolicies[].PolicyName" --output text
```

**Checkpoint:** the last command prints `observedstate-operator`. The user has **no console password** by design. Do your console work as `rook`.

### 5.7 Create the access key and the CLI profile

The key is written straight into your AWS credentials file. It is never printed.

```powershell
$key = aws iam create-access-key --user-name observedstate --query "AccessKey.[AccessKeyId,SecretAccessKey]" --output text
if ($LASTEXITCODE -ne 0 -or -not $key) { throw 'create-access-key failed' }
$keyId, $keySecret = $key -split '\s+'
aws configure set aws_access_key_id $keyId --profile observedstate
aws configure set aws_secret_access_key $keySecret --profile observedstate
aws configure set region us-east-1 --profile observedstate
aws configure set output json --profile observedstate
Remove-Variable key, keyId, keySecret
Start-Sleep -Seconds 15
```

The pause lets IAM finish propagating the new user. The credentials file is `%USERPROFILE%\.aws\credentials`, which holds keys in plain text. Keep it out of OneDrive and out of Git.

### 5.8 Verify the new user, and verify the fence holds

```powershell
Use-AwsProfile observedstate
aws s3api list-buckets --query "length(Buckets)" --output text
aws ec2 describe-vpcs --region us-east-1
aws iam list-users
```

**Checkpoint:**

1. `Use-AwsProfile` prints `OK … identity=arn:aws:iam::<ID>:user/observedstate`.
2. `list-buckets` prints a number.
3. `ec2 describe-vpcs` **must fail** with `UnauthorizedOperation` or "not authorized to perform: ec2:DescribeVpcs".
4. `iam list-users` **must fail** with `AccessDenied`.

If either of the last two succeeds, the user has more access than intended. Run `aws iam list-attached-user-policies --user-name observedstate` and `aws iam list-user-policies --user-name observedstate` as `rook` and remove anything unexpected.

### 5.9 A budget that watches only this project

This uses `stacknimbus-rook` and a `Project` tag filter. The email is read from `docs\local.ps1`.

```powershell
Use-AwsProfile $AdminProfile
$acct = $Tokens['ACCOUNT_ID']
$b  = Render-Template 'budget.json'
$bn = Render-Template 'budget-notifications.json'
aws budgets create-budget --account-id $acct --budget $b --notifications-with-subscribers $bn
aws budgets describe-budgets --account-id $acct --query "Budgets[].BudgetName" --output text
Use-AwsProfile observedstate
```

**Checkpoint:** `describe-budgets` lists `observedstate-monthly`. The budget only sees data once the `Project` cost-allocation tag is active (Step 7.10). A budget warns you. It does not stop spending. If the account has no account-wide budget yet, create one in the console (Billing and Cost Management, Budgets), since an account-wide one needs no tag.

You are now back on the `observedstate` profile. **Do not use `stacknimbus-rook` again** except where a step says so.

### 5.10 What you do not need

- **A VPC.** S3, CloudFront, ACM, Route 53 and IAM are not VPC resources. The policy deliberately has no EC2 or VPC rights. For later labs, use a separate OpenTofu configuration with its own `observedstate-lab` VPC and its own policy, and never use the account's default VPC. Do not add a NAT gateway without a teardown plan.
- **A second AWS account or Organization.** The dedicated user, name prefix, boundary and tagged budget are the fence.
- **Console access for `observedstate`.**

---

## 6. OpenTofu and its state bucket

**Cost:** pennies. **AWS needed:** yes.

OpenTofu is the open-source Terraform fork. The command is `tofu`, and it reads the same `.tf` files.

### 6.1 Session block

```powershell
Set-Location C:\dev\site
. .\docs\session.ps1
Use-AwsProfile observedstate
Restore-State
$acct        = $Tokens['ACCOUNT_ID']
$stateBucket = $Tokens['STATE_BUCKET']
```

### 6.2 Create the state bucket

The bucket that stores state cannot be created by the configuration that uses it, so create it once with the CLI:

```powershell
aws s3api create-bucket --bucket $stateBucket --region us-east-1
aws s3api put-public-access-block --bucket $stateBucket --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
aws s3api put-bucket-versioning --bucket $stateBucket --versioning-configuration Status=Enabled
aws s3api put-bucket-lifecycle-configuration --bucket $stateBucket --lifecycle-configuration (Get-DocUri 'state-lifecycle.json')
aws s3api put-bucket-tagging --bucket $stateBucket --tagging "TagSet=[{Key=Project,Value=observedstate}]"
```

New buckets are encrypted with S3-managed keys by default, so no encryption call is needed.

**Checkpoint:**

```powershell
aws s3api get-bucket-versioning --bucket $stateBucket --query Status --output text
aws s3api get-public-access-block --bucket $stateBucket --query "PublicAccessBlockConfiguration.[BlockPublicAcls,BlockPublicPolicy]" --output text
```

Expected: `Enabled`, then `True	True`.

### 6.3 Create the infra repo

```powershell
Set-Location C:\dev
gh repo create ObservedState/infra --private --clone
Set-Location C:\dev\infra
New-Item -ItemType Directory -Force site | Out-Null

Write-LfFile -Path .gitignore -Text @'
.terraform/
*.tfstate
*.tfstate.*
*.tfvars
*.tfvars.json
crash.log
override.tf
override.tf.json
*_override.tf
.terraformrc
terraform.rc
'@
Write-LfFile -Path .gitattributes -Text "* text=auto eol=lf`n"
```

If the repo already exists, use `gh repo clone ObservedState/infra` instead of `gh repo create`. Do not ignore `.terraform.lock.hcl`: commit it so provider versions stay pinned.

### 6.4 Write the backend configuration

```powershell
Write-LfFile -Path site\backend.tf -Text @"
terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    bucket       = "$stateBucket"
    key          = "site/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

provider "aws" {
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = "observedstate"
      ManagedBy = "opentofu"
    }
  }
}
"@
Get-Content site\backend.tf | Select-String 'bucket'
```

`use_lockfile = true` keeps the lock in S3 next to the state, so no DynamoDB table is needed. **Checkpoint:** the last line shows `bucket       = "observedstate-tfstate-<ID>"`.

### 6.5 Initialize and prove it works

```powershell
Set-Location C:\dev\infra\site
tofu init
tofu fmt -check
tofu validate
tofu plan
```

**Checkpoint:** `tofu init` ends with `OpenTofu has been successfully initialized!`, `validate` says `The configuration is valid.`, and `plan` says `No changes. Your infrastructure matches the configuration.` An empty plan is the correct result: no resources are declared yet, and it proves credentials, backend and provider all work. If `tofu fmt -check` prints a file name, run `tofu fmt` and re-check.

### 6.6 Commit and push the infra repo

```powershell
Set-Location C:\dev\infra
git add -A
git status --short
git commit -m "Bootstrap OpenTofu with S3 backend"
git branch -M main
git push -u origin main
Set-Location C:\dev\site
```

`git status --short` should list `.gitattributes`, `.gitignore`, `site/.terraform.lock.hcl` and `site/backend.tf`, and nothing under `.terraform/`.

The resources in Step 7 are built by hand now. Recreating them as OpenTofu configuration in this repo is the natural next project.

---

## 7. Build the hosting stack

**Cost:** tiny S3 and CloudFront usage; a Route 53 zone only if you have to create one. **AWS needed:** yes.

The order matters, because later steps need identifiers produced by earlier ones: site bucket, certificate, rewrite function, CloudFront distribution, bucket policy, DNS, deploy role.

### 7.0 Session block

```powershell
Set-Location C:\dev\site
. .\docs\session.ps1
Use-AwsProfile observedstate
Restore-State
$acct       = $Tokens['ACCOUNT_ID']
$siteBucket = $Tokens['SITE_BUCKET']
$zoneId     = $Tokens['ZONE_ID']
```

Run this block again whenever you start a new terminal in Step 7 or 8.

### 7.1 The site bucket

The name **must** start with `observedstate-` (a hyphen, not a dot) so that the IAM policies match it, and should not contain dots at all.

```powershell
aws s3api create-bucket --bucket $siteBucket --region us-east-1
aws s3api put-public-access-block --bucket $siteBucket --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
aws s3api put-bucket-tagging --bucket $siteBucket --tagging "TagSet=[{Key=Project,Value=observedstate}]"
aws s3api get-public-access-block --bucket $siteBucket --query "PublicAccessBlockConfiguration.[BlockPublicAcls,IgnorePublicAcls,BlockPublicPolicy,RestrictPublicBuckets]" --output text
```

**Checkpoint:** the last command prints `True	True	True	True`. There is no static website hosting. CloudFront reads the bucket privately.

### 7.2 The certificate (console, as `rook`)

CloudFront accepts certificates from **us-east-1** only. `.dev` domains are HTTPS-only (HSTS preloaded), so the site does not work at all without a certificate.

1. Sign in to the console as `rook`, in the stacknimbus account. Check the account ID under your name at the top right.
2. Set the region selector (top right) to **US East (N. Virginia) us-east-1**.
3. Search for **Certificate Manager**, open it, choose **Request**, **Request a public certificate**, **Next**.
4. **Fully qualified domain name:** `observedstate.dev`. Choose **Add another name to this certificate** and enter `www.observedstate.dev`.
5. Leave **Allow export** on **Disable export**. **Validation method:** **DNS validation**. Leave the key algorithm at the default.
6. Under **Tags** add `Project` = `observedstate`. Choose **Request**.
7. Open the certificate. Status is **Pending validation**. In **Domains**, if the `observedstate.dev` zone is in this account's Route 53, choose **Create records in Route 53**, tick both domains, and choose **Create records**. If that button is missing, the zone lives elsewhere: copy each CNAME name and value into the DNS host that holds the zone.
8. Wait. Each domain turns to **Success** and the status to **Issued**, usually in a few minutes and sometimes up to 30.

Keep the two validation CNAME records in the zone. ACM uses them to renew the certificate automatically.

**Checkpoint (back in PowerShell):**

```powershell
Restore-State | Out-Null
$certArn = $Tokens['CERT_ARN']
$certArn
aws acm describe-certificate --certificate-arn $certArn --region us-east-1 --query "Certificate.[Status,DomainName,SubjectAlternativeNames]" --output text
```

Expected: an ARN starting `arn:aws:acm:us-east-1:<ID>:certificate/`, then `ISSUED`, `observedstate.dev`, and both names. If `CERT_ARN` is empty, the certificate is not issued yet or is in another region.

### 7.3 The CloudFront rewrite function

S3 does not serve directory indexes, so `/writing/foo/` needs rewriting to `/writing/foo/index.html`. This creates the function from `infra\cloudfront-rewrite.js` and publishes it:

```powershell
$fnName = 'observedstate-rewrite'
$fnCode = Get-FileUri -Path (Join-Path $RepoRoot 'infra\cloudfront-rewrite.js') -Binary
$etag = aws cloudfront create-function --name $fnName --function-config "Comment=observedstate-rewrite,Runtime=cloudfront-js-2.0" --function-code $fnCode --query ETag --output text
$fnArn = aws cloudfront publish-function --name $fnName --if-match $etag --query "FunctionSummary.FunctionMetadata.FunctionARN" --output text
Set-Token FUNCTION_ARN $fnArn
aws cloudfront describe-function --name $fnName --stage LIVE --query "FunctionSummary.[Name,Status]" --output text
```

**Checkpoint:** prints `observedstate-rewrite	UNASSOCIATED`. It becomes associated in 7.4. If the first command says the function already exists, it is already created: fetch its status with the last command and continue.

### 7.4 The CloudFront distribution (console, as `rook`)

The console wizard is redesigned from time to time, so page names may differ slightly. The plan below creates the distribution with the minimum in the wizard, then sets everything else on the distribution afterward, which works with either layout. Have ready: the site bucket (7.1), the certificate showing **Issued** (7.2), and the published function (7.3).

**Part A: create it**

1. Open **CloudFront** from the console search bar. CloudFront is global, so the region selector does not matter.
2. Choose **Create distribution**.
3. Name it `observedstate-site`. Add the tag `Project` = `observedstate` if the wizard offers tags.
4. Origin type **Amazon S3**. Choose bucket `observedstate-site-<ID>` from the list. Choose the bucket itself (`….s3.us-east-1.amazonaws.com`). Never choose or type a website endpoint (`s3-website…`), because that endpoint cannot be private.
5. If you see **Allow private S3 bucket access to CloudFront** or an **Origin access** choice, pick that, or **Origin access control settings (recommended)** with signing **Sign requests (recommended)**. Create a new control if asked. Leave **Origin path** empty and Origin Shield off.
6. If the wizard asks about web application firewall protection, choose **do not enable** (paid extra, not needed).
7. If the wizard asks for a pricing plan, choose **pay-as-you-go**. Flat-rate plans exist; check their terms before using one with a custom domain and a function.
8. Review and choose **Create distribution**. Status reads **Deploying**.
9. A banner says the bucket policy needs updating. **Ignore it.** Step 7.5 applies the correct policy from the command line.

**Part B: set the distribution's options.** Open the distribution from the list.

10. **General** tab, **Settings**, **Edit**.
11. **Price class:** **Use only North America and Europe** (lowest cost), or all edge locations if your readers are worldwide.
12. **Alternate domain name (CNAME):** **Add item** `observedstate.dev`, then `www.observedstate.dev`.
13. **Custom SSL certificate:** choose your certificate. If it is not listed, it is not in us-east-1, is not **Issued**, or does not cover both names.
14. **Default root object:** `index.html`. Leave **IPv6** on. Leave the security policy at its default. **Save changes**.
15. **Behaviors** tab, tick **Default (*)**, **Edit**. **Viewer protocol policy:** **Redirect HTTP to HTTPS**. **Compress objects automatically:** **Yes**. **Cache policy:** **CachingOptimized**.
16. **Function associations**, **Viewer request**: function type **CloudFront Functions**, function `observedstate-rewrite`. **Save changes**.
17. **Error pages** tab, **Create custom error response**: **HTTP error code** `403`, **Customize error response** **Yes**, **Response page path** `/404.html`, **HTTP Response code** `404`. Create.
18. Repeat 17 for **HTTP error code** `404`, with the same path and response code.
19. Back on **General**, wait until **Last modified** shows a date instead of **Deploying**.

**Checkpoint (PowerShell):** read the settings back and compare.

```powershell
Restore-State | Out-Null
$distId = $Tokens['DISTRIBUTION_ID']
$distId
aws cloudfront get-distribution-config --id $distId --query "DistributionConfig.[Aliases.Items,DefaultRootObject,ViewerCertificate.ACMCertificateArn]" --output json
aws cloudfront get-distribution-config --id $distId --query "DistributionConfig.DefaultCacheBehavior.[ViewerProtocolPolicy,Compress,FunctionAssociations.Items[0].EventType]" --output text
aws cloudfront get-distribution-config --id $distId --query "DistributionConfig.CustomErrorResponses.Items[].[ErrorCode,ResponsePagePath,ResponseCode]" --output text
aws cloudfront get-distribution-config --id $distId --query "DistributionConfig.Origins.Items[0].[DomainName,OriginAccessControlId]" --output text
```

Expected, in order: both domain names, `index.html`, and your certificate ARN; `redirect-to-https	True	viewer-request`; two lines `403	/404.html	404` and `404	/404.html	404`; and `observedstate-site-<ID>.s3.us-east-1.amazonaws.com` followed by a non-empty origin access control ID. Fix anything that differs in the console.

### 7.5 The bucket policy

This lets only your distribution read the bucket.

```powershell
$f = Render-Template 'bucket-policy.json'
aws s3api put-bucket-policy --bucket $siteBucket --policy $f
aws s3api get-bucket-policy --bucket $siteBucket --query Policy --output text
```

**Checkpoint:** the policy prints with your bucket name and your distribution ID in it. `Render-Template` stops with a message if `DISTRIBUTION_ID` is missing, which means 7.4 is not finished.

### 7.6 DNS records for the site

If `$zoneId` is `NONE`, the zone is elsewhere: create an alias or CNAME at your DNS host for `observedstate.dev` and `www.observedstate.dev` pointing at the distribution domain name (`$Tokens['DISTRIBUTION_DOMAIN']`) and skip to 7.7. Otherwise, first look at what already exists at those names:

```powershell
aws route53 list-resource-record-sets --hosted-zone-id $zoneId --query "ResourceRecordSets[?Name=='observedstate.dev.' || Name=='www.observedstate.dev.'].[Name,Type]" --output text
```

You will see the `NS` and `SOA` records for the apex, which are normal and are not touched. If you see `A`, `AAAA` or `CNAME` records you did not expect, note them: the next command **replaces** any existing `A`/`AAAA` at those names. A `CNAME` at the same name would block the change, and must be removed first. Mail records (`MX`, `TXT`) are never touched.

```powershell
$f = Render-Template 'route53-aliases.json'
$changeId = aws route53 change-resource-record-sets --hosted-zone-id $zoneId --change-batch $f --query ChangeInfo.Id --output text
aws route53 wait resource-record-sets-changed --id $changeId
aws route53 list-resource-record-sets --hosted-zone-id $zoneId --query "ResourceRecordSets[?Type=='A' || Type=='AAAA'].[Name,Type,AliasTarget.DNSName]" --output text
```

**Checkpoint:** four alias lines (`A` and `AAAA` for the apex and for `www`), each pointing at your `….cloudfront.net.` name. `Z2FDTNDATAQYW2` in the template is the fixed AWS hosted zone ID for all CloudFront aliases.

### 7.7 The GitHub deploy role

GitHub proves who it is, and AWS hands out short-lived credentials. No access keys are stored anywhere.

```powershell
$oidc = aws iam list-open-id-connect-providers --query "OpenIDConnectProviderList[?contains(Arn, 'token.actions.githubusercontent.com')].Arn | [0]" --output text
if (-not $oidc -or $oidc -eq 'None') {
    aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com --tags Key=Project,Value=observedstate
} else {
    "Reusing the existing GitHub OIDC provider: $oidc"
}

$trust  = Render-Template 'trust-policy.json'
$deploy = Render-Template 'deploy-policy.json'
$roleArn = aws iam create-role --role-name observedstate-site-deploy --assume-role-policy-document $trust --permissions-boundary "arn:aws:iam::${acct}:policy/observedstate-boundary" --tags Key=Project,Value=observedstate --query Role.Arn --output text
aws iam put-role-policy --role-name observedstate-site-deploy --policy-name deploy --policy-document $deploy
$roleArn
aws iam get-role --role-name observedstate-site-deploy --query "Role.[Arn,PermissionsBoundary.PermissionsBoundaryArn]" --output text
```

**Checkpoint:** the last command prints the role ARN and then the `observedstate-boundary` ARN. If `create-role` returns AccessDenied, the `--permissions-boundary` argument was missing or mistyped: your policy only allows roles created with it. If it says the role already exists, update instead: `aws iam update-assume-role-policy --role-name observedstate-site-deploy --policy-document $trust` and re-run the `put-role-policy` line.

**Trust policy trap:** the `sub` condition must match what GitHub puts in the token, and that depends on the repository. Newer repositories use GitHub's **immutable** form, `repo:ObservedState@<owner id>/site@<repo id>:ref:refs/heads/main`, and older ones use `repo:ObservedState/site:ref:refs/heads/main`. `Restore-State` asks GitHub which one applies (`gh api repos/ObservedState/site/actions/oidc/customization/sub`) and stores the prefix as `SUB_PREFIX`, which `docs\trust-policy.json` uses. If you rebuild the repository, run `Restore-State` again before creating the role. If you ever add `environment:` to the workflow's deploy job, GitHub changes the claim to end in `:environment:<name>` and the role refuses until you update the trust policy. The deploy workflow deliberately has no `environment:`.

### 7.8 Wait for CloudFront to finish deploying

```powershell
aws cloudfront wait distribution-deployed --id $Tokens['DISTRIBUTION_ID']
aws cloudfront get-distribution --id $Tokens['DISTRIBUTION_ID'] --query "Distribution.Status" --output text
```

This can take 5 to 15 minutes. **Checkpoint:** `Deployed`.

### 7.9 Smoke test with a throwaway file

```powershell
$domain = $Tokens['DISTRIBUTION_DOMAIN']
'ok' | Set-Content -Path "$env:TEMP\os-test.txt" -Encoding Ascii
aws s3 cp "$env:TEMP\os-test.txt" "s3://$siteBucket/os-test.txt"
curl.exe -s -o NUL -w '%{http_code}\n' "https://$domain/os-test.txt"
curl.exe -s -o NUL -w '%{http_code}\n' "https://observedstate.dev/os-test.txt"
aws s3 rm "s3://$siteBucket/os-test.txt"
Remove-Item "$env:TEMP\os-test.txt"
```

**Checkpoint:** both `curl.exe` calls print `200`. A `403` right after deployment usually clears within a minute or two. If the first call is `200` and the second is not, DNS has not propagated yet or the aliases in 7.6 are wrong.

### 7.10 Cost-allocation tag (admin, tomorrow)

The budget in Step 5.9 filters on the `Project` tag. AWS only offers a tag for activation after a tagged resource has existed for a while, usually a day. Run this the next day:

```powershell
Use-AwsProfile $AdminProfile
aws ce update-cost-allocation-tags-status --cost-allocation-tags-status TagKey=Project,Status=Active
Use-AwsProfile observedstate
```

If it says the tag key was not found, try again later. Activation itself is free.

---

## 8. Wire GitHub to AWS and ship

**Cost:** $0 beyond Step 7. **AWS needed:** yes.

### 8.1 Set the repository variables

These are **repository** variables, not environment variables, and not secrets. Environment variables are invisible to a workflow job that does not declare an `environment:`, so they would arrive empty.

```powershell
Set-Location C:\dev\site
. .\docs\session.ps1
Use-AwsProfile observedstate
Restore-State | Out-Null
$acct       = $Tokens['ACCOUNT_ID']
$repoSlug   = 'ObservedState/site'
$roleArn    = "arn:aws:iam::${acct}:role/observedstate-site-deploy"

gh variable set AWS_REGION                 --repo $repoSlug --body 'us-east-1'
gh variable set AWS_ROLE_ARN               --repo $repoSlug --body $roleArn
gh variable set S3_BUCKET                  --repo $repoSlug --body $Tokens['SITE_BUCKET']
gh variable set CLOUDFRONT_DISTRIBUTION_ID --repo $repoSlug --body $Tokens['DISTRIBUTION_ID']
gh variable list --repo $repoSlug
```

**Checkpoint:** the list shows exactly four rows. Compare `S3_BUCKET` with `observedstate-site-<ID>` (hyphen, no dot) and `AWS_ROLE_ARN` with `arn:aws:iam::<ID>:role/observedstate-site-deploy`. Also confirm none are stored per environment: `gh api repos/ObservedState/site/environments --jq '.environments[].name'` should print nothing. Delete any environment copies with `gh variable delete <NAME> --env <ENV> --repo $repoSlug`.

### 8.2 Publish at least one real page

All seed content is `draft: true`, so a production build is nearly empty.

1. Edit `src\pages\about.astro` and replace the bracketed placeholders. Check your employment agreement's outside-activity clauses first. Leave out your employer's and clients' names.
2. Edit the three lists at the top of `src\pages\now.astro`.
3. See what is still a draft, then set `draft: false` on the one or two posts you are ready to publish (`why-observed-state` and `how-this-site-runs` are the natural first ones):

```powershell
Select-String -Path src\content\*\*.md -Pattern '^draft: true' | ForEach-Object { $_.Path }
npm run check
npm run build
npm run preview
```

`npm run preview` serves the production build at `http://localhost:4321`. Click through it, then press `Ctrl+C`.

### 8.3 Deploy through a pull request

Because of the ruleset in Step 4.2, `main` only changes through a merged pull request.

```powershell
git switch main
git pull
git switch -c first-content
git add -A
git status --short
git commit -m "First content and deploy variables"
git push -u origin first-content
gh pr create --fill --base main
Start-Sleep -Seconds 20
gh pr checks --watch
gh pr merge --squash --delete-branch
git switch main
git pull
Start-Sleep -Seconds 10
$runId = gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $runId --exit-status
```

**Checkpoint:** the pull request's **build** check passes, the merge succeeds, and the run on `main` finishes with both **build** and **deploy** green. If **deploy** fails at the AWS step, see Appendix B.

### 8.4 Verify the live site

```powershell
foreach ($p in '/', '/spokes/cloud/', '/rss.xml', '/sitemap-index.xml', '/nope/') {
    $code = curl.exe -s -o NUL -w '%{http_code}' "https://observedstate.dev$p"
    '{0,-22} {1}' -f $p, $code
}
curl.exe -sI https://observedstate.dev/ | Select-String -Pattern 'HTTP/|x-cache|content-type'
```

**Checkpoint:** `/`, `/spokes/cloud/`, `/rss.xml` and `/sitemap-index.xml` print `200`, and `/nope/` prints `404`. Open the site in a browser, check the favicon, and open `/nope/` to see the styled 404 page. If the page loads but is unstyled, the `_astro/` assets did not sync: read the workflow log for the second `aws s3 sync`.

### 8.5 Confirm email is untouched

Mail for the domain is hosted at Spacemail. Adding the alias records does not change MX, SPF or DKIM, but check:

```powershell
$zoneId = $Tokens['ZONE_ID']
aws route53 list-resource-record-sets --hosted-zone-id $zoneId --query "ResourceRecordSets[?Type=='MX' || Type=='TXT'].[Name,Type]" --output text
```

Then send yourself a test message.

---

## Day-to-day workflow

```powershell
Set-Location C:\dev\site
git switch main
git pull
git switch -c post-my-topic
npm run dev
```

1. Write the Markdown file in `src\content\writing\`. Keep `draft: true` while you work, and watch it at `http://localhost:4321`.
2. When ready, set `draft: false`, then `npm run check` and `npm run build`.
3. Ship it:

```powershell
git add -A
git commit -m "Post: my topic"
git push -u origin post-my-topic
gh pr create --fill --base main
Start-Sleep -Seconds 20
gh pr checks --watch
gh pr merge --squash --delete-branch
git switch main
git pull
```

The merge to `main` deploys.

**Weekly:** merge Dependabot pull requests once their build passes.

**Monthly:** open Billing and check the `Project` tag cost. In `C:\dev\infra\site`, once the stack is in OpenTofu, run `tofu plan` to see drift (a good Drift Log entry). Prune old `_astro/` files if the bucket grows.

**Every few months, rotate the `observedstate` access key:**

```powershell
Set-Location C:\dev\site
. .\docs\session.ps1
Use-AwsProfile observedstate
aws iam list-access-keys --user-name observedstate --query "AccessKeyMetadata[].[AccessKeyId,CreateDate,Status]" --output text
```

An IAM user can hold two keys. Create the second as in Step 5.7 (as `$AdminProfile`), switch the profile to it, run `Use-AwsProfile observedstate` to check it, then delete the old one as admin:

```powershell
Use-AwsProfile $AdminProfile
aws iam delete-access-key --user-name observedstate --access-key-id <OLD_ACCESS_KEY_ID>
Use-AwsProfile observedstate
```

---

## Costs

Prices and limits change. Treat this as a map of where to look, and confirm on the vendor's pricing page before buying.

| Item | Cost | Needed? |
|---|---|---|
| GitHub Team (rulesets and protections on private repos) | Per user, per month | **No.** Public site repo, or the local hook in Step 4.2. |
| GitHub secret scanning on private repos | Paid add-on | **No.** Free on public repos. |
| GitHub Actions minutes on private repos | Free allowance, then metered | **No.** The site repo is public. |
| A new AWS account, Organizations, IAM Identity Center | Free to run, more to manage | **No.** The IAM user, prefix, boundary and tagged budget are the fence. |
| `.dev` domain renewal | Yearly | Yes. Already yours. |
| Route 53 hosted zone | Small monthly fee per zone | An existing zone adds nothing. Do not create a second one by accident. |
| CloudFront, S3, ACM | Pennies at blog scale (ACM public certs are free) | Yes. |
| AWS Budgets | Free for the first budgets | Yes. Step 5.9. |
| AWS Support plans | Paid | **No.** Basic support is free. |
| CloudWatch, WAF, Shield Advanced, NAT gateways, Elastic IPs | Metered, some costly | **No.** None is part of this design. |
| A VPC for the blog | Free itself, but it invites paid parts | **No.** |
| Spacemail mailboxes | Already paid | Yes. |
| Paid fonts, themes, analytics | Varies | **No.** The site self-hosts IBM Plex and has no analytics. |

The blog shares an invoice with everything else in stacknimbus. Use the tag-filtered budget to see its share, and check Cost Explorer grouped by the `Project` tag once a month.

---

## Appendix A: undo and start over

Use these only to clean up something built in the wrong account, or to start a step again. Check the account first: `Use-AwsProfile <profile>` must say `OK`. In the **wrong** account, temporarily set `$ExpectedAccount` to that account's ID in `docs\local.ps1` and load `docs\session.ps1` again, so the guard lets you in, then put the right ID back. `Use-AwsProfile` refuses the `default` profile, so to clean up the Cloud Study account, run the `aws` commands directly with `$env:AWS_PROFILE='default'` after checking `aws sts get-caller-identity`. Anything that may contain data (buckets) is emptied first and cannot be recovered.

**Delete a bucket and everything in it:**

```powershell
$bucket = '<BUCKET_NAME>'
aws s3 rb "s3://$bucket" --force
```

For a versioned bucket, `--force` leaves old versions. Delete the bucket in the console (Empty, then Delete) instead.

**Delete a CloudFront distribution** (it must be disabled and fully deployed first):

```powershell
$distId = '<DISTRIBUTION_ID>'
$cfg    = aws cloudfront get-distribution-config --id $distId --output json | Out-String | ConvertFrom-Json
$etag   = $cfg.ETag
$cfg.DistributionConfig.Enabled = $false
$cfg.DistributionConfig | ConvertTo-Json -Depth 30 | Set-Content -Path "$env:TEMP\disable.json" -Encoding Ascii
aws cloudfront update-distribution --id $distId --if-match $etag --distribution-config "file://$($env:TEMP -replace '\\','/')/disable.json"
aws cloudfront wait distribution-deployed --id $distId
$etag = aws cloudfront get-distribution --id $distId --query ETag --output text
aws cloudfront delete-distribution --id $distId --if-match $etag
```

**Delete the CloudFront function:**

```powershell
$etag = aws cloudfront describe-function --name observedstate-rewrite --query ETag --output text
aws cloudfront delete-function --name observedstate-rewrite --if-match $etag
```

**Delete the deploy role:**

```powershell
aws iam delete-role-policy --role-name observedstate-site-deploy --policy-name deploy
aws iam delete-role --role-name observedstate-site-deploy
```

**Delete the `observedstate` user, policies and boundary** (as `$AdminProfile`):

```powershell
Use-AwsProfile $AdminProfile
foreach ($k in (aws iam list-access-keys --user-name observedstate --query "AccessKeyMetadata[].AccessKeyId" --output text) -split '\s+') { if ($k) { aws iam delete-access-key --user-name observedstate --access-key-id $k } }
aws iam detach-user-policy --user-name observedstate --policy-arn "arn:aws:iam::${acct}:policy/observedstate-operator"
aws iam delete-user --user-name observedstate
aws iam delete-policy --policy-arn "arn:aws:iam::${acct}:policy/observedstate-operator"
aws iam delete-policy --policy-arn "arn:aws:iam::${acct}:policy/observedstate-boundary"
```

Delete the boundary only after every role that uses it is gone, or AWS refuses. Then remove the `observedstate` profile from `%USERPROFILE%\.aws\credentials` and `%USERPROFILE%\.aws\config` by hand, and delete the ACM certificate in the console (Certificate Manager, in us-east-1).

---

## Appendix B: troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `Couldn't load public key … No such file or directory` on commit | Commit signing is on, with a key path that does not exist | Step 2.8, at global and local level. `git config --show-origin --get-all user.signingkey` shows where it is set. |
| `winget` says no package found | The ID changed | `winget search <name>` and use the printed ID |
| `npm : … running scripts is disabled` | PowerShell execution policy | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| `node`, `tofu` or `aws` not recognized right after install | `PATH` not refreshed | Close and reopen the terminal |
| `Permission denied (publickey)` | Key not on the right GitHub account, or Git using its bundled ssh | `gh ssh-key list`, and the `core.sshCommand` setting from 2.2 |
| `WRONG ACCOUNT` from `Use-AwsProfile` | The profile is in a different account than the one pinned in `docs\local.ps1` | Fix the profile or the pinned ID. Do not work around the guard. |
| `NoSuchEntity … Scope ARN … policy/observedstate-boundary does not exist or is not attachable` on `create-role` | The CLI is in a different account than the one holding the boundary policy | `aws sts get-caller-identity`, then `Use-AwsProfile observedstate` |
| `create-role` returns AccessDenied | `--permissions-boundary` missing or wrong | Use the command in 7.7 exactly |
| `OperationAborted` on `create-bucket` right after deleting a bucket of the same name | S3 holds a deleted bucket name for a while, longer when the new bucket is in another region | Retry every few minutes (it took about an hour once). Nothing else is wrong. |
| `... is not digitally signed` when loading `session.ps1` | Files from a downloaded zip carry the "from the internet" mark | `Unblock-File` on the file, or on the whole repo: `Get-ChildItem <repo> -Recurse -File \| Unblock-File`, with the execution policy from Step 1 |
| `argument --account-id: expected one argument` | `$acct` is empty because `session.ps1` is old or `Use-AwsProfile` has not run in this window | Load the current `session.ps1`, run `Use-AwsProfile`, then `$acct = $Tokens['ACCOUNT_ID']` |
| `X is not a valid attribute name: .gitattributes:N` | `.gitattributes` was written with a byte-order mark or stray characters | Rewrite it with `Write-LfFile` as in Step 3.3 |
| The distribution origin is a regional S3 name in the wrong region | The bucket was created in the wrong region | Recreate the bucket in us-east-1 and edit the origin to `<bucket>.s3.us-east-1.amazonaws.com` |
| `Unreplaced placeholders in …` from `Render-Template` | A value was not looked up yet | `Restore-State`, or finish the earlier step that creates it (certificate, distribution) |
| `tofu init` cannot find the bucket | Wrong bucket name, region or profile | `Use-AwsProfile observedstate`, then `aws s3 ls` |
| `tofu` complains about `use_lockfile` | OpenTofu older than 1.10 | `winget upgrade OpenTofu.Tofu` |
| `AccessDenied` on `tofu plan` or `apply`, naming an action on an `observedstate-*` resource | The operator policy lacks that action | As `$AdminProfile`, add the action to `docs\operator-policy.json`, then create a new policy version (5.5) |
| `AccessDenied` naming anything else | The fence working | Stop and think before widening it |
| `gh variable list` shows values, but the workflow gets empty ones | They are environment variables, not repository variables | Step 8.1 |
| Workflow fails: `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Trust policy `sub` does not match, or `environment:` was added to the workflow | Run `gh api repos/ObservedState/site/actions/oidc/customization/sub`. If `use_immutable_subject` is `true`, the trust policy must use its `sub_claim_prefix` followed by `:ref:refs/heads/main`. Run `Restore-State`, re-render `trust-policy.json` and `aws iam update-assume-role-policy`. |
| Workflow fails with `AccessDenied` on S3 | Deploy role or boundary does not match the bucket name | Bucket must start `observedstate-`. Compare with `S3_BUCKET` |
| Site returns `AccessDenied` from CloudFront | Bucket policy does not match the distribution | Re-run 7.5 |
| `/spokes/cloud/` returns an error | Function missing or not attached to viewer request | 7.3 and 7.4 step 16 |
| The 404 page returns 200, or an XML error shows | Custom error responses not set for both 403 and 404 | 7.4 steps 17 and 18 |
| Works on `*.cloudfront.net` but not on your domain | Aliases missing, certificate not attached, or DNS not propagated | 7.4 steps 12 and 13, then 7.6 |
| Browser refuses the site entirely | `.dev` requires HTTPS and the certificate is missing or wrong | `aws acm describe-certificate …` from 7.2 |
| Old content after a deploy | Browser or edge cache | The workflow invalidates `/*`. Hard-refresh. |
| `git status` shows every file modified | CRLF and LF conflict | Step 3.3, then `git add --renormalize .` |
| Everything under `OneDrive` behaves oddly | Repo is synced | Move it to `C:\dev` |

If something fails in a way that is not in this table, copy the full error text and the command that produced it. Never paste access keys, tokens, or the contents of `%USERPROFILE%\.aws\credentials`.
