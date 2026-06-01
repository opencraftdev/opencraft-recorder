#!/usr/bin/env bash
#
# Uninstall OpenCraft Recorder from macOS — removes the app, its data, and the
# opencraft-recorder:// deep-link registration.
#
# Usage:
#   bash uninstall.sh          # asks for confirmation
#   bash uninstall.sh -y       # no prompt
#
set -u

APP_NAME="OpenCraft Recorder"
BUNDLE_ID="com.opencraft.recorder"

say()  { printf "\033[1m%s\033[0m\n" "$1"; }
note() { printf "  • %s\n" "$1"; }

# ---- confirm -----------------------------------------------------------------
if [ "${1:-}" != "-y" ]; then
  printf "This will completely remove \"%s\" and its data. Continue? [y/N] " "$APP_NAME"
  read -r reply
  case "$reply" in
    y | Y | yes | YES) ;;
    *) echo "Cancelled."; exit 0 ;;
  esac
fi

# ---- quit if running ---------------------------------------------------------
say "Quitting the app…"
osascript -e "quit app \"$APP_NAME\"" >/dev/null 2>&1 || true
pkill -f "$APP_NAME" >/dev/null 2>&1 || true
sleep 1

# ---- eject any mounted DMG ---------------------------------------------------
if [ -d "/Volumes/$APP_NAME" ]; then
  say "Ejecting mounted disk image…"
  hdiutil detach "/Volumes/$APP_NAME" >/dev/null 2>&1 || true
fi

# ---- remove every copy of the app -------------------------------------------
say "Removing the app…"
# Known locations…
for p in "/Applications/$APP_NAME.app" "$HOME/Applications/$APP_NAME.app" "$HOME/Downloads/$APP_NAME.app"; do
  if [ -e "$p" ]; then note "$p"; rm -rf "$p"; fi
done
# …plus anywhere Spotlight knows about it.
while IFS= read -r hit; do
  [ -n "$hit" ] || continue
  if [ -e "$hit" ]; then note "$hit"; rm -rf "$hit"; fi
done < <(mdfind "kMDItemCFBundleIdentifier == '$BUNDLE_ID'" 2>/dev/null)

# ---- remove app data / caches / preferences ---------------------------------
say "Removing app data, caches and preferences…"
PATHS=(
  "$HOME/Library/Application Support/$APP_NAME"
  "$HOME/Library/Caches/$BUNDLE_ID"
  "$HOME/Library/Caches/$APP_NAME"
  "$HOME/Library/Preferences/$BUNDLE_ID.plist"
  "$HOME/Library/Saved Application State/$BUNDLE_ID.savedState"
  "$HOME/Library/Logs/$APP_NAME"
  "$HOME/Library/HTTPStorages/$BUNDLE_ID"
  "$HOME/Library/WebKit/$BUNDLE_ID"
)
for p in "${PATHS[@]}"; do
  if [ -e "$p" ]; then note "$p"; rm -rf "$p"; fi
done

# ---- reset the opencraft-recorder:// URL handler -----------------------------
say "Resetting the deep-link (opencraft-recorder://) registration…"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
if [ -x "$LSREGISTER" ]; then
  "$LSREGISTER" -kill -r -domain local -domain system -domain user >/dev/null 2>&1 || true
fi

say "Done. \"$APP_NAME\" has been removed."
echo "If a copy is still in the Trash, empty it to reclaim the space."
