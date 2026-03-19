import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyACvGUjdau8-36ITGvE5dXeFir_GzTiK1E',
  authDomain: 'kissd-review.firebaseapp.com',
  projectId: 'kissd-review',
  storageBucket: 'kissd-review.firebasestorage.app',
  messagingSenderId: '720957931719',
  appId: '1:720957931719:web:857d42a7dc2bb2d4943ee2',
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Google OAuth Web Client ID — the one created manually in GCP Console
// with http://localhost and http://localhost:5173 as authorized JS origins.
export const GOOGLE_CLIENT_ID =
  '620928038175-euo6jfvosmlvnp9t4g7tpbn4r344vn7u.apps.googleusercontent.com';
