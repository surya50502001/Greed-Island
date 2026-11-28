import * as signalR from '@microsoft/signalr';

export interface RemotePlayerSnapshot {
  playerId: string;
  characterName: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  locomotionState: string;
  horizSpeed: number;
  isFlying: boolean;
  hasWeapon: boolean;
  isInvisible: boolean;
  timestampMs: number;
}

export interface RoomActionResult {
  success: boolean;
  error?: string;
  roomCode?: string;
  playerId?: string;
  characterName?: string;
  isReady: boolean;
  players: RemotePlayerSnapshot[];
}

export interface MovementInputPayload {
  x: number;
  y: number;
  z: number;
  yaw: number;
  locomotionState: string;
  horizSpeed: number;
  isFlying: boolean;
  hasWeapon: boolean;
  isInvisible: boolean;
}

export interface SignalRHandlers {
  onRoomUpdated?: (payload: {
    roomCode: string;
    isReady: boolean;
    players: RemotePlayerSnapshot[];
  }) => void;
  onWorldReady?: (payload: {
    roomCode: string;
    players: RemotePlayerSnapshot[];
  }) => void;
  onPlayerMoved?: (snapshot: RemotePlayerSnapshot) => void;
  onPlayerLeft?: (payload: {
    playerId: string;
    players: RemotePlayerSnapshot[];
  }) => void;
  onDisconnected?: (err?: Error) => void;
}

export function getMultiplayerHubUrl(): string {
  const configured = import.meta.env.VITE_MULTIPLAYER_URL as string | undefined;
  if (configured && configured.trim().length > 0) {
    return configured.trim();
  }
  return 'http://localhost:5000/hubs/game';
}

export class GreedSignalRClient {
  private connection: signalR.HubConnection | null = null;
  private lastSendMs = 0;

  public async connect(handlers: SignalRHandlers): Promise<void> {
    if (
      this.connection &&
      this.connection.state === signalR.HubConnectionState.Connected
    ) {
      return;
    }

    const hubUrl = getMultiplayerHubUrl();
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect()
      .build();

    conn.on('RoomUpdated', (payload) => handlers.onRoomUpdated?.(payload));
    conn.on('WorldReady', (payload) => handlers.onWorldReady?.(payload));
    conn.on('PlayerMoved', (snapshot) => handlers.onPlayerMoved?.(snapshot));
    conn.on('PlayerLeft', (payload) => handlers.onPlayerLeft?.(payload));
    conn.onclose((err) => handlers.onDisconnected?.(err));

    try {
      await conn.start();
      this.connection = conn;
    } catch {
      // Fallback with SignalR negotiation enabled if direct WebSockets is blocked by proxy
      const fallbackConn = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl)
        .withAutomaticReconnect()
        .build();
      fallbackConn.on('RoomUpdated', (payload) => handlers.onRoomUpdated?.(payload));
      fallbackConn.on('WorldReady', (payload) => handlers.onWorldReady?.(payload));
      fallbackConn.on('PlayerMoved', (snapshot) => handlers.onPlayerMoved?.(snapshot));
      fallbackConn.on('PlayerLeft', (payload) => handlers.onPlayerLeft?.(payload));
      fallbackConn.onclose((err) => handlers.onDisconnected?.(err));
      await fallbackConn.start();
      this.connection = fallbackConn;
    }
  }

  public async createRoom(characterName: string): Promise<RoomActionResult> {
    if (!this.connection) {
      return { success: false, error: 'Not connected to server.', isReady: false, players: [] };
    }
    return this.connection.invoke<RoomActionResult>('CreateRoom', characterName);
  }

  public async joinRoom(characterName: string, roomCode: string): Promise<RoomActionResult> {
    if (!this.connection) {
      return { success: false, error: 'Not connected to server.', isReady: false, players: [] };
    }
    return this.connection.invoke<RoomActionResult>('JoinRoom', characterName, roomCode);
  }

  /**
   * Sends movement at ~16 Hz (every 60ms) to keep bandwidth smooth and predictable.
   */
  public sendMovement(payload: MovementInputPayload): void {
    if (
      !this.connection ||
      this.connection.state !== signalR.HubConnectionState.Connected
    ) {
      return;
    }
    const now = performance.now();
    if (now - this.lastSendMs < 60) return;
    this.lastSendMs = now;
    void this.connection.invoke('SendMovement', payload).catch(() => {});
  }

  public async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }
  }
}
