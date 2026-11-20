<#
  Sends the current project to the VM and rebuilds it. Run from the project folder on your computer:

    .\deploy\upload.ps1 -Vm flashback-vm -Zone us-central1-a -EnvFile deploy\.env.vm

  Needs the gcloud CLI (signed in to your project). -EnvFile is your filled-in configuration; it is copied to the VM as
  ~/flashback/.env (readable by you only). Leave it out on later updates to keep the .env that is already there.
  The VM's data/ folder (database and photos) is never touched.
#>
param(
  [Parameter(Mandatory)] [string] $Vm,
  [Parameter(Mandatory)] [string] $Zone,
  [string] $EnvFile
)
$ErrorActionPreference = 'Stop'
$archive = Join-Path $env:TEMP 'flashback-deploy.tgz'
if (Test-Path $archive) { Remove-Item $archive }

# tar.exe ships with Windows 10/11. Secrets, local data, tests and build output stay behind.
tar -czf $archive `
  --exclude=./node_modules --exclude=./.next --exclude=./.next-e2e --exclude=./data --exclude=./data-e2e --exclude=./data-e2e-nogoogle `
  --exclude=./test-results --exclude=./playwright-report --exclude=./.git --exclude=./.env --exclude=./.env.local `
  --exclude=./deploy/.env.vm --exclude=./tsconfig.tsbuildinfo .

gcloud compute scp $archive "${Vm}:~/flashback-deploy.tgz" --zone $Zone

if ($EnvFile) {
  if (-not (Test-Path $EnvFile)) { throw "EnvFile not found: $EnvFile" }
  gcloud compute scp $EnvFile "${Vm}:~/flashback-env.tmp" --zone $Zone
  gcloud compute ssh $Vm --zone $Zone --command "mkdir -p ~/flashback && mv ~/flashback-env.tmp ~/flashback/.env && chmod 600 ~/flashback/.env"
}

gcloud compute ssh $Vm --zone $Zone --command "mkdir -p ~/flashback && tar -xzf ~/flashback-deploy.tgz -C ~/flashback && rm ~/flashback-deploy.tgz && cd ~/flashback && docker compose up -d --build && docker image prune -f"
Remove-Item $archive
Write-Host 'Deployed.'
