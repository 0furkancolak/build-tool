# Requires administrator privileges
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "Administrator privileges required. Please run as administrator."
    Exit
}

Write-Host "Starting cleanup process..." -ForegroundColor Green

# Stop Docker Desktop
Write-Host "Stopping Docker Desktop..." -ForegroundColor Yellow
Stop-Process -Name "Docker Desktop" -Force -ErrorAction SilentlyContinue
Stop-Service -Name "com.docker.*" -Force -ErrorAction SilentlyContinue

# Remove Docker containers, images, and volumes
Write-Host "Cleaning Docker resources..." -ForegroundColor Yellow
docker stop $(docker ps -aq) 2>$null
docker rm $(docker ps -aq) 2>$null
docker system prune -af --volumes 2>$null

# Remove project directories
Write-Host "Removing project directories..." -ForegroundColor Yellow
$projectRoot = $PSScriptRoot
Remove-Item -Path "$projectRoot\data" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$projectRoot\node_modules" -Recurse -Force -ErrorAction SilentlyContinue

# Remove Docker Desktop data
Write-Host "Removing Docker Desktop data..." -ForegroundColor Yellow
$dockerPaths = @(
    "$env:ProgramData\Docker",
    "$env:APPDATA\Docker",
    "$env:LOCALAPPDATA\Docker"
)

foreach ($path in $dockerPaths) {
    if (Test-Path $path) {
        Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Removed $path" -ForegroundColor Gray
    }
}

# Remove Docker Desktop shortcuts
Write-Host "Removing Docker Desktop shortcuts..." -ForegroundColor Yellow
Remove-Item -Path "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Docker Desktop.lnk" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:PUBLIC\Desktop\Docker Desktop.lnk" -Force -ErrorAction SilentlyContinue

Write-Host "`nCleanup completed!" -ForegroundColor Green
Write-Host "`nTo complete Docker Desktop removal:" -ForegroundColor Yellow
Write-Host "1. Uninstall Docker Desktop from Windows Settings" -ForegroundColor White
Write-Host "2. Restart your computer" -ForegroundColor White

# Pause to show results
Write-Host "`nPress any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") 