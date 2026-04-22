#!/bin/bash
# XPIDER Browser — macOS Profile 2 Launcher
DIR="$(cd "$(dirname "$0")" && pwd)"
open "$DIR/out/XPIDER Browser-darwin-x64/XPIDER Browser.app" --args --profile=2
