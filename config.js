import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-functions.js";

export const firebaseConfig = {
    apiKey: "AIzaSyBsYayFvQ5F0eweyfK71tJ7bbvJ9InKdwU",
    authDomain: "eliana-fb7da.firebaseapp.com",
    databaseURL: "https://eliana-fb7da-default-rtdb.firebaseio.com",
    projectId: "eliana-fb7da",
    messagingSenderId: "412092808581",
    appId: "1:412092808581:web:b5adf550218a17467e98ec",
    measurementId: "G-BR0JBD6L95"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");
export const cloudinaryConfig = {
    cloudName: "a9brqzo6",
    uploadPreset: "Ecommerce"
};
