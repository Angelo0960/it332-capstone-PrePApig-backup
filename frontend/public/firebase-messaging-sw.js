importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBGo85O6l3qUQQceLeOxzijJyCkVXAojm4",
  authDomain: "it332-capstone-prepapig.firebaseapp.com",
  projectId: "it332-capstone-prepapig",
  storageBucket: "it332-capstone-prepapig.appspot.com",
  messagingSenderId: "657692690405",
  appId: "1:657692690405:web:6fee3e96ccb4224424910c",
  measurementId: "G-BKJKSW9EK3",
});

const messaging = firebase.messaging();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Background notifications
messaging.onBackgroundMessage((payload) => {
  console.log("Background Message:", payload);
  self.registration.showNotification(
    payload.notification?.title || "Notification",
    {
      body: payload.notification?.body,
      icon: payload.notification?.icon || "/vite.svg",
    }
  );
});

// ✅ Foreground notifications via postMessage
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, body, icon } = event.data;
    console.log("📬 Service worker received message:", title);
    self.registration.showNotification(title, {
      body,
      icon: icon || "/vite.svg",
    });
  }
});