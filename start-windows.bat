@echo off
setlocal
cd /d "%~dp0"
title Sudoku Studio Online - V3.2
echo ========================================
echo Sudoku Studio Online - V3.2
echo ========================================
echo URL: http://127.0.0.1:8080
echo.
where py >nul 2>nul
if %errorlevel%==0 goto use_py
where python >nul 2>nul
if %errorlevel%==0 goto use_python
echo Python 3 was not found.
echo Please install Python 3.10 or newer.
pause
exit /b 1

:use_py
start "" "http://127.0.0.1:8080"
py -3 server.py
goto end

:use_python
start "" "http://127.0.0.1:8080"
python server.py

:end
pause
endlocal
