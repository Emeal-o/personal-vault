---
name: Authenticated preview verification
description: Distinguish an early server-rendered dashboard frame from an authenticated, interactive preview.
---

An unsigned browser can briefly show the server-rendered dashboard at `/dashboard` before the client settles on the Personal Vault PIN screen. A screenshot of that frame is not evidence that React handlers are attached or that the user is authenticated.

**Why:** The preview initially showed the navigation, but the settled browser session redirected to the PIN gate. A clean browser could not verify the signed-in gestures.

**How to apply:** Verify protected interactions only with a legitimate authenticated session or an isolated test fixture. Do not request or inspect the PIN; report visual observations separately from interaction checks.
