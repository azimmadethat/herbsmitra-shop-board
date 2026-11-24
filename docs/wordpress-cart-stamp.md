# WooCommerce Cart Stamp Snippet (WordPress)

> **MANUAL STEP REQUIRED ON THE WOOCOMMERCE STORE**  
> This snippet must be installed inside WordPress (via the **Code Snippets** plugin or your active child theme's `functions.php`).  
> It reads the visitor ID and journey stored by `pixel.js` and stamps them onto the WooCommerce order as metadata fields: `sa_visitor_id` and `sa_journey`.

---

## 🛠️ Step-by-Step Installation

### Method A: Using Code Snippets Plugin (Recommended)
1. In your WordPress admin dashboard, go to **Snippets** -> **Add New**.
2. Give the snippet a title, e.g.: `SuperAttribution - Cart Stamp for Orders`.
3. Set the snippet type to **PHP Code** and choose **Run snippet everywhere**.
4. Paste the PHP code below into the code box.
5. Click **Save Changes and Activate**.

### Method B: In Child Theme `functions.php`
1. Navigate to `wp-content/themes/<your-child-theme>/functions.php`.
2. Paste the snippet code at the end of the file.
3. Save the file.

---

## 💻 PHP Code Snippet

```php
<?php
/**
 * SuperAttribution - Stamp visitor ID and non-direct journey onto WooCommerce Orders
 */

// 1. Inject hidden fields or read cookie directly at checkout
add_action('woocommerce_checkout_update_order_meta', function ($order_id) {
    // Read visitor ID from first-party cookie or POST
    $visitor_id = '';
    if (!empty($_COOKIE['_sa_vid'])) {
        $visitor_id = sanitize_text_field($_COOKIE['_sa_vid']);
    } elseif (!empty($_POST['sa_visitor_id'])) {
        $visitor_id = sanitize_text_field($_POST['sa_visitor_id']);
    }

    if (!empty($visitor_id)) {
        update_post_meta($order_id, 'sa_visitor_id', $visitor_id);
    }

    // Read journey snapshot from POST or cookie
    $journey_json = '';
    if (!empty($_POST['sa_journey'])) {
        $journey_json = wp_unslash($_POST['sa_journey']);
    } elseif (!empty($_COOKIE['_sa_journey'])) {
        $journey_json = wp_unslash($_COOKIE['_sa_journey']);
    }

    if (!empty($journey_json)) {
        // Validate JSON
        $decoded = json_decode($journey_json, true);
        if (json_last_error() === JSON_ERROR_NONE && is_array($decoded)) {
            update_post_meta($order_id, 'sa_journey', wp_json_encode($decoded));
        }
    }
});

// 2. JavaScript helper on checkout page to populate hidden inputs from localStorage if cookies are delayed
add_action('woocommerce_after_checkout_form', function () {
    ?>
    <input type="hidden" name="sa_visitor_id" id="sa_visitor_id_field" value="" />
    <input type="hidden" name="sa_journey" id="sa_journey_field" value="" />
    <script type="text/javascript">
    (function() {
        try {
            var vid = window._sa_vid || localStorage.getItem('_sa_vid') || '';
            var jrn = window._sa_journey ? JSON.stringify(window._sa_journey) : localStorage.getItem('_sa_journey') || '';
            var elVid = document.getElementById('sa_visitor_id_field');
            var elJrn = document.getElementById('sa_journey_field');
            if (elVid && vid) elVid.value = vid;
            if (elJrn && jrn) elJrn.value = jrn;
        } catch(e) {}
    })();
    </script>
    <?php
});

// 3. Make meta available in WooCommerce REST API order responses
add_filter('woocommerce_rest_prepare_shop_order_object', function ($response, $order, $request) {
    $data = $response->get_data();
    $visitor_id = get_post_meta($order->get_id(), 'sa_visitor_id', true);
    $journey = get_post_meta($order->get_id(), 'sa_journey', true);
    
    // Attach to meta_data array if not already present
    if (!empty($visitor_id) || !empty($journey)) {
        if (!isset($data['meta_data'])) {
            $data['meta_data'] = [];
        }
        if (!empty($visitor_id)) {
            $data['meta_data'][] = (object)[
                'key' => 'sa_visitor_id',
                'value' => $visitor_id
            ];
        }
        if (!empty($journey)) {
            $data['meta_data'][] = (object)[
                'key' => 'sa_journey',
                'value' => $journey
            ];
        }
        $response->set_data($data);
    }
    return $response;
}, 10, 3);
```

---

## 🔍 How to Verify
1. Place a test order on the WooCommerce store.
2. In WordPress Admin, open **WooCommerce** -> **Orders** -> Click the test order.
3. Check the **Custom Fields** panel: you should see `sa_visitor_id` and `sa_journey`.
