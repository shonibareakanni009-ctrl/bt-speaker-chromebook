# BT Speaker Share (Android)

Mirrors the phone **screen** to the Chromebook BT Speaker app over Wi-Fi.
Optionally streams **app audio** (Android 10+) via `AudioPlaybackCapture`.

## Important

- This folder is **source code**. Open it in **Android Studio** and build an APK there.
- A pre-built `.apk` is not included (no Android SDK in the environment that produced this project).

## Build APK

1. Install Android Studio
2. **File → Open** → select this `android` folder (or the repo root and open `android/`)
3. Let Gradle sync
4. **Build → Build Bundle(s) / APK(s) → Build APK(s)**
5. Install the APK on your phone

## Use with Chromebook

1. On Chromebook: open **BT Speaker** → Power On → **Start Wi-Fi receiver**
2. Copy the link (e.g. `http://192.168.1.20:8080`)
3. Phone and Chromebook on the **same Wi-Fi**
4. In this app: paste the link → choose quality → enable audio if wanted → **Start sharing**
5. Allow the system **screen capture** dialog
6. Chromebook shows the phone screen; audio plays if capture is allowed

## Limits

- Not as smooth as Chromecast (JPEG frames over HTTP; old Chromebooks are slow)
- Use **Low** quality on XE303C12
- Some apps block audio capture (banking, DRM video)
- iPhone is not supported
