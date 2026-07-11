import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
} from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyD-_S3PBANjwMQU3G44Q9nJjwq_4lApu3s",
    authDomain: "net-worth-dbcd4.firebaseapp.com",
    projectId: "net-worth-dbcd4",
    storageBucket: "net-worth-dbcd4.firebasestorage.app",
    messagingSenderId: "940993413980",
    appId: "1:940993413980:web:ab4852b99052a6ec00b799",
    measurementId: "G-K62HFEHFF0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Enable Firestore's IndexedDB-backed offline cache with multi-tab support, so
// reads work offline and writes made offline are queued and flushed on
// reconnect (the app's localStorage mirror is only a last-state snapshot, not a
// write queue). Must be configured here, before any other Firestore access.
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
