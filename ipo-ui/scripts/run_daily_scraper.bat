@echo off
REM Upcoming IPO Scraper — runs via Windows Task Scheduler (twice daily: 08:00 + 17:30)
REM Re-import task: schtasks /create /tn "IPO_Scraper" /xml "D:\IPO\ipo-ui\scripts\IPO_Scraper_Task.xml"

cd /d D:\IPO\ipo-ui

set PYTHON_EXE=C:\Users\supha\AppData\Local\Programs\Python\Python313\python.exe
set LOG=scripts\output\scraper.log

echo [%date% %time%] Scraper started >> %LOG%

REM Use cmd /c to isolate the Python process from CTRL+C signals
cmd /c ""%PYTHON_EXE%" scripts\scrape_upcoming_ipos.py >> %LOG% 2>&1"

echo [%date% %time%] Scraper finished (exit code: %ERRORLEVEL%) >> %LOG%
