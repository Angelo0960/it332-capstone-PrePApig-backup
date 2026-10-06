import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

const parseServiceAccount = () => {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  return null;
};

let messaging;

try {
  const serviceAccount = parseServiceAccount();
  if (serviceAccount) {
    const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
    messaging = getMessaging(app);
  } else {
    console.warn('Firebase push notifications disabled: Firebase credentials are not configured.');
  }
} catch (error) {
  console.error('Firebase initialization failed:', error.message);
}

const admin = {
  messaging: () => {
    if (!messaging) {
      return {
        send: async () => ({ skipped: true }),
      };
    }
    return messaging;
  },
};

export default admin;