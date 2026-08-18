@echo off
rem AlbumShelf - built-in ncm-cli configure wizard launcher.
rem Configures Netease Open Platform API credentials (appId / privateKey) and
rem player settings, stored under the user home (~/.config/ncm-cli/).
rem Usage: double-click this file and follow the wizard prompts.
rem (Runs via ncm-configure.exe, which attaches a real console with UTF-8
rem  codepage so the interactive wizard works and Chinese text renders.)
"%~dp0ncm-configure.exe" configure
echo.
echo Configure finished. If it failed, check your network and retry.
pause
