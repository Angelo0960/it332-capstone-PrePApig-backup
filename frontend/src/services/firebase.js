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
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("❌ Notification permission denied");
      return null;
    }
    const registration = await navigator.serviceWorker.register(
      "/firebase-messaging-sw.js"
    );
    await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (token) {
      console.log("✅ FCM Token:", token);
      return token;
    }
    return null;
  } catch (err) {
    console.error("FCM Error:", err);
    return null;
  }
};

export const onMessageListener = () => {
  return new Promise((resolve) => {
    onMessage(messaging, (payload) => {
      console.log("📨 Foreground message payload:", payload);

      const title = payload.notification?.title || "PrepAPig Notification";
      const body = payload.notification?.body || "You have a new update.";
      const icon = `${window.location.origin}/vite.svg`;

      if (Notification.permission !== "granted") {
        console.warn("⚠️ Permission not granted.");
        resolve(payload);
        return;
      }

      // ✅ Use service worker to show notification (most reliable)
      if (navigator.serviceWorker.controller) {
        console.log("✅ Sending notification via service worker");
        navigator.serviceWorker.controller.postMessage({
          type: "SHOW_NOTIFICATION",
          title,
          body,
          icon,
        });
      } else {
        console.warn("⚠️ No service worker controller, registering...");
        // Fallback: try to get a controller
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