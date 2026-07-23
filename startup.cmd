@echo off
REM Double-click this to start the RSVP app (Postgres + dev server).
REM Just forwards to scripts\startup.ps1, which does the real work.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\startup.ps1"
pause
