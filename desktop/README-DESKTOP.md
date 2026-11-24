# Shop Board, desktop edition

The same board as the Cloudflare version: five designs, one link, live orders
with first name, city and amount. Only the hosting changes. Instead of
Cloudflare, the board runs on your own Windows PC, and the numbers come
straight from WooCommerce. No hosting account, no deploy, no monthly cost.
The PC must stay on while the board is up. Closing the black window stops it.

## What is in the folder

- `ShopBoard.exe`, double-click to start the board. Node.js is inside it,
  nothing else to install.
- `board.env.example`, copy it to `board.env` and fill in the key. See step 1.
- `server.mjs` and `start-board.bat`, the fallback if the exe ever refuses to
  run: install Node.js 20 LTS from nodejs.org, then double-click
  `start-board.bat`.
- `../public/`, the five designs. `../functions/`, the board's data code,
  shared with the Cloudflare version.

## Setup, step by step

### Step 1. Make the read-only WooCommerce key (5 minutes, on your phone or PC)

1. Open `herbsmitra.com/wp-admin` in a browser and sign in.
2. Go to WooCommerce, Settings, Advanced tab, REST API.
3. Click Add key. Description: `Shop Board read only`. User: your own admin
   account. Permissions: Read.
4. Click Generate API key. Copy the consumer key (`ck_...`) and the consumer
   secret (`cs_...`) at once. The secret is shown only this one time.
5. Type both values into `board.env` on your own PC. Never paste them in chat,
   email or any AI window. They stay in that file, on that PC.

### Step 2. Make board.env

1. In the same folder as `ShopBoard.exe`, copy `board.env.example` to a new
   file named `board.env`. On Windows, right-click the example, Copy, Paste,
   then rename the copy to `board.env`.
2. Open `board.env` in Notepad and replace the three placeholder lines:
   `WC_URL=https://herbsmitra.com`, `WC_KEY=ck_...`, `WC_SECRET=cs_...`.
3. Save and close. Leave the other lines as they are. If you leave
   `BOARD_KEY` empty, the board makes one itself and saves it to `board.env`.

### Step 3. Start it

Double-click `ShopBoard.exe`. A black window opens and stays open, and your
browser opens the board. The window prints two links:

- `http://localhost:8080/?k=...`, this PC.
- `http://<your-PC-ip>:8080/?k=...`, any phone, laptop or TV on the same
  WiFi. Open that link in the TV browser or the phone browser.

The `?k=...` part is the board's password. Anyone with the full link can see
the numbers, so do not post the link anywhere public.

If Windows shows "Windows protected your PC", click More info, then Run
anyway. The file is unsigned because it was built just for you, not because
anything is wrong with it. If Windows Firewall asks, allow it on private
networks, so the phone and TV can reach it.

### Step 4. Check it

Open the health link printed in the black window
(`http://localhost:8080/api/health?k=...`). It says in plain words whether
WooCommerce is connected, and whether Meta and voice are set up. Both of
those are optional. If WooCommerce says error, the message says what to fix,
usually the key, the secret, or the store address.

## Using it

- The board refreshes by itself about every 20 seconds. New orders pop up
  with the first name, the city and the amount. Only the first name and the
  city ever reach the screen. No phone number, email or street address.
- Eight designs: add `?design=apple`, `?design=meta`, `?design=herbsmitra`,
  `?design=classic`, `?design=studio`, `?design=garden`, `?design=swiss` or
  `?design=night` to the link, or switch anytime via the on-screen HUD or TV
  remote (left/right arrows). Apple is the default design. Your pick is remembered.
- The mic answers simple questions from the numbers, for example "how are
  sales today". With an AI key in `board.env` it answers in full sentences,
  without one it still answers the simple questions. Tap the mic button again
  while the voice is reading to stop it at once. Tap it again to ask a new
  question.
- The Latest strip starts with the top city of the day, and a second chip
  whenever any order was cancelled, refunded or failed. Ask the mic "which
  city gave the most orders" or "how many orders were cancelled" for the same
  numbers by voice.
- History covers the last 14 days: yesterday's total, the 14-day projection
  and the best day of the month. Cancelled, refunded and failed orders are
  left out of today's sales.
- Ad numbers need the optional Meta lines in `board.env`, the same read-only
  token as the optimiser. Without them the board shows sales only, which is
  fine.

## If something is wrong

