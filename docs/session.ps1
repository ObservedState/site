# ObservedState session helpers. See docs/SETUP.md.
#
# Load at the start of every terminal session (dot-source, note the leading dot and space):
#   . C:\dev\site\docs\session.ps1
#
# Nothing in this file changes AWS or GitHub. It defines helper functions, and it loads
# docs\local.ps1 (created in SETUP.md Step 5.1, never committed) if that file exists.

$global:DocsDir  = $PSScriptRoot
$global:RepoRoot = Split-Path -Parent $PSScriptRoot

if (-not (Get-Variable -Name Tokens -Scope Global -ErrorAction SilentlyContinue)) {
    $global:Tokens = @{}
}

$localFile = Join-Path $PSScriptRoot 'local.ps1'
if (Test-Path -LiteralPath $localFile) { . $localFile }

function Set-Token {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Value
    )
    $global:Tokens[$Name] = $Value
}

function Show-State {
    $global:Tokens.GetEnumerator() | Sort-Object Name | ForEach-Object {
        '{0,-22} {1}' -f $_.Name, $_.Value
    }
}

# Points the AWS CLI at one profile, and refuses to continue if that profile is not in the
# account you pinned in docs\local.ps1. This is the guard against building in the wrong account.
function Use-AwsProfile {
    param([string]$Name = $AdminProfile)

    if (-not $Name) { throw 'No profile given and AdminProfile is not set. Run SETUP.md Step 5.1.' }
    if (-not $ExpectedAccount) {
        throw 'ExpectedAccount is not set. Create docs\local.ps1 (SETUP.md, Step 5.1) and load this file again.'
    }
    if ($Name -eq 'default') {
        throw "Refusing the 'default' profile: on this machine it is the Cloud Study account. Use stacknimbus-rook (SETUP.md, Step 5.1)."
    }
    $env:AWS_PROFILE        = $Name
    $env:AWS_REGION         = 'us-east-1'
    $env:AWS_DEFAULT_REGION = 'us-east-1'

    $account = aws sts get-caller-identity --query Account --output text
    if ($LASTEXITCODE -ne 0) { throw "aws sts get-caller-identity failed for profile '$Name'." }
    $arn = aws sts get-caller-identity --query Arn --output text

    if ($account -ne $ExpectedAccount) {
        throw "WRONG ACCOUNT. Profile '$Name' is in account $account, but the expected account is $ExpectedAccount. Nothing was changed."
    }
    $global:Tokens['ACCOUNT_ID'] = $account
    $global:acct = $account   # used as ${acct} in the runbook's ARNs and --account-id arguments
    Write-Host "OK  profile=$Name  account=$account  identity=$arn" -ForegroundColor Green
}

# Fills the placeholder values that can be looked up, using whichever profile is active.
function Restore-State {
    if (-not $global:Tokens['ACCOUNT_ID']) { throw 'Run Use-AwsProfile first.' }
    $acct = $global:Tokens['ACCOUNT_ID']

    if ($SiteRepo) { $global:Tokens['SITE_REPO'] = $SiteRepo } else { $global:Tokens['SITE_REPO'] = 'site' }
    if ($AlertEmail) { $global:Tokens['ALERT_EMAIL'] = $AlertEmail }

    # The GitHub OIDC "sub" claim prefix. Newer repositories use GitHub's immutable form,
    # repo:<owner>@<owner id>/<repo>@<repo id>; older ones use repo:<owner>/<repo>. Ask GitHub which.
    $prefix = "repo:ObservedState/$($global:Tokens['SITE_REPO'])"
    try {
        $cust = gh api "repos/ObservedState/$($global:Tokens['SITE_REPO'])/actions/oidc/customization/sub" 2>$null | ConvertFrom-Json
        if ($cust -and $cust.use_immutable_subject -and $cust.sub_claim_prefix) { $prefix = $cust.sub_claim_prefix }
    } catch { }
    $global:Tokens['SUB_PREFIX'] = $prefix
    $global:Tokens['SITE_BUCKET']  = "observedstate-site-$acct"
    $global:Tokens['STATE_BUCKET'] = "observedstate-tfstate-$acct"

    $zone = aws route53 list-hosted-zones-by-name --dns-name observedstate.dev --max-items 1 --query "HostedZones[?Name=='observedstate.dev.'].Id | [0]" --output text 2>$null
    if ($zone -and $zone -ne 'None') {
        $global:Tokens['ZONE_ID'] = ($zone -replace '^/hostedzone/', '')
    } else {
        $global:Tokens['ZONE_ID'] = 'NONE'
    }

    $dist = aws cloudfront list-distributions --query "DistributionList.Items[?Aliases.Items && contains(Aliases.Items, 'observedstate.dev')].[Id,DomainName] | [0]" --output text 2>$null
    if ($dist -and $dist -ne 'None') {
        $parts = $dist -split '\s+'
        if ($parts.Count -eq 2) {
            $global:Tokens['DISTRIBUTION_ID']     = $parts[0]
            $global:Tokens['DISTRIBUTION_DOMAIN'] = $parts[1]
        }
    }

    $cert = aws acm list-certificates --region us-east-1 --query "CertificateSummaryList[?DomainName=='observedstate.dev' && Status=='ISSUED'].CertificateArn | [0]" --output text 2>$null
    if ($cert -and $cert -ne 'None') { $global:Tokens['CERT_ARN'] = $cert }

    Show-State
}

# Returns file:// (or fileb:// with -Binary) followed by the absolute path, with forward slashes,
# which the AWS CLI accepts on Windows from any working directory.
function Get-FileUri {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [switch]$Binary
    )
    $full = (Resolve-Path -LiteralPath $Path).Path -replace '\\', '/'
    if ($Binary) { return "fileb://$full" }
    return "file://$full"
}

function Get-DocUri {
    param([Parameter(Mandatory = $true)][string]$Name)
    Get-FileUri -Path (Join-Path $global:DocsDir $Name)
}

# Copies docs\<Name> to docs\rendered\<Name> with every __PLACEHOLDER__ replaced from $Tokens,
# and returns a file:// URI for the AWS CLI. It stops if any placeholder is still unknown.
function Render-Template {
    param([Parameter(Mandatory = $true)][string]$Name)

    $source = Join-Path $global:DocsDir $Name
    if (-not (Test-Path -LiteralPath $source)) { throw "Template not found: $source" }

    $text = Get-Content -LiteralPath $source -Raw
    foreach ($key in @($global:Tokens.Keys)) {
        $text = $text.Replace("__$($key)__", [string]$global:Tokens[$key])
    }

    $left = [regex]::Matches($text, '__[A-Z][A-Z0-9_]*__') | ForEach-Object { $_.Value } | Select-Object -Unique
    if ($left) {
        throw "Unreplaced placeholders in ${Name}: $($left -join ', '). Look them up (Restore-State) or set them (Set-Token) first."
    }

    $outDir = Join-Path $global:DocsDir 'rendered'
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    $out = Join-Path $outDir $Name
    Set-Content -LiteralPath $out -Value $text -Encoding Ascii -NoNewline
    Get-FileUri -Path $out
}

# Writes a text file with LF line endings and no byte-order mark. Windows PowerShell 5.1 cannot
# do this with Set-Content, and a BOM or CRLF breaks .gitattributes, shell hooks and some tools.
function Write-LfFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Text
    )
    $full = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
    $lf   = $Text -replace "`r`n", "`n"
    [System.IO.File]::WriteAllText($full, $lf, (New-Object System.Text.UTF8Encoding($false)))
}
