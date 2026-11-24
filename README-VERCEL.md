# Shop Board on Vercel

This repository contains the WooCommerce Shop Board adapted for serverless deployment on Vercel.

## 1. Import Project on Vercel
1. Log in to your [Vercel Dashboard](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Under **Import Git Repository**, select `herbsmitra-shop-board`.
   *(If the repository does not appear, click "Configure GitHub App" to grant Vercel access to your private repository).*

## 2. Configure Project Settings
- **Project Name:** `shopboard-herbsmitra` (or `shopboard-herbsmitra-<suffix>` if taken)
- **Framework Preset:** `Other`
- **Root Directory:** `./`
- **Build Command:** Leave empty / default (no build step needed)
- **Output Directory:** Leave default (no output directory needed)
- **Install Command:** Leave empty / default

Click **Deploy** to initialize the deployment.

## 3. Environment Variables (Production)
In your Vercel Project, go to **Settings** -> **Environment Variables**.
Add each variable name with its corresponding value from your local `board.env` on your PC:

| Variable Name | Description |
|---|---|
| `WC_URL` | Your store URL (e.g., `https://herbsmitra.com`) |
| `WC_KEY` | WooCommerce REST API Consumer Key (`ck_...`) |
| `WC_SECRET` | WooCommerce REST API Consumer Secret (`cs_...`) |
| `BOARD_KEY` | Secret access key used in your URL (`?k=...`) |
| `STORE_NAME` | Display name of the store (e.g., `HerbsMitra`) |
| `STORE_TZ` | Store timezone (e.g., `Asia/Kolkata`) |
| `META_TOKEN` | *(Optional)* Meta Marketing API token |
| `META_AD_ACCOUNT` | *(Optional)* Meta Ad Account ID |
| `BREAK_EVEN_ROAS` | *(Optional)* Target break-even ROAS number |
| `BOARD_DESIGN` | *(Optional)* Default theme (`herbsmitra`, `apple`, etc.) |

> **Important:** Never write real keys or tokens into Git or documentation. Type them only in the Vercel dashboard.

## 4. Redeploy
After adding or updating environment variables:
1. Navigate to the **Deployments** tab in Vercel.
2. Click the three dots (`...`) next to the latest deployment and select **Redeploy**.
3. Confirm **Redeploy**.

## 5. Testing & Verification Links
Once deployed, verify your live board:
- **Health Check:** `https://<your-project>.vercel.app/api/health?k=<BOARD_KEY>`
- **Live State (JSON):** `https://<your-project>.vercel.app/api/state?k=<BOARD_KEY>`
- **Full Ops State:** `https://<your-project>.vercel.app/api/state?full=1&k=<BOARD_KEY>`
- **Main Board:** `https://<your-project>.vercel.app/?k=<BOARD_KEY>`
- **Specific Designs:**
  - `https://<your-project>.vercel.app/?design=herbsmitra&k=<BOARD_KEY>`
  - `https://<your-project>.vercel.app/?design=apple&k=<BOARD_KEY>`
  - `https://<your-project>.vercel.app/?design=meta&k=<BOARD_KEY>`
  - `https://<your-project>.vercel.app/?design=classic&k=<BOARD_KEY>`
  - `https://<your-project>.vercel.app/?design=studio&k=<BOARD_KEY>`
  - `https://<your-project>.vercel.app/?design=garden&k=<BOARD_KEY>`
  - `https://<your-project>.vercel.app/?design=swiss&k=<BOARD_KEY>`
  - `https://<your-project>.vercel.app/?design=night&k=<BOARD_KEY>`
- **Operations Dashboard:** `https://<your-project>.vercel.app/ops.html?k=<BOARD_KEY>`
