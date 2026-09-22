// 🔒 Protected PIN Fallback Release Route
router.patch("/verify-release-pin", authenticate, releaseEscrowViaPinVerification);
