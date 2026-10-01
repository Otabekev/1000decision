@echo off
rem Opens 1000 Decisions in your default browser.
rem If this folder was cloned with Git, it first downloads the latest version (skipped when offline).
cd /d "%~dp0"
if exist ".git" (
  where git >nul 2>nul && git pull --ff-only --quiet >nul 2>nul
)
start "" "%~dp0index.html"
