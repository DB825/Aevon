const { verifyToken } = require("@clerk/backend");
const admin = require("firebase-admin");

// Singleton Firebase Admin app
function getAdminApp() {
  try {
    return admin.app();
  } catch {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).end();

  const { sessionToken } = req.body || {};
  if (!sessionToken) return res.status(400).json({ error: "Missing sessionToken" });

  try {
    // Verify the Clerk session JWT
    const payload = await verifyToken(sessionToken, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    // Mint a Firebase custom token using the Clerk user ID as the UID
    getAdminApp();
    const customToken = await admin.auth().createCustomToken(payload.sub);

    res.status(200).json({ customToken });
  } catch (err) {
    console.error("Token exchange error:", err.message);
    res.status(401).json({ error: "Unauthorized" });
  }
};
