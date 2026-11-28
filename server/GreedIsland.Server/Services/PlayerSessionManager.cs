using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using GreedIsland.Server.Models;

namespace GreedIsland.Server.Services;

public sealed partial class PlayerSessionManager
{
    private readonly ConcurrentDictionary<string, PlayerSession> _byConnection = new();
    private readonly ConcurrentDictionary<string, PlayerSession> _byPlayerId = new();

    [GeneratedRegex("^[A-Za-z0-9 _-]+$")]
    private static partial Regex ValidNameRegex();

    public static (bool IsValid, string NormalizedName, string? Error) ValidateCharacterName(string? rawName)
    {
        if (string.IsNullOrWhiteSpace(rawName))
        {
            return (false, string.Empty, "Character name is required.");
        }

        var trimmed = rawName.Trim();
        if (trimmed.Length < 3 || trimmed.Length > 16)
        {
            return (false, string.Empty, "Character name must be 3 to 16 characters.");
        }

        if (!ValidNameRegex().IsMatch(trimmed))
        {
            return (false, string.Empty, "Use only letters, numbers, spaces, '-' or '_'.");
        }

        return (true, trimmed, null);
    }

    public PlayerSession CreateSession(string connectionId, string characterName)
    {
        var tokenBytes = RandomNumberGenerator.GetBytes(24);
        var session = new PlayerSession
        {
            PlayerId = $"p_{Guid.NewGuid():N}"[..14],
            ReconnectToken = Convert.ToBase64String(tokenBytes),
            ConnectionId = connectionId,
            CharacterName = characterName,
            IsConnected = true,
        };

        _byConnection[connectionId] = session;
        _byPlayerId[session.PlayerId] = session;
        return session;
    }

    public (bool Success, PlayerSession? Session, string? Error) TryReconnectSession(
        string connectionId,
        string? playerId,
        string? reconnectToken,
        string characterName)
    {
        if (string.IsNullOrWhiteSpace(playerId) || string.IsNullOrWhiteSpace(reconnectToken))
        {
            return (false, null, "Missing reconnect credentials.");
        }

        if (!_byPlayerId.TryGetValue(playerId, out var existing))
        {
            return (false, null, "Session expired or not found.");
        }

        var expectedBytes = Encoding.UTF8.GetBytes(existing.ReconnectToken);
        var providedBytes = Encoding.UTF8.GetBytes(reconnectToken);
        if (expectedBytes.Length != providedBytes.Length ||
            !CryptographicOperations.FixedTimeEquals(expectedBytes, providedBytes))
        {
            return (false, null, "Invalid reconnect credential.");
        }

        if (!string.IsNullOrEmpty(existing.ConnectionId) && existing.ConnectionId != connectionId)
        {
            _byConnection.TryRemove(existing.ConnectionId, out _);
        }

        existing.ConnectionId = connectionId;
        existing.IsConnected = true;
        _byConnection[connectionId] = existing;
        return (true, existing, null);
    }

    public PlayerSession? GetByConnection(string connectionId) =>
        _byConnection.TryGetValue(connectionId, out var session) ? session : null;

    public PlayerSession? GetByPlayerId(string playerId) =>
        _byPlayerId.TryGetValue(playerId, out var session) ? session : null;

    public PlayerSession? MarkDisconnected(string connectionId)
    {
        if (!_byConnection.TryRemove(connectionId, out var session))
        {
            return null;
        }
        session.IsConnected = false;
        return session;
    }
}
