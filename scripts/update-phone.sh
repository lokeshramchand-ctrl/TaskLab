#!/usr/bin/env bash
# Builds the debug APK and updates the app already on the connected phone in place
# (adb install -r keeps its data and sign-in). Safe to run by hand: scripts/update-phone.sh
# Log: .git/phone-update.log when started from the pre-push hook.
set -u
cd "$(dirname "$0")/.."

ADB="${ADB:-}"
if [ -z "$ADB" ]; then
  for c in adb "/c/Softwares/platform-tools/adb" "${ANDROID_HOME:-}/platform-tools/adb"; do
    if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then ADB="$c"; break; fi
  done
fi
[ -n "$ADB" ] || { echo "adb not found (set ADB=/path/to/adb)"; exit 0; }

devices() { "$ADB" devices | awk 'NR>1 && $2=="device" {print $1}'; }
[ -n "$(devices)" ] || { echo "$(date +%T) no phone connected over adb, skipping"; exit 0; }

echo "$(date +%T) building…"
./gradlew :app:assembleDebug -q || { echo "$(date +%T) build failed, phone not updated"; exit 0; }

APK=app/build/outputs/apk/debug/app-debug.apk
for d in $(devices); do
  echo "$(date +%T) updating $d…"
  "$ADB" -s "$d" install -r "$APK" && echo "$(date +%T) $d updated" || echo "$(date +%T) install failed on $d"
done
