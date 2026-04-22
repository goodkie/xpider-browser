#!/bin/bash
# XPIDER Browser — macOS Profile 1 Launcher
# 사용법: 터미널에서 sh launch_mac_profile1.sh
DIR="$(cd "$(dirname "$0")" && pwd)"
open "$DIR/out/XPIDER Browser-darwin-x64/XPIDER Browser.app" --args --profile=1
