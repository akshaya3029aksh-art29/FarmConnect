import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAbHHttGAMHcB055NrSyVIoVv4CUTiCv30",
  authDomain: "farmconnect-987d6.firebaseapp.com",
  projectId: "farmconnect-987d6",
  storageBucket: "farmconnect-987d6.firebasestorage.app",
  messagingSenderId: "933140739132",
  appId: "1:933140739132:web:aa6bea879a64efc3607f39"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;