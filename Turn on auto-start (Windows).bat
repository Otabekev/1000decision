@echo off
rem Makes 1000 Decisions open automatically every time you log in to Windows.
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
(
  echo @echo off
  echo start "" "%~dp0index.html"
) > "%STARTUP%\1000 Decisions.bat"
echo.
echo Done. 1000 Decisions will open every time you start your PC.
echo To undo, run "Turn off auto-start (Windows).bat".
echo.
pause
