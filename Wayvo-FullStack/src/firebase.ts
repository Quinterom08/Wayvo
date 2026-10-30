
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDMwdbnlBEVQmgAc4YdfXdWZFNeh-L4C4w",
  authDomain: "wayvo-fde6b.firebaseapp.com",
  projectId: "wayvo-fde6b",
  storageBucket: "wayvo-fde6b.firebasestorage.app",
  messagingSenderId: "248959406625",
  appId: "1:248959406625:web:a981cd0c9381e49f05c960",
  measurementId: "G-43XZQ1W58G"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
