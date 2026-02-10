import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBJ_NDrla-jHpQHlmFKkuMA-fkt-bDFs08",
  authDomain: "plantao-feec6.firebaseapp.com",
  projectId: "plantao-feec6",
  storageBucket: "plantao-feec6.firebasestorage.app",
  messagingSenderId: "831243411453",
  appId: "1:831243411453:web:dbd65913dccbc610520394",
  measurementId: "G-WHM6T5XK59"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { db };
