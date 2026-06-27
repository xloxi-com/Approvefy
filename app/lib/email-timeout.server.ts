/** Race email sends against a timeout so SMTP hangs never block HTTP responses indefinitely. */
export function withEmailSendTimeout<T>(promise: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Email send timeout")), ms);
    }),
  ]);
}
