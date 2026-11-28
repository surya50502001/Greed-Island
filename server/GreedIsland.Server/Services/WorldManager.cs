using System.Collections.Concurrent;
using GreedIsland.Server.Models;

namespace GreedIsland.Server.Services;

/// <summary>
/// Manages the single shared open-world instance ("world:main") and all connected players.
/// </summary>
public sealed class WorldManager
{
    public const string MainWorldGroup = "world:main";
    public const int DefaultMaxHealth = 100;

    // Starting Plaza cobblestone dais height (matches terrain.ts getGroundHeight(x, z) = 2.06 for r <= 6.35)
    private const double PlazaSpawnHeight = 2.06;
    private const double PlazaSpawnRadius = 2.6;

    private readonly ConcurrentDictionary<string, PlayerSnapshot> _players = new();
    private int _spawnCounter;
    public object SyncRoot { get; } = new();

    public (double X, double Y, double Z, double Yaw) NextPlazaSpawn()
    {
        var idx = Interlocked.Increment(ref _spawnCounter) - 1;
        var angle = (idx % 8) * (Math.PI * 2.0 / 8.0);
        var x = Math.Round(Math.Cos(angle) * PlazaSpawnRadius, 2);
        var z = Math.Round(Math.Sin(angle) * PlazaSpawnRadius, 2);
        return (x, PlazaSpawnHeight, z, 0.0);
    }

    public PlayerSnapshot EnterWorld(PlayerSession session) =>
        EnterWorldAndSnapshot(session).Self;

    /// <summary>
    /// Atomically inserts or refreshes the player's world snapshot and captures the full world
    /// player list under the same lock so concurrent joins cannot miss each other.
    /// </summary>
    public (PlayerSnapshot Self, PlayerSnapshot[] AllPlayers) EnterWorldAndSnapshot(PlayerSession session)
    {
        lock (SyncRoot)
        {
            if (_players.TryGetValue(session.PlayerId, out var existing))
            {
                existing.TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                return (existing, _players.Values.ToArray());
            }

            var spawn = NextPlazaSpawn();
            var snapshot = new PlayerSnapshot
            {
                PlayerId = session.PlayerId,
                CharacterName = session.CharacterName,
                X = spawn.X,
                Y = spawn.Y,
                Z = spawn.Z,
                Yaw = spawn.Yaw,
                LocomotionState = "Idle",
                CurrentHealth = DefaultMaxHealth,
                MaxHealth = DefaultMaxHealth,
                IsAlive = true,
                TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            _players[session.PlayerId] = snapshot;
            return (snapshot, _players.Values.ToArray());
        }
    }

    public PlayerSnapshot? GetPlayer(string playerId) =>
        _players.TryGetValue(playerId, out var p) ? p : null;

    public PlayerSnapshot[] GetAllPlayers()
    {
        lock (SyncRoot)
        {
            return _players.Values.ToArray();
        }
    }

    public bool RemovePlayer(string playerId) =>
        _players.TryRemove(playerId, out _);
}
