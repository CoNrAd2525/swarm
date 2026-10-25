# How to Get Your Bearer Tokens (Easy Way)

Since you are using the Telegram Android App manually, you might not know how to get the "Bearer Tokens" required for this bot to automate Blum, Moonbix, and Yescoin 24/7 on a server.

**Don't worry, it's easy. You just need a PC/Laptop browser for 2 minutes.**

## Step 1: Open Telegram Web
1. Open Google Chrome or Edge on your PC.
2. Go to **[web.telegram.org](https://web.telegram.org/k/)**.
3. Log in with your phone number (scan the QR code with your phone if needed).

## Step 2: Open the Mini-App
1. Click on the bot you want to automate (e.g., **Blum** or **Moonbix**).
2. Click "Launch" or "Open App".
3. The app will open in a popup or side panel.

## Step 3: Get the Token
1. Right-click anywhere inside the app (the game/task screen) and select **Inspect** (or press `F12`).
2. A developer console will open.
3. Click on the **Network** tab at the top of the console.
4. In the "Filter" box, type `api` or `user`.
5. Perform an action in the app (e.g., click "Tasks" or "Farming").
6. You will see requests appear in the list (e.g., `me`, `balance`, `claim`).
7. Click on one of them.
8. On the right side, look for **Request Headers**.
9. Find the line that says **Authorization**.
10. It will look like: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
11. **Copy the entire long code starting with `ey...`** (exclude the word "Bearer " if you want, or just copy it all).

## Step 4: Paste into Dashboard
1. Open your bot dashboard (`http://localhost:5000` or your VPS IP).
2. Go to "Add Blum Token" (or Moonbix/Yescoin).
3. Paste the code you copied.
4. Click **Add**.

**That's it! The bot will now play for you 24/7.**
