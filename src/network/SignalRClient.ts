import * as signalR from '@microsoft/signalr';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

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
  onConnectionStateChange?: (status: ConnectionStatus) => void;
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
  onReconnected?: () => void;
  onDisconnected?: (err?: Error) => void;
}

export function resolveMultiplayerHubUrl(
  configuredUrl: string | undefined,
  isDev: boolean
): string | null {
  if (configuredUrl && configuredUrl.trim().length > 0) {
    return configuredUrl.trim();
  }
  return isDev ? 'http://localhost:5000/hubs/game' : null;
}

export function getMultiplayerHubUrl(): string | null {
  return resolveMultiplayerHubUrl(
    import.meta.env.VITE_MULTIPLAYER_URL as string | undefined,
    Boolean(import.meta.env.DEV)
  );
}

export class GreedSignalRClient {
  private connection: signalR.HubConnection | null = null;
  private lastSendMs = 0;

  private attachLifecycle(conn: signalR.HubConnection, handlers: SignalRHandlers): void {
    conn.on('RoomUpdated', (payload) => handlers.onRoomUpdated?.(payload));
    conn.on('WorldReady', (payload) => handlers.onWorldReady?.(payload));
    conn.on('PlayerMoved', (snapshot) => handlers.onPlayerMoved?.(snapshot));
    conn.on('PlayerLeft', (payload) => handlers.onPlayerLeft?.(payload));
    conn.onreconnecting(() => handlers.onConnectionStateChange?.('reconnecting'));
    conn.onreconnected(() => {
      handlers.onConnectionStateChange?.('connected');
      handlers.onReconnected?.();
    });
    conn.onclose((err) => {
      handlers.onConnectionStateChange?.('disconnected');
      handlers.onDisconnected?.(err);
    });
  }

  public async connect(handlers: SignalRHandlers): Promise<void> {
    if (
      this.connection &&
      this.connection.state === signalR.HubConnectionState.Connected
    ) {
      handlers.onConnectionStateChange?.('connected');
      return;
    }

    const hubUrl = getMultiplayerHubUrl();
    if (!hubUrl) {
      handlers.onConnectionStateChange?.('disconnected');
      throw new Error('VITE_MULTIPLAYER_URL is not configured for production.');
    }

    handlers.onConnectionStateChange?.('connecting');
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect([0, 1000, 2500, 5000, 10000])
      .build();

    this.attachLifecycle(conn, handlers);

    try {
      await conn.start();
      this.connection = conn;
      handlers.onConnectionStateChange?.('connected');
    } catch {
      const fallbackConn = new signalR.HubConnectionBuilder()
        .withUrl(hubUrl)
        .withAutomaticReconnect([0, 1000, 2500, 5000, 10000])
        .build();
      this.attachLifecycle(fallbackConn, handlers);
      await fallbackConn.start();
      this.connection = fallbackConn;
      handlers.onConnectionStateChange?.('connected');
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

  public async reconnectToRoom(
    playerId: string,
    characterName: string,
    roomCode: string
  ): Promise<RoomActionResult> {
    if (!this.connection) {
      return { success: false, error: 'Not connected to server.', isReady: false, players: [] };
    }
    return this.connection.invoke<RoomActionResult>(
      'ReconnectToRoom',
      playerId,
      characterName,
      roomCode
    );
  }

  public async leaveRoom(): Promise<void> {
    if (
      this.connection &&
      this.connection.state === signalR.HubConnectionState.Connected
    ) {
      await this.connection.invoke('LeaveRoom').catch(() => {});
    }
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
      await this.leaveRoom();
      await this.connection.stop();
      this.connection = null;
    }
  }
}
