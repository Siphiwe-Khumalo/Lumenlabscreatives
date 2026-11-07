@echo off
rem Starts the Middelburg BMS dashboard (dashboard + JACE gateway + history logger).
rem Used by the Windows scheduled task "Middelburg BMS" at boot. Restarts it if it stops.
cd /d "%~dp0"
if not exist data mkdir data
:loop
echo [%date% %time%] starting >> data\server.log
node scripts\serve.mjs >> data\server.log 2>&1
echo [%date% %time%] stopped, restarting in 10 s >> data\server.log
timeout /t 10 /nobreak > nul
goto loop
