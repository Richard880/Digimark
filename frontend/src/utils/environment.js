const requiredVariables = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID",
  "FIREBASE_MEASUREMENT_ID",
];

requiredVariables.forEach((key) => {
  if (!import.meta.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

export const env = {
  firebaseApiKey: import.meta.env.FIREBASE_API_KEY,
  firebaseAuthDomain: import.meta.env.FIREBASE_AUTH_DOMAIN,
  firebaseProjectId: import.meta.env.FIREBASE_PROJECT_ID,
  firebaseStorageBucket: import.meta.env.FIREBASE_STORAGE_BUCKET,
  firebaseMessagingSenderId: import.meta.env.FIREBASE_MESSAGING_SENDER_ID,
  firebaseAppId: import.meta.env.FIREBASE_APP_ID,
  firebaseMeasurementId: import.meta.env.FIREBASE_MEASUREMENT_ID,
};