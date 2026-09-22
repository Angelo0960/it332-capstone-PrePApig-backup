import { initializeApp } from "firebase/app";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBGo85O6l3qUQQceLeOxzijJyCkVXAojm4",
  authDomain: "it332-capstone-prepapig.firebaseapp.com",
  projectId: "it332-capstone-prepapig",
  storageBucket: "it332-capstone-prepapig.appspot.com",
  messagingSenderId: "657692690405",
  appId: "1:657692690405:web:6fee3e96ccb4224424910c",
  measurementId: "G-BKJKSW9EK3"
};

const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);

export const generateToken = async () => {
  try {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service Worker not supported');
      return null;
    }
    
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("❌ Notification permission denied");
      return null;
    }
    
    const registration = await navigator.serviceWorker.ready;
    if (!registration.pushManager) {
      console.warn('Push Manager not supported');
      return null;
    }
    
    const vapidKey = import.meta.env.VITE_VAPID_KEY;
    if (!vapidKey) {
      console.error('VAPID key not configured');
      return null;
    }

    const token = await getToken(messaging, {
      vapidKey,
      serviceWorkerRegistration: registration,
    });
    
    if (token) {
      console.log("✅ FCM Token:", token);
      return token;
    }
    
    console.warn('No FCM token received');
    return null;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn('FCM registration aborted - push service unavailable or VAPID key mismatch');
    } else if (err.name === 'NotAllowedError') {
      console.warn('FCM permission denied');
    } else {
      console.error("FCM Error:", err);
    }
    return null;
  }
};

export const onMessageListener = () => {
  return new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      console.log("📨 Foreground message payload:", payload);

      const title = payload.notification?.title || "PrepAPig Notification";
      const body = payload.notification?.body || "You have a new update.";
      const icon = `${window.location.origin}/icons/icon-192x192.png`;

      if (Notification.permission !== "granted") {
        console.warn("⚠️ Permission not granted.");
        resolve(payload);
        return;
      }

      if (navigator.serviceWorker.controller) {
        console.log("✅ Sending notification via service worker");
        navigator.serviceWorker.controller.postMessage({
          type: "SHOW_NOTIFICATION",
          title,
          body,
          icon,
        });
      } else {
        console.warn("⚠️ No service worker controller, using ready promise...");
        navigator.serviceWorker.ready.then(registration => {
          if (registration.active) {
            registration.active.postMessage({
              type: "SHOW_NOTIFICATION",
              title,
              body,
              icon,
            });
          } else {
            console.warn("⚠️ No active service worker, using direct notification");
            try {
              new Notification(title, { body, icon });
            } catch (err) {
              console.error("❌ Direct notification failed:", err);
            }
          }
        });
      }
      resolve(payload);
    });
  });
};