# SokoDigi Foundation Migration — Step 1

This checkpoint establishes MongoDB as the application database and Firebase Authentication as the identity provider.

## Completed in this checkpoint

- Added `backend/src` modular foundation.
- Added MongoDB connection under `backend/src/config/database.js`.
- Added Firebase Admin verification under `backend/src/config/firebaseAdmin.js`.
- Added Firebase ID-token middleware under `backend/src/middleware/authenticate.js`.
- Replaced the old password-based MongoDB `User` model with a Firebase UID-based application user model.
- Added `UserProfile`, `MemberNetwork`, `Counter`, and `Product` models.
- Added MongoDB-backed auth synchronization endpoint.
- Added public profile API foundation under `/api/profiles/:username`.
- Replaced the legacy JSON product API with a MongoDB-backed product API under `/api/products`.
- Added a legacy JSON product migration script: `npm run migrate:products`.
- Removed frontend Firestore application-user reads/writes.
- Removed `mlm_user` and `mlm_token` localStorage authentication dependencies.
- Centralized authenticated frontend API calls through `frontend/src/services/apiClient.js`.
- Kept legacy backend files physically present for later domain-by-domain migration, but they are no longer mounted by the new `backend/src/app.js`.

## Product data note

The supplied checkpoint contains zero records in both `backend/data/market.json` and `backend/data/myShop.json`. Therefore no product records required importing. The migration script remains available for any legacy records that are restored later.

## Required local setup

1. In `backend/`, run:
   `npm install`

2. Configure Firebase Admin credentials using one of the supported methods in:
   `backend/.env.example`

3. Set `MONGODB_URI` and `CORS_ORIGINS` in `backend/.env`.

4. In `frontend/.env`, keep `VITE_API_URL=http://localhost:3000/api`.

5. Start backend:
   `npm run dev`

6. Start frontend in a second terminal:
   `npm run dev`

## Important architectural rule

Firebase Authentication owns identity. MongoDB owns SokoDigi application data. Express owns authorization and business rules. The browser must not directly write application user data to Firestore or MongoDB.

## Not yet migrated

Wallets, commissions, MLM network calculations, messaging, videos, search, sales/order history, and other legacy JSON-backed domains remain intentionally untouched until their MongoDB schemas and services are migrated safely.
