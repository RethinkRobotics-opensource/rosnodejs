export default interface Spinner {
  addClient(client: any, id: string, queueSize: number, throttleMs: number): void;
  ping(clientId: string, msg: any): void;
  disconnect(clientId: string): void;
}
