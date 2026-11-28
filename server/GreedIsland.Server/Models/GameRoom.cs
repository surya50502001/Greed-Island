using System.Collections.Concurrent;

namespace GreedIsland.Server.Models;

public sealed class GameRoom
{
    public const int DefaultMaxPlayers = 2;

    public required string RoomCode { get; init; }
    public int MaxPlayers { get; init; } = DefaultMaxPlayers;
    public bool IsReady { get; set; }
    public DateTimeOffset CreatedAtUtc { get; init; } = DateTimeOffset.UtcNow;
    public ConcurrentDictionary<string, PlayerSnapshot> Players { get; } = new();
    public object SyncRoot { get; } = new();
}
