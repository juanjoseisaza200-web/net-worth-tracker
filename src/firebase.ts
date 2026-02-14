import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyD-_S3PBANjwMQU3G44Q9njjwq_4lApu3s",
    authDomain: "net-worth-dbcd4.firebaseapp.com",
    projectId: "net-worth-dbcd4",
    storageBucket: "net-worth-dbcd4.firebasestorage.app",
    messagingSenderId: "940993413980",
    appId: "1:940993413980:web:ab4852b99052a6ec00b799",
    measurementId: "G-K62HFEHFF0"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
