using System.Collections.Concurrent;
using System.Security.Cryptography;
using GreedIsland.Server.Models;

namespace GreedIsland.Server.Services;

public sealed class RoomManager
{
    private const string CodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private readonly ConcurrentDictionary<string, GameRoom> _rooms = new(StringComparer.OrdinalIgnoreCase);

    // Starting Plaza cobblestone dais height (matches terrain.ts getGroundHeight(±2, 0) = 2.06)
    public static readonly (double X, double Y, double Z, double Yaw)[] SharedPlazaSpawns =
    [
        (-2.0, 2.06, 0.0, 0.0),
        (2.0, 2.06, 0.0, 0.0),
    ];

    public GameRoom CreateRoom(PlayerSession host)
    {
        var code = GenerateUniqueCode();
        var room = new GameRoom { RoomCode = code };
        lock (room.SyncRoot)
        {
            var spawn = SharedPlazaSpawns[0];
            room.Players[host.PlayerId] = new PlayerSnapshot
            {
                PlayerId = host.PlayerId,
                CharacterName = host.CharacterName,
                X = spawn.X,
                Y = spawn.Y,
                Z = spawn.Z,
                Yaw = spawn.Yaw,
                LocomotionState = "Idle",
                TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            host.RoomCode = code;
        }
        _rooms[code] = room;
        return room;
    }

    public (bool Success, string? Error, GameRoom? Room) JoinRoom(PlayerSession player, string? rawCode)
    {
        var code = (rawCode ?? string.Empty).Trim().ToUpperInvariant();
        if (code.Length != 6)
        {
            return (false, "Room code must be 6 characters.", null);
        }

        if (!_rooms.TryGetValue(code, out var room))
        {
            return (false, "Room not found. Check the room code.", null);
        }

        lock (room.SyncRoot)
        {
            if (room.Players.ContainsKey(player.PlayerId))
            {
                return (true, null, room);
            }

            if (room.Players.Count >= room.MaxPlayers)
            {
                return (false, "Room is already full (max 2 players).", null);
            }

            var slotIndex = Math.Min(room.Players.Count, SharedPlazaSpawns.Length - 1);
            var spawn = SharedPlazaSpawns[slotIndex];
            room.Players[player.PlayerId] = new PlayerSnapshot
            {
                PlayerId = player.PlayerId,
                CharacterName = player.CharacterName,
                X = spawn.X,
                Y = spawn.Y,
                Z = spawn.Z,
                Yaw = spawn.Yaw,
                LocomotionState = "Idle",
                TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            player.RoomCode = room.RoomCode;

            if (room.Players.Count >= room.MaxPlayers)
            {
                room.IsReady = true;
            }

            return (true, null, room);
        }
    }

    public GameRoom? GetRoom(string roomCode) =>
        _rooms.TryGetValue(roomCode.Trim().ToUpperInvariant(), out var room) ? room : null;

    public (GameRoom? Room, bool Removed) RemovePlayer(PlayerSession session)
    {
        if (string.IsNullOrEmpty(session.RoomCode)) return (null, false);
        if (!_rooms.TryGetValue(session.RoomCode, out var room)) return (null, false);

        bool removed;
        lock (room.SyncRoot)
        {
            removed = room.Players.TryRemove(session.PlayerId, out _);
            if (room.Players.IsEmpty)
            {
                _rooms.TryRemove(room.RoomCode, out _);
            }
            else if (room.Players.Count < room.MaxPlayers)
            {
                room.IsReady = false;
            }
        }
        return (room, removed);
    }

    private string GenerateUniqueCode()
    {
        Span<char> chars = stackalloc char[6];
        for (var attempt = 0; attempt < 32; attempt++)
        {
            for (var i = 0; i < 6; i++)
            {
                chars[i] = CodeAlphabet[RandomNumberGenerator.GetInt32(CodeAlphabet.Length)];
            }
            var code = new string(chars);
            if (!_rooms.ContainsKey(code)) return code;
        }
        return Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    }
}
