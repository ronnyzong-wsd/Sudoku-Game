$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
Write-Host "Sudoku Studio Online - V3.2" -ForegroundColor Cyan
Write-Host "URL: http://127.0.0.1:8080"
Start-Process "http://127.0.0.1:8080"
if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 server.py
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python server.py
} else {
    Write-Host "Python 3 not found. Please install Python 3.10+." -ForegroundColor Red
    Read-Host "Press Enter to exit"
}
