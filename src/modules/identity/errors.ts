export class AuthenticationError extends Error {
  constructor(
    message: string,
    readonly status = 401,
  ) {
    super(message);
  }
}
