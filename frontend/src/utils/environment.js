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
  firebaseApiKey: __FIREBASE_API_KEY__,
  firebaseAuthDomain: __FIREBASE_AUTH_DOMAIN__,
  firebaseProjectId: __FIREBASE_PROJECT_ID__,
  firebaseStorageBucket: __FIREBASE_STORAGE_BUCKET__,
  firebaseMessagingSenderId: __FIREBASE_MESSAGING_SENDER_ID__,
  firebaseAppId: __FIREBASE_APP_ID__,
  firebaseMeasurementId: __FIREBASE_MEASUREMENT_ID__,
};