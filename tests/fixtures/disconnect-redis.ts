/** Release a test client without issuing commands to a possibly closed socket.
 * Fault-injection clients can still report `ready` after disconnect(), so neither
 * checking status nor sending QUIT is a safe teardown operation.
 */
export function disconnectTestRedis(client: {disconnect(): void} | undefined): void {
  client?.disconnect();
}
