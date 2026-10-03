/*
 * 1000 Decisions — product settings. The only file you edit to sell it.
 *
 * license.enabled: false  → the app is free and unlimited (default).
 * license.enabled: true   → a free trial, then a license key is needed to
 *                           keep logging. Keys are checked with Lemon Squeezy.
 *
 * To turn it on:
 *   1. Create a Lemon Squeezy store and a product, and enable
 *      "Generate license keys" on the product (activation limit e.g. 3).
 *   2. Put the checkout link in buyUrl, and your store and product IDs
 *      below (Lemon Squeezy → Settings → Stores / the product page).
 *   3. Set enabled to true.
 */
window.TD_CONFIG = window.TD_CONFIG || {
  license: {
    enabled: false,
    trialDays: 14,
    price: '$49',                 // shown on the buy screen; set it to your real price
    buyUrl: '',                   // e.g. https://yourstore.lemonsqueezy.com/buy/xxxxxxxx
    storeId: null,                // number, e.g. 12345 (keys from other stores are refused)
    productId: null,              // number, optional: only accept keys for this product
    revalidateDays: 7,            // check the key again this often when online
    offlineGraceDays: 30          // keep working offline this long after the last check
  }
};
