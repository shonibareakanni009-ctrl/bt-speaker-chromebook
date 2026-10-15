# BT Speaker + Screen Share

Chrome App for old Chromebooks (Chrome 75 / Samsung XE303C12) plus an Android companion that mirrors the phone screen (and optional app audio) over Wi-Fi.

## Parts

| Folder | What it is |
|--------|------------|
| `chrome-app/` | Chrome App: local audio, mic meter, Wi-Fi receiver, screen mirror display |
| `android/` | Android Studio project: screen capture + optional playback audio → Chromebook |

## Chromebook setup

1. Load `chrome-app/` as an **unpacked** Chrome App (`chrome://extensions` → Developer mode)
2. Power On → **Start Wi-Fi receiver**
3. Copy the `http://192.168.x.x:8080` link

## Android setup

1. Open `android/` in Android Studio
2. Build APK and install on the phone
3. Same Wi-Fi as the Chromebook
4. Paste the receiver URL → Start sharing → allow screen capture

## Limits

- Not true Bluetooth A2DP sink (OS limitation)
- Screen share uses JPEG frames (laggy on 2012 hardware — use Low quality)
- App audio needs Android 10+ and may be blocked by some apps

## Assignment notes

Built for a constrained Chromebook project: audio output, microphone, network streaming, and documenting platform limits.
