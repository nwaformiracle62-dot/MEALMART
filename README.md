# MEALMART

The customer storefront uses Firebase project `eliana-fb7da` (configured in `config.js`).
Customers sign up or sign in with Firebase Authentication, browse active products in
Cloud Firestore, and place orders through the `placeOrder` Cloud Function. Product
images are uploaded to Cloudinary and their secure URLs are stored in Cloud Firestore.
Orders are priced on the server using the current Firestore product prices; the
browser never chooses the order total.

## Firebase setup

1. In the Firebase console for `eliana-fb7da`, enable **Authentication → Email/Password**.
2. Create a Cloud Firestore database.
3. In Cloudinary, configure the unsigned upload preset named `Ecommerce` (including
   image format and size restrictions). The Cloud name and preset are set in
   `config.js`; unsigned presets are public and must enforce their own upload limits.
4. Install the Firebase CLI if needed (`npm install -g firebase-tools`), sign in with
   the Firebase project owner account, and deploy:

   ```sh
   firebase login
   npm run deploy
   ```

   Cloud Functions deployment requires a Firebase project on the Blaze billing plan.
   To deploy only Firestore rules after changing `firestore.rules`, run
   `firebase deploy --only firestore:rules --project eliana-fb7da`.
5. Create an account at `/signup.html`. Direct signups are redirected to `/admin.html`;
   checkout signups return to checkout. In Firebase Authentication, copy the account's
   UID. In Firestore, create the
   document `admins/{UID}` with the field `enabled` set to the boolean `true`. Admin
   documents cannot be created or changed from the website; only a project owner
   should grant this role.
6. Sign in with that account, open `/admin.html`, and upload products. The storefront
   displays only products marked active.

The admin dashboard includes customer-account and food-order/delivery tabs. New
customer signups are saved to the Firestore `users` collection; admins can view those
profiles and update order statuses. Customers who start checkout while signed out
can create an account or sign in first, then return to the saved basket and checkout.

The Firestore rules in this repository keep product writes admin-only, prevent
browser-side order writes, and let customers read only
their own orders. The Cloud Function validates the signed-in customer, reads trusted
prices from Firestore, calculates delivery, and creates the order. Deleting a product
removes its Firestore record; remove its Cloudinary asset separately from the
Cloudinary console if it is no longer needed.

## Run the storefront locally

With Node.js 18 or newer:

```sh
npm start
```

Open `http://localhost:3000`. Local browsing still calls the configured Firebase
project, so Auth, Firestore, Cloudinary, and deployed Functions must be set up for
sign-up, product uploads, and checkout to work.

Checkout currently supports **cash on delivery only**. No card details or online
payments are collected.
