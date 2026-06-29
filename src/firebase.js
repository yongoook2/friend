// Firebase 프로젝트 설정 (fireman 프로젝트)
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDtcP3VNt47u0Xl8TFpM-RtDfNdlY0dLu8",
  authDomain: "fireman-bb801.firebaseapp.com",
  projectId: "fireman-bb801",
  storageBucket: "fireman-bb801.firebasestorage.app",
  messagingSenderId: "115385530126",
  appId: "1:115385530126:web:a5d64117eb2a3884b3095f",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
