# WooCommerce First-Party Pixel Install Guide

> **MANUAL STEP REQUIRED ON THE WOOCOMMERCE STORE**  
> To begin logging true first-party click IDs and UTMs, install the `pixel.js` script tag on your live WordPress/WooCommerce site.  
> **Important:** Always use your live Vercel domain (e.g. `https://shopboard-herbsmitra.vercel.app`), NEVER `localhost`.

---

## 🚀 1. The Script Tag to Add

Replace `<YOUR_LIVE_VERCEL_DOMAIN>` with your live Vercel URL:

```html
<!-- SuperAttribution First-Party Pixel -->
<script src="https://<YOUR_LIVE_VERCEL_DOMAIN>/pixel.js" defer></script>
```

For example, if your Vercel deployment URL is `https://herbsmitra-shop-board.vercel.app`:
```html
<!-- SuperAttribution First-Party Pixel -->
<script src="https://herbsmitra-shop-board.vercel.app/pixel.js" defer></script>
```

---

## 🛠️ 2. Where to Paste the Tag in WordPress

### Option A: Using "WPCode" or "Insert Headers and Footers" Plugin (Simplest)
1. In WordPress Admin, go to **Code Snippets** (or **Settings** -> **Insert Headers and Footers**).
2. Go to **Header & Footer** scripts.
3. Paste the script tag into the **Header** (or **Footer**) box.
4. Click **Save Changes**.

### Option B: In `header.php` of Your Child Theme
1. In WordPress Admin, go to **Appearance** -> **Theme File Editor**.
2. Open `header.php` in your active child theme.
3. Paste the tag right before the closing `</head>` tag.
4. Click **Update File**.

### Option C: Via PHP `wp_head` Hook in `functions.php`
```php
add_action('wp_head', function () {
    ?>
    <!-- SuperAttribution First-Party Pixel -->
    <script src="https://<YOUR_LIVE_VERCEL_DOMAIN>/pixel.js" defer></script>
    <?php
});
```

---

## 🧪 3. Verification Test
1. Open your live store website in an incognito window with a test UTM parameter:
   `https://herbsmitra.com/?utm_source=facebook&utm_medium=cpc&utm_campaign=test_campaign&fbclid=test_fbclid_123`
2. Open Developer Tools -> **Console**:
   Type `window._sa_vid` and press Enter. It should output a UUID string (e.g. `c7a10dfb-8109-42b7-a3a8-4ceba6783228`).
3. Open Developer Tools -> **Network**:
   Filter for `track`. You will see a `POST` request to `https://<YOUR_LIVE_VERCEL_DOMAIN>/api/track` returning `{ ok: true, source: "Meta Ads" }` with HTTP status `200`.
