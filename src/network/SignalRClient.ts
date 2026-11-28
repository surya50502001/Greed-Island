import * as signalR from '@microsoft/signalr';
import { SharedWorldPlayer } from '../domain/multiplayer/validation';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type RemotePlayerSnapshot = SharedWorldPlayer;

export interface WorldEnterResult {
  success: boolean;
  error?: string;
  playerId?: string;
  reconnectToken?: string;
  characterName?: string;
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
  comboStep: number;
}

export interface AttackRequestPayload {
  targetPlayerId: string;
  comboStep: number;
}

export interface PlayerAttackedEvent {
  attackerPlayerId: string;
  targetPlayerId: string;
  comboStep: number;
}

export interface PlayerDamagedEvent {
  attackerPlayerId: string;
  targetPlayerId: string;
  damage: number;
  currentHealth: number;
  maxHealth: number;
  isAlive: boolean;
  comboStep: number;
}

export interface PlayerDiedEvent {
  playerId: string;
  killerPlayerId: string;
  respawnDelaySeconds: number;
}

export interface PlayerRespawnedEvent {
  player: RemotePlayerSnapshot;
}

export interface SignalRHandlers {
  onConnectionStateChange?: (status: ConnectionStatus) => void;
  onPlayerJoined?: (snapshot: RemotePlayerSnapshot) => void;
  onPlayerMoved?: (snapshot: RemotePlayerSnapshot) => void;
  onPlayerLeft?: (payload: {
    playerId: string;
    players: RemotePlayerSnapshot[];
  }) => void;
  onPlayerAttacked?: (ev: PlayerAttackedEvent) => void;
  onPlayerDamaged?: (ev: PlayerDamagedEvent) => void;
  onPlayerDied?: (ev: PlayerDiedEvent) => void;
  onPlayerRespawned?: (ev: PlayerRespawnedEvent) => void;
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
    conn.on('PlayerJoined', (snapshot) => handlers.onPlayerJoined?.(snapshot));
    conn.on('PlayerMoved', (snapshot) => handlers.onPlayerMoved?.(snapshot));
    conn.on('PlayerLeft', (payload) => handlers.onPlayerLeft?.(payload));
    conn.on('PlayerAttacked', (ev) => handlers.onPlayerAttacked?.(ev));
    conn.on('PlayerDamaged', (ev) => handlers.onPlayerDamaged?.(ev));
    conn.on('PlayerDied', (ev) => handlers.onPlayerDied?.(ev));
    conn.on('PlayerRespawned', (ev) => handlers.onPlayerRespawned?.(ev));
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

  public async enterWorld(characterName: string): Promise<WorldEnterResult> {
    if (!this.connection) {
      return { success: false, error: 'Not connected to server.', players: [] };
    }
    return this.connection.invoke<WorldEnterResult>('EnterWorld', characterName);
  }

  public async reconnectWorld(
    playerId: string,
    reconnectToken: string,
    characterName: string
  ): Promise<WorldEnterResult> {
    if (!this.connection) {
      return { success: false, error: 'Not connected to server.', players: [] };
    }
    return this.connection.invoke<WorldEnterResult>(
      'ReconnectWorld',
      playerId,
      reconnectToken,
      characterName
    );
  }

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

  public requestAttack(payload: AttackRequestPayload): void {
    if (
      !this.connection ||
      this.connection.state !== signalR.HubConnectionState.Connected
    ) {
      return;
    }
    void this.connection.invoke('RequestAttack', payload).catch(() => {});
  }

  public async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop();
      this.connection = null;
    }
  }
}
