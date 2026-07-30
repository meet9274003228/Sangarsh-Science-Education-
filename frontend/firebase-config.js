// Firebase Web SDK v10 Modular Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Read Firebase configuration from environment config
const env = window.__ENV__ || {};

const firebaseConfig = {
  apiKey: env.FIREBASE_API_KEY || "AIzaSy_YOUR_FIREBASE_API_KEY",
  authDomain: env.FIREBASE_AUTH_DOMAIN || "sangarsh-science-education.firebaseapp.com",
  projectId: env.FIREBASE_PROJECT_ID || "sangarsh-science-education",
  storageBucket: env.FIREBASE_STORAGE_BUCKET || "sangarsh-science-education.appspot.com",
  messagingSenderId: env.FIREBASE_MESSAGING_SENDER_ID || "10852938475",
  appId: env.FIREBASE_APP_ID || "1:10852938475:web:sangarsh_science_app"
};

// Initialize Firebase App
let firebaseApp = null;
let firebaseAuth = null;

try {
  firebaseApp = initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);
  console.log("🔥 Firebase App & Authentication Initialized Successfully:", firebaseApp.name);
} catch (error) {
  console.error("⚠️ Firebase Initialization Error:", error);
}

// Expose safely to window object for modular access across app.js without breaking legacy logic
window.firebaseApp = firebaseApp;
window.firebaseAuth = firebaseAuth;

export { firebaseApp, firebaseAuth };
