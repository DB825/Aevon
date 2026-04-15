// ─── Firebase configuration ───────────────────────────────────────────────────
// 1. Go to https://console.firebase.google.com
// 2. Create a project (or open an existing one)
// 3. Project Settings → Your apps → Add a Web app
// 4. Copy the config object below and paste your values in
// 5. Enable Google sign-in: Authentication → Sign-in method → Google → Enable
// 6. Enable Firestore: Firestore Database → Create database
// 7. Set Firestore rules (Firestore → Rules tab):
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /users/{userId} {
//          allow read, write: if request.auth != null && request.auth.uid == userId;
//        }
//      }
//    }
//
// 8. Add your Vercel domain to Authorized domains:
//    Authentication → Settings → Authorized domains → Add domain
//    (e.g. aevon-gamma.vercel.app)
//
// Note: Firebase client config is intentionally public — security is enforced
// by Firestore security rules, not by hiding these values.
// ─────────────────────────────────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID",
};
