import { auth, db } from "./config.js";
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
    doc,
    getDoc,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const form = document.getElementById("auth-form");
const message = document.getElementById("auth-message");
const submitButton = document.getElementById("submit-button");
const mode = form.dataset.mode;
const params = new URLSearchParams(window.location.search);
let authFlowInProgress = false;

function destination() {
    if (mode === "signup") {
        if (params.get("next") === "checkout") {
            return "index.html?checkout=1";
        }
        return "admin.html";
    }

    return params.get("next") === "checkout"
        ? "index.html?checkout=1"
        : params.get("next") === "admin"
            ? "admin.html"
            : "index.html";
}

const createAccountLink = document.getElementById("create-account-link");
if (createAccountLink && params.get("next") === "checkout") {
    createAccountLink.href = "signup.html?next=checkout";
}

function readableAuthError(error) {
    switch (error.code) {
        case "auth/email-already-in-use":
            return "An account already uses this email. Sign in instead.";
        case "auth/invalid-email":
            return "Enter a valid email address.";
        case "auth/invalid-credential":
        case "auth/user-not-found":
        case "auth/wrong-password":
            return "Email or password is incorrect.";
        case "auth/weak-password":
            return "Choose a stronger password with at least 8 characters.";
        case "auth/too-many-requests":
            return "Too many attempts. Wait a little and try again.";
        case "auth/network-request-failed":
            return "Network error. Check your connection and try again.";
        case "auth/operation-not-allowed":
            return "Email and password sign-in is not enabled for this Firebase project.";
        case "permission-denied":
            return "Your account may have been created, but its customer profile could not be saved. Deploy the latest Firestore rules, then retry signup or sign in again.";
        default:
            return error.message || "Authentication failed. Please try again.";
    }
}

async function ensureUserProfile(user, displayName) {
    const userRef = doc(db, "users", user.uid);
    const userSnapshot = await getDoc(userRef);
    if (userSnapshot.exists()) {
        return;
    }

    await setDoc(userRef, {
        displayName: displayName || user.displayName || "Customer",
        email: user.email || "",
        phone: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
}

onAuthStateChanged(auth, (user) => {
    if (user && !authFlowInProgress) {
        window.location.replace(destination());
    }
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    message.textContent = "";
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const name = String(formData.get("displayName") || "").trim();

    if (mode === "signup" && name.length < 2) {
        message.textContent = "Enter your name (at least 2 characters).";
        return;
    }
    if (!email || password.length < 8) {
        message.textContent = "Enter your email and a password with at least 8 characters.";
        return;
    }

    submitButton.disabled = true;
    submitButton.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
    authFlowInProgress = true;

    try {
        if (mode === "signup") {
            const user = auth.currentUser?.email?.toLowerCase() === email.toLowerCase()
                ? auth.currentUser
                : (await createUserWithEmailAndPassword(auth, email, password)).user;
            await updateProfile(user, { displayName: name });
            await ensureUserProfile(user, name);
        } else {
            const credential = await signInWithEmailAndPassword(auth, email, password);
            await ensureUserProfile(credential.user);
        }
        window.location.replace(destination());
    } catch (error) {
        console.error("Authentication failed:", error);
        message.textContent = readableAuthError(error);
        submitButton.disabled = false;
        submitButton.textContent = mode === "signup" ? "Create account" : "Sign in";
    }
});

document.getElementById("reset-password")?.addEventListener("click", async () => {
    const email = String(new FormData(form).get("email") || "").trim();
    if (!email) {
        message.textContent = "Enter your email address first.";
        return;
    }
    message.textContent = "";
    try {
        await sendPasswordResetEmail(auth, email);
        message.className = "min-h-5 text-sm text-green-700";
        message.textContent = "If an account exists for this email, a password reset link has been sent.";
    } catch (error) {
        console.error("Password reset request failed:", error);
        message.className = "min-h-5 text-sm text-red-700";
        message.textContent = readableAuthError(error);
    }
});
