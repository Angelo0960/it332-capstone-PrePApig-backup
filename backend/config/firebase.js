import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let serviceAccount;

// 1️⃣ Load credentials – try env first, fallback to file (if needed)
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    console.log('✅ Firebase credentials loaded from env');
  } catch (err) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT env var:', err.message);
  }
}

if (!serviceAccount) {
  // Optional fallback to local file (remove in production)
  try {
    const { readFileSync } = await import('fs');
    const { fileURLToPath } = await import('url');
    const { dirname, join } = await import('path');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const filePath = join(__dirname, 'it332-capstone-prepapig-firebase-adminsdk-fbsvc-3f6177fb0b.json');
    const fileContent = readFileSync(filePath, 'utf8');
    serviceAccount = JSON.parse(fileContent);
    console.log('✅ Firebase credentials loaded from file (fallback)');
  } catch (err) {
    console.error('❌ Failed to load Firebase credentials:', err.message);
    process.exit(1);
  }
}

// 2️⃣ Initialize Firebase Admin (only once)
if (getApps().length === 0) {
  try {
    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (err) {
    console.error('❌ Firebase initialization failed:', err.message);
    process.exit(1);
  }
}

// 3️⃣ Export a compatibility object so your controllers can still use `admin.messaging()`
const admin = {
  apps: getApps(),
  messaging: () => getMessaging(),
  // add other methods if needed
};

export default admin;