@echo off
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\open_review.ps1" -Profile aggregate
if errorlevel 1 pause
