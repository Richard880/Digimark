import { initializeApp } from "firebase/app";
import { env } from "../utils/environment";

const firebaseConfig = {
  apiKey: env.firebaseApiKey,
  authDomain: env.firebaseAuthDomain,
  projectId: env.firebaseProjectId,
  storageBucket: env.firebaseStorageBucket,
  messagingSenderId: env.firebaseMessagingSenderId,
  appId: env.firebaseAppId,
    ...(env.firebaseMeasurementId && {
    measurementId: env.firebaseMeasurementId,
  }),
};


export default initializeApp(firebaseConfig);