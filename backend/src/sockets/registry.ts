import type { Server } from 'socket.io';

let ioRef: Server | null = null;

export function setIo(server: Server): void {
  ioRef = server;
}

export function getIo(): Server | null {
  return ioRef;
}

export const rooms = {
  customer: (id: string) => `user:${id}`,
  rider: (id: string) => `rider:${id}`,
  booking: (id: string) => `booking:${id}`,
  admin: 'admins',
};
