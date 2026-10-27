@echo off
title 我的工作台
cd /d %~dp0
start "" http://localhost:5000
python app.py
pause
