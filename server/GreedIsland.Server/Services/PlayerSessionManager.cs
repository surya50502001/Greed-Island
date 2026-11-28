using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using GreedIsland.Server.Models;

namespace GreedIsland.Server.Services;

public sealed partial class PlayerSessionManager
{
    private readonly ConcurrentDictionary<string, PlayerSession> _byConnection = new();

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

    public PlayerSession CreateOrUpdateSession(string connectionId, string characterName, string? existingPlayerId = null)
    {
        var playerId = !string.IsNullOrWhiteSpace(existingPlayerId)
            ? existingPlayerId
            : $"p_{Guid.NewGuid():N}"[..14];

        // Remove any stale connection entries belonging to the same PlayerId
        foreach (var kvp in _byConnection)
        {
            if (kvp.Value.PlayerId == playerId && kvp.Key != connectionId)
            {
                _byConnection.TryRemove(kvp.Key, out _);
            }
        }

        var session = new PlayerSession
        {
            PlayerId = playerId,
            ConnectionId = connectionId,
            CharacterName = characterName,
        };
        _byConnection[connectionId] = session;
        return session;
    }

    public PlayerSession? GetByConnection(string connectionId) =>
        _byConnection.TryGetValue(connectionId, out var session) ? session : null;

    public PlayerSession? RemoveByConnection(string connectionId) =>
        _byConnection.TryRemove(connectionId, out var session) ? session : null;
}
