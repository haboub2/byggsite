@echo off
rem Startar postverktyget: en liten lokal server från projektets rot, och öppnar sidan.
cd /d "%~dp0..\.."
start "" http://localhost:8765/marketing/postverktyg/
python -m http.server 8765 --bind 127.0.0.1
