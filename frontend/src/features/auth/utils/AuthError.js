export default class AuthError extends Error {
  constructor(message, code) {
    super(message);

    this.name = "AuthError";
    this.code = code;
  }
}