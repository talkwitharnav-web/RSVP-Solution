@echo off
REM Double-click this to stop the RSVP app (dev server + Postgres).
REM Just forwards to scripts\shutdown.ps1, which does the real work.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\shutdown.ps1"
pause
