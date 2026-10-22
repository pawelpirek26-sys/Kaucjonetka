#!/usr/bin/env bash
# Installs the APK on the running emulator and screenshots the map tab (light + dark).
set -x
OUT=screenshots
PKG=pl.kaucjomat.app
mkdir -p "$OUT"

adb install -r "$(ls apk/*.apk | head -1)"
adb shell pm grant $PKG android.permission.ACCESS_FINE_LOCATION
adb shell pm grant $PKG android.permission.ACCESS_COARSE_LOCATION
adb emu geo fix 21.0122 52.2297
adb logcat -c

shoot() {
  adb shell am force-stop $PKG
  adb shell am start -W -a android.intent.action.VIEW -d "kaucjomat://map?lat=52.2297&lon=21.0122&zoom=14.5"
  sleep 30
  adb exec-out screencap -p > "$OUT/map-$1.png"
}

adb shell cmd uimode night no
shoot light
adb shell cmd uimode night yes
shoot dark

adb logcat -d > "$OUT/logcat-full.txt"
grep -E "ReactNativeJS|MLRN|maplibre|AndroidRuntime" "$OUT/logcat-full.txt" > "$OUT/logcat-app.txt" || true
exit 0
