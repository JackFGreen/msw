export class MswError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MswError";
  }
}
