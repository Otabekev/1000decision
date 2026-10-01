@echo off
rem Makes 1000 Decisions open (and update) automatically every time you log in to Windows.
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
(
  echo @echo off
  echo call "%~dp0Open 1000 Decisions.bat"
) > "%STARTUP%\1000 Decisions.bat"
echo.
echo Done. 1000 Decisions will update and open every time you start your PC.
echo To undo, run "Turn off auto-start (Windows).bat".
echo.
pause
