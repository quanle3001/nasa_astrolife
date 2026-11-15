# Recreate the Astro Life desktop shortcut from the current checkout location.
$ErrorActionPreference = 'Stop'
$projectDirectory = Split-Path -Parent $PSScriptRoot
$pythonWindowless = Join-Path $projectDirectory '.venv\Scripts\pythonw.exe'
$entryPoint = Join-Path $PSScriptRoot 'run.py'
if (-not (Test-Path -LiteralPath $pythonWindowless -PathType Leaf)) {
    throw 'Install the project virtual environment and dependencies before creating the shortcut.'
}
if (-not (Test-Path -LiteralPath $entryPoint -PathType Leaf)) {
    throw 'The Astro Life entry point is missing.'
}
$desktopDirectory = [Environment]::GetFolderPath('Desktop')
if (-not $desktopDirectory) {
    throw 'Windows did not return a Desktop folder.'
}
$shortcutPath = Join-Path $desktopDirectory 'Astro Life.lnk'
$shortcutShell = New-Object -ComObject WScript.Shell
$shortcut = $shortcutShell.CreateShortcut($shortcutPath)
if ((Test-Path -LiteralPath $shortcutPath) -and $shortcut.TargetPath -ne $pythonWindowless) {
    throw "A different shortcut already exists at $shortcutPath. Rename it before continuing."
}
$shortcut.TargetPath = $pythonWindowless
$shortcut.Arguments = '"' + $entryPoint + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = 'Astro Life - astronaut health monitor'
$shortcut.IconLocation = $pythonWindowless + ',0'
$shortcut.WindowStyle = 1
$shortcut.Save()

# Read back the actual saved shortcut to verify its launch configuration.
$verifiedShortcut = $shortcutShell.CreateShortcut($shortcutPath)
if ($verifiedShortcut.TargetPath -ne $pythonWindowless -or
    $verifiedShortcut.Arguments -ne ('"' + $entryPoint + '"') -or
    $verifiedShortcut.WorkingDirectory -ne $PSScriptRoot) {
    throw 'The saved shortcut does not match the expected launch configuration.'
}
Write-Output "Created: $shortcutPath"
Write-Output "Target: $($verifiedShortcut.TargetPath)"
Write-Output "Arguments: $($verifiedShortcut.Arguments)"
Write-Output "Working directory: $($verifiedShortcut.WorkingDirectory)"
