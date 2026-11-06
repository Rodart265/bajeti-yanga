# Admin Console on Firebase Spark

This edition is designed to run the read-only admin interface without deploying an admin Cloud Function. It uses Google Authentication plus Firestore Security Rules and a manually managed `adminUsers/{uid}` allowlist.

Follow `ADMIN-CONSOLE.md` for setup. The dashboard reads a maximum of 300 documents from each of these collections: `users`, `households`, `payments`, `chipereganyu_groups`, and `adminLog`.

Do not add client-side writes for account suspension, Premium grants, payment reconciliation, or edits to group contributions. Those require a trusted server-side environment. The Spark dashboard intentionally has no such controls.
