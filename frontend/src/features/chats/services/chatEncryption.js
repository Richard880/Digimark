const DB_NAME = "SokoDigi_E2EE_Vault";
const STORE_NAME = "device_keypairs";

// Local IndexedDB sandbox database link initializer
function openVaultDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const chatEncryptionService = {
  /**
   * Retrieves or builds an asymmetric keypair inside your secure browser sandbox
   */
  async getOrCreateSessionKeyPair(userId) {
    const db = await openVaultDB();
    const lookupKey = `keypair_${userId}`;
    
    return new Promise((resolve) => {
      const getReq = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(lookupKey);
      getReq.onsuccess = async () => {
        if (getReq.result) {
          resolve(getReq.result);
        } else {
          const newPair = await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true,
            ["deriveKey"]
          );
          db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(newPair, lookupKey);
          resolve(newPair);
        }
      };
    });
  },

  /**
   * Derives a symmetric AES key from your private key and your partner's public key
   */
  async deriveSharedSecret(myPrivateKey, partnerPublicKeyJwk) {
    const importedPartnerPublicKey = await window.crypto.subtle.importKey(
      "jwk",
      partnerPublicKeyJwk,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      []
    );

    return await window.crypto.subtle.deriveKey(
      { name: "ECDH", public: importedPartnerPublicKey },
      myPrivateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  },

  /**
   * Encrypts plaintext message text into base64 ciphertext strings
   */
  async encryptPlaintext(text, sharedKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      sharedKey,
      new TextEncoder().encode(text)
    );

    return {
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer))),
      iv: Array.from(iv)
    };
  },

  /**
   * Decrypts incoming ciphertext blobs back into human-readable strings
   */
  async decryptCiphertext(encryptedB64, ivArray, sharedKey) {
    try {
      const encryptedBuffer = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(ivArray) },
        sharedKey,
        encryptedBuffer
      );
      return new TextDecoder().decode(decryptedBuffer);
    } catch (err) {
      console.warn("⚠️ Decryption mismatch:", err.message);
      return "[Secure Decryption Link Failure: Session key mismatch]";
    }
  },

  async clearDeviceVault(userId) {
    const db = await openVaultDB();
    return db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(`keypair_${userId}`);
  }
};
