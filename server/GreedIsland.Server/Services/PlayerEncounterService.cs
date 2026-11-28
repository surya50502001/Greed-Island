using System.Collections.Concurrent;
using GreedIsland.Server.Models;

namespace GreedIsland.Server.Services;

/// <summary>
/// Tracks in-memory per-session exploration history (visited towns) and met players.
/// Note: Because no database is configured, this history is session-scoped in memory.
/// </summary>
public sealed class PlayerEncounterService(DestinationRegistry destinations)
{
    private const double EncounterProximityMeters = 22.0;

    private readonly ConcurrentDictionary<string, HashSet<string>> _visitedTowns = new();
    private readonly ConcurrentDictionary<string, HashSet<string>> _metPlayers = new();
    private readonly object _sync = new();

    public void InitializePlayer(string playerId)
    {
        lock (_sync)
        {
            var towns = _visitedTowns.GetOrAdd(playerId, _ => new HashSet<string>(StringComparer.OrdinalIgnoreCase));
            towns.Add(DestinationRegistry.StartingTownId);
            _metPlayers.GetOrAdd(playerId, _ => new HashSet<string>(StringComparer.Ordinal));
        }
    }

    public void RecordTownVisit(string playerId, string townId)
    {
        if (destinations.GetTownById(townId) is null) return;
        lock (_sync)
        {
            var towns = _visitedTowns.GetOrAdd(playerId, _ => new HashSet<string>(StringComparer.OrdinalIgnoreCase));
            towns.Add(townId);
        }
    }

    public void UpdateProximity(WorldManager world, PlayerSnapshot mover)
    {
        var nearbyTown = destinations.FindTownAtPosition(mover.X, mover.Z);
        if (nearbyTown is not null)
        {
            RecordTownVisit(mover.PlayerId, nearbyTown.Id);
        }

        foreach (var other in world.GetAllPlayers())
        {
            if (other.PlayerId == mover.PlayerId) continue;
            var dist = Math.Sqrt(
                (other.X - mover.X) * (other.X - mover.X) +
                (other.Z - mover.Z) * (other.Z - mover.Z)
            );
            if (dist <= EncounterProximityMeters)
            {
                RecordMutualEncounter(mover.PlayerId, other.PlayerId);
            }
        }
    }

    public void RecordMutualEncounter(string playerA, string playerB)
    {
        if (playerA == playerB) return;
        lock (_sync)
        {
            _metPlayers.GetOrAdd(playerA, _ => new HashSet<string>(StringComparer.Ordinal)).Add(playerB);
            _metPlayers.GetOrAdd(playerB, _ => new HashSet<string>(StringComparer.Ordinal)).Add(playerA);
        }
    }

    public bool HasVisitedTown(string playerId, string townId)
    {
        lock (_sync)
        {
            return _visitedTowns.TryGetValue(playerId, out var set) && set.Contains(townId);
        }
    }

    public bool HasMetPlayer(string playerId, string targetPlayerId)
    {
        lock (_sync)
        {
            return _metPlayers.TryGetValue(playerId, out var set) && set.Contains(targetPlayerId);
        }
    }

    public string[] GetVisitedTownIds(string playerId)
    {
        lock (_sync)
        {
            return _visitedTowns.TryGetValue(playerId, out var set)
                ? set.ToArray()
                : [DestinationRegistry.StartingTownId];
        }
    }

    public WorldTownDto[] GetUndiscoveredTowns(string playerId)
    {
        lock (_sync)
        {
            _visitedTowns.TryGetValue(playerId, out var visited);
            return destinations.GetAllTowns()
                .Where(t => visited is null || !visited.Contains(t.Id))
                .ToArray();
        }
    }

    public MetPlayerSummaryDto[] GetMetPlayers(string playerId, WorldManager world)
    {
        string[] metIds;
        lock (_sync)
        {
            metIds = _metPlayers.TryGetValue(playerId, out var set) ? set.ToArray() : [];
        }

        var list = new List<MetPlayerSummaryDto>();
        foreach (var id in metIds)
        {
            var online = world.GetPlayer(id);
            if (online is not null)
            {
                list.Add(new MetPlayerSummaryDto
                {
                    PlayerId = online.PlayerId,
                    CharacterName = online.CharacterName,
                    IsOnline = true,
                });
            }
        }
        return list.ToArray();
    }
}
