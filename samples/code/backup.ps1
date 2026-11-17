# PowerShell sample
$source = "C:\SCADA\Logs"
$target = "D:\Backup\$(Get-Date -Format yyyy-MM-dd)"
New-Item -ItemType Directory -Path $target -Force | Out-Null
Get-ChildItem $source -Filter *.log | Copy-Item -Destination $target
Write-Host "Backed up to $target"
