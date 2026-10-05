# Mirror POS (customer display)

The customer display is a second Galaxy Tab S10 that faces the customer. It shows the cashier's cart as a read-only live mirror. It never changes the sale.

This file covers pairing a display and locking the tablet into kiosk use. It supersedes the unmerged `docs/SCREEN_A_B_PLAN.md` draft for the pairing model.

## How it fits together

- Each cashier register (`pos_register_devices` row) owns one station in `pos_mirror_stations`. The station id never changes.
- The cashier publishes a snapshot of the sale to its station with the register's `device_token`. It publishes on every cart change and every 10 seconds as a heartbeat.
- The display holds its own `display_token`. It polls the station once a second and renders the snapshot.
- Pairing again rotates the display token on the same station. The old display stops working. The cart and the station stay as they are.

## Pair a display

1. On the cashier tablet, open the sale screen and tap **Customer display**. Read the short code.
2. On the display tablet, open Fran POS and tap **Use as customer display** on the start screen. Enter that code.

A code works once and expires after 10 minutes. The cashier register must be bound in Live mode first, because the station belongs to the register binding.

A link of the form `/pos/mirror?code=<code>` still joins at once. That link is for repair and automation. Staff pair by typing the code.

## Lock the display tablet

Pick one of these levels. Each level adds protection over the previous one.

### Level 1. Screen pinning (no admin tools)

1. On the display tablet, open **Settings > Security and privacy > More security settings > Pin app**, and turn it on. Older One UI versions call it **Pin windows**. Turn on **Ask for PIN before unpinning**.
2. Open Fran POS on the customer display screen.
3. Open **Recents**, tap the Fran POS icon, and tap **Pin this app**.

To unpin, touch and hold **Back** and **Recents** together, then enter the tablet PIN.

### Level 2. Lock task mode through Samsung Knox or an EMM

Android starts true lock task mode without a prompt only when a device policy controller allowlists the app with `DevicePolicyManager.setLockTaskPackages`. Samsung Knox Manage, Knox Configure, and Android Management API kiosk policies all do this.

1. Enroll the display tablet in the EMM as a fully managed (device owner) device. Enrollment needs a factory reset.
2. Set a single-app kiosk policy for the Fran POS package.
3. In the same policy, turn off the status bar and notifications, set the screen timeout to never, and lock rotation to portrait.

### Level 3. App-side lock task (staged, not in this change)

A later APK can start lock task mode on its own when the tablet allowlists it:

- Add `android:lockTaskMode="if_whitelisted"` to the main activity in `android/app/src/main/AndroidManifest.xml`.
- Call `startLockTask()` from `MainActivity` when the WebView is on `/pos/mirror`, only if `DevicePolicyManager.isLockTaskPermitted(packageName)` is true.
- Set `FLAG_KEEP_SCREEN_ON` on the window for the same route.

An APK release to store devices is class D. It waits for JT.

## Orientation and screen

- The cashier tablet stays in landscape. The display tablet runs in portrait. The app does not force orientation per screen. Lock rotation on the display tablet from **Quick settings**, or through the kiosk policy.
- The display page asks the browser for a screen wake lock. When the WebView refuses, set **Settings > Display > Screen timeout** to the maximum, or turn on **Developer options > Stay awake** while the tablet charges.