| What you see | What to do |
| --- | --- |
| "WooCommerce is not connected yet" on the board | `board.env` is missing the key. Redo steps 1 and 2, then close the black window and double-click the exe again. |
| The board opens but shows no orders | Check the health link. A 401 means the key or secret is wrong, or a security plugin is stripping the login header. A 404 means `WC_URL` is wrong, or pretty permalinks are off in WordPress, Settings, Permalinks. |
| No city or first name on orders | The key's user cannot see customer details. Use a key made for an admin user, with Read permission. The board still works without them. |
| A black window flashes and closes | The board hit a startup error. Run the newest `ShopBoard.exe`, it stays open and shows the error. If it says the port is already in use, the board is already running, open the link printed in the old window, or add `PORT=8081` to `board.env` and restart. |
| "Port 8080 is already in use" in the black window | Something else uses port 8080. Add `PORT=8081` to `board.env` and restart. |
| Phone or TV cannot open the link | The PC and the phone must be on the same WiFi, the black window must still be open, and Windows Firewall must allow the exe on private networks. |
| The voice keeps repeating | Tap the mic button once to stop it. The board does not listen while it speaks, so its own voice cannot trigger a new answer. |
| The exe does nothing at all | Use the fallback: install Node.js 20 LTS, then double-click `start-board.bat` in the same folder. |
| The board shows yesterday's numbers after midnight | It refreshes on its own. Wait one refresh, about 20 seconds. |

## Updating later

Replace `ShopBoard.exe` with the new one, keeping the same folder and the
same `board.env`. Nothing else changes. Your key and settings stay put.

## Privacy

The WooCommerce key is read-only: it can read orders, it cannot change, delete
or refund anything. The key, the secret and the board password live only in
`board.env` on your PC. The board never sends customer details anywhere
except to the browser that opened the link.

## The all-orders page (for you and Shikha)

Open `/ops.html` with the same board link, for example
`http://localhost:8080/ops.html?k=<your key>` (or the LAN link on your phone).
It shows everything for today in one place: sales, orders, per-order value,
COD vs prepaid, new vs returning customers, cancelled, refunded and failed,
the full pipeline (pending, processing, on hold, completed), top cities, top
products, every order today with search and a status filter, products running
low, and the ad numbers once the Meta token is added. It refreshes every 60
seconds. It shows first names and cities only, never phone numbers, email
addresses or street addresses.

What it does NOT replace: refunds, order edits, shipping labels and store
settings still live in WooCommerce (and Shiprocket). This page replaces
checking WooCommerce, not working in it.

## Sharing the board with Shikha (a link she can open anywhere)

The desktop board only works on your own WiFi. For a link Shikha can open
from anywhere, the board has to live on Cloudflare (free). That needs your
Cloudflare account and about 20 minutes, one step at a time:

1. On your PC, install Node.js 20 LTS from https://nodejs.org if it is not
   installed already.
2. Open a terminal in the `board-woo` folder and run `npx wrangler login`.
   A browser tab opens: sign up or log in to Cloudflare, then click Allow.
3. Create the project: `npx wrangler pages project create shopboard-herbsmitra --production-branch main`
   (if the name is taken, add a short suffix and use that name in the steps below).
4. Make a file called `.secrets.env` in the `board-woo` folder with the same
   values as `board.env` (WC_URL, WC_KEY, WC_SECRET, BOARD_KEY, STORE_NAME,
   STORE_TZ, plus META_TOKEN, META_AD_ACCOUNT and BREAK_EVEN_ROAS if you
   have them). Never paste these in chat.
5. Upload the keys: `node scripts/push-secrets.mjs shopboard-herbsmitra`.
   The script deletes the local file after uploading.
6. Publish: `npx wrangler pages deploy public --project-name shopboard-herbsmitra --branch main --commit-dirty=true`
7. The link is `https://shopboard-herbsmitra.pages.dev/?k=<BOARD_KEY>`.
   Send Shikha that link plus the ops page link
   `https://shopboard-herbsmitra.pages.dev/ops.html?k=<BOARD_KEY>`.
   Anyone with the link can see the sales numbers, so send it only to her.

To change a setting later: write the changed values to `.secrets.env`, run
the push-secrets command again, and redeploy with the command in step 6.

## Designs

The default design is now `meta`: dark navy glass cards in Meta blue
(#0064E0 to #00C6FF), Inter type, and an old woman emoji as the mascot
instead of the blob. Emojis use the Noto colour emoji font, so they look the
same bright style on any screen. The other designs still work: herbsmitra,
classic, studio, garden, swiss, night. Switch with the left and right arrow
keys, or add `?design=herbsmitra` to the link, or set `BOARD_DESIGN=herbsmitra`
in `board.env` and restart. New order popups stay on screen for 15 seconds.
