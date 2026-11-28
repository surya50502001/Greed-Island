using System.Collections.Concurrent;
using System.Security.Cryptography;
using GreedIsland.Server.Models;

namespace GreedIsland.Server.Services;

/// <summary>
/// Server-authoritative manager for Spell Travel cards (Accompany, Magnetic Force, Return, Drift)
/// and Summon Random Weapon. Validates ownership/cooldowns, destinations, encounter history,
/// and travel party membership.
/// </summary>
public sealed class CardTravelManager(
    DestinationRegistry destinations,
    PlayerEncounterService encounters)
{
    public static readonly string[] RandomWeaponPool =
        ["Sword", "Greatsword", "Spear", "Axe", "Dagger", "Bow"];

    private static readonly Dictionary<string, int> CardCooldownMs = new(StringComparer.OrdinalIgnoreCase)
    {
        ["accompany"] = 18_000,
        ["magnetic_force"] = 14_000,
        ["return"] = 10_000,
        ["drift"] = 16_000,
        ["summon_weapon"] = 12_000,
    };

    private sealed class ActiveTravelRecord
    {
        public required SpellTravelEventDto Event { get; init; }
        public HashSet<string> ActiveParticipants { get; } = [];
    }

    private sealed class PendingInviteRecord
    {
        public required string InviteId { get; init; }
        public required string LeaderPlayerId { get; init; }
        public required string DestinationLabel { get; init; }
        public long ExpiresAtMs { get; init; }
        public HashSet<string> AcceptedPlayerIds { get; } = [];
    }

    private readonly ConcurrentDictionary<string, ActiveTravelRecord> _activeTravels = new();
    private readonly ConcurrentDictionary<string, string> _playerToEventId = new();
    private readonly ConcurrentDictionary<string, long> _cooldownsUntilMs = new();
    private readonly ConcurrentDictionary<string, PendingInviteRecord> _invites = new();
    private readonly object _sync = new();

    public bool IsPlayerTravelling(string playerId) => _playerToEventId.ContainsKey(playerId);

    public SpellTravelEventDto[] GetActiveTravels() =>
        _activeTravels.Values.Select(r => r.Event).ToArray();

    public AccompanyInviteDto? CreateAccompanyInvite(
        WorldManager world,
        string leaderPlayerId,
        string destinationLabel,
        long nowMs)
    {
        var leader = world.GetPlayer(leaderPlayerId);
        if (leader is null || !leader.IsAlive || IsPlayerTravelling(leaderPlayerId))
        {
            return null;
        }

        var inviteId = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant();
        var record = new PendingInviteRecord
        {
            InviteId = inviteId,
            LeaderPlayerId = leaderPlayerId,
            DestinationLabel = destinationLabel,
            ExpiresAtMs = nowMs + 20_000,
        };
        _invites[inviteId] = record;

        return new AccompanyInviteDto
        {
            InviteId = inviteId,
            LeaderPlayerId = leaderPlayerId,
            LeaderName = leader.CharacterName,
            DestinationLabel = destinationLabel,
            ExpiresAtMs = record.ExpiresAtMs,
        };
    }

    public (bool Accepted, string? LeaderPlayerId) RespondToAccompanyInvite(
        string inviteId,
        string responderPlayerId,
        bool accept,
        long nowMs)
    {
        if (!_invites.TryGetValue(inviteId, out var record) || nowMs > record.ExpiresAtMs)
        {
            return (false, null);
        }

        lock (_sync)
        {
            if (accept)
            {
                record.AcceptedPlayerIds.Add(responderPlayerId);
            }
            else
            {
                record.AcceptedPlayerIds.Remove(responderPlayerId);
            }
        }
        return (accept, record.LeaderPlayerId);
    }

    public SpellTravelResultDto TryStartTravel(
        WorldManager world,
        PlayerSession casterSession,
        SpellTravelRequestDto request,
        long nowMs)
    {
        var cardId = request.CardId.Trim().ToLowerInvariant();
        if (!CardCooldownMs.TryGetValue(cardId, out var cooldownMs) || cardId == "summon_weapon")
        {
            return new SpellTravelResultDto { Success = false, Error = "Unknown travel spell card." };
        }

        var caster = world.GetPlayer(casterSession.PlayerId);
        if (caster is null || !caster.IsAlive)
        {
            return new SpellTravelResultDto { Success = false, Error = "You cannot cast travel spells while defeated." };
        }

        lock (_sync)
        {
            if (IsPlayerTravelling(caster.PlayerId))
            {
                return new SpellTravelResultDto { Success = false, Error = "Already travelling through the sky." };
            }

            var cdKey = $"{caster.PlayerId}:{cardId}";
            if (_cooldownsUntilMs.TryGetValue(cdKey, out var untilMs) && untilMs > nowMs)
            {
                var secs = Math.Ceiling((untilMs - nowMs) / 1000.0);
                return new SpellTravelResultDto { Success = false, Error = $"Card on cooldown ({secs:0}s remaining)." };
            }

            // Resolve server-authoritative destination & participants
            double destX, destY, destZ;
            string destLabel;
            string? targetPlayerId = null;
            var participants = new List<string> { caster.PlayerId };

            if (cardId == "return")
            {
                var town = destinations.GetTownById(request.TargetId);
                if (town is null || !encounters.HasVisitedTown(caster.PlayerId, town.Id))
                {
                    return new SpellTravelResultDto { Success = false, Error = "Select a previously visited town." };
                }
                destX = town.X;
                destY = town.Y;
                destZ = town.Z;
                destLabel = town.Name;
            }
            else if (cardId == "drift")
            {
                var undiscovered = encounters.GetUndiscoveredTowns(caster.PlayerId);
                if (undiscovered.Length == 0)
                {
                    return new SpellTravelResultDto { Success = false, Error = "All island towns have already been discovered!" };
                }
                var chosen = undiscovered[RandomNumberGenerator.GetInt32(undiscovered.Length)];
                destX = chosen.X;
                destY = chosen.Y;
                destZ = chosen.Z;
                destLabel = chosen.Name;
            }
            else if (cardId == "magnetic_force")
            {
                if (string.IsNullOrWhiteSpace(request.TargetId) || request.TargetId == caster.PlayerId)
                {
                    return new SpellTravelResultDto { Success = false, Error = "Select a valid previously met player." };
                }
                if (!encounters.HasMetPlayer(caster.PlayerId, request.TargetId))
                {
                    return new SpellTravelResultDto { Success = false, Error = "You can only use Magnetic Force on players you have met." };
                }
                var target = world.GetPlayer(request.TargetId);
                if (target is null || !target.IsAlive)
                {
                    return new SpellTravelResultDto { Success = false, Error = "Target player is unavailable or defeated." };
                }
                destX = target.X + 2.2;
                destY = target.Y;
                destZ = target.Z + 1.4;
                destLabel = target.CharacterName;
                targetPlayerId = target.PlayerId;
            }
            else // accompany
            {
                if (string.Equals(request.DestinationType, "player", StringComparison.OrdinalIgnoreCase))
                {
                    if (string.IsNullOrWhiteSpace(request.TargetId) || !encounters.HasMetPlayer(caster.PlayerId, request.TargetId))
                    {
                        return new SpellTravelResultDto { Success = false, Error = "Select a previously met player." };
                    }
                    var target = world.GetPlayer(request.TargetId);
                    if (target is null || !target.IsAlive)
                    {
                        return new SpellTravelResultDto { Success = false, Error = "Target player is unavailable." };
                    }
                    destX = target.X + 2.2;
                    destY = target.Y;
                    destZ = target.Z + 1.4;
                    destLabel = target.CharacterName;
                    targetPlayerId = target.PlayerId;
                }
                else
                {
                    var town = destinations.GetTownById(request.TargetId);
                    if (town is null || !encounters.HasVisitedTown(caster.PlayerId, town.Id))
                    {
                        return new SpellTravelResultDto { Success = false, Error = "Select a previously visited town." };
                    }
                    destX = town.X;
                    destY = town.Y;
                    destZ = town.Z;
                    destLabel = town.Name;
                }

                // Only include companions who actually accepted a valid invite from this leader
                var acceptedByInvite = _invites.Values
                    .Where(inv => inv.LeaderPlayerId == caster.PlayerId && inv.ExpiresAtMs >= nowMs)
                    .SelectMany(inv => inv.AcceptedPlayerIds)
                    .ToHashSet(StringComparer.Ordinal);

                foreach (var compId in request.CompanionPlayerIds.Distinct())
                {
                    if (compId == caster.PlayerId) continue;
                    if (!acceptedByInvite.Contains(compId)) continue;
                    var comp = world.GetPlayer(compId);
                    if (comp is not null && comp.IsAlive && !IsPlayerTravelling(compId))
                    {
                        participants.Add(compId);
                    }
                }
            }

            var dist = Math.Sqrt((destX - caster.X) * (destX - caster.X) + (destZ - caster.Z) * (destZ - caster.Z));
            const int launchMs = 1100;
            const int descendMs = 1100;
            var flightMs = cardId == "drift"
                ? Math.Clamp((int)(2400 + dist * 22), 2600, 5600)
                : Math.Clamp((int)(1800 + dist * 16), 2000, 4400);
            var totalMs = launchMs + flightMs + descendMs;

            var seed = RandomNumberGenerator.GetInt32(1000, 999999);
            var arcHeight = cardId == "drift"
                ? 28.0 + (seed % 10)
                : Math.Clamp(18.0 + dist * 0.14, 18.0, 34.0);
            var curveOffset = cardId == "drift"
                ? ((seed % 2 == 0 ? 1 : -1) * (16.0 + (seed % 9)))
                : ((seed % 2 == 0 ? 1 : -1) * Math.Clamp(dist * 0.12, 4.0, 14.0));

            var ev = new SpellTravelEventDto
            {
                EventId = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant(),
                CardId = cardId,
                CasterPlayerId = caster.PlayerId,
                ParticipantPlayerIds = participants.ToArray(),
                OriginX = caster.X,
                OriginY = caster.Y,
                OriginZ = caster.Z,
                DestinationX = destX,
                DestinationY = destY,
                DestinationZ = destZ,
                DestinationLabel = destLabel,
                TargetPlayerId = targetPlayerId,
                StartTimestampMs = nowMs,
                LaunchDurationMs = launchMs,
                FlightDurationMs = flightMs,
                DescendDurationMs = descendMs,
                TotalDurationMs = totalMs,
                PathSeed = seed,
                ArcHeight = arcHeight,
                CurveOffset = curveOffset,
            };

            var record = new ActiveTravelRecord { Event = ev };
            foreach (var pid in participants)
            {
                record.ActiveParticipants.Add(pid);
                _playerToEventId[pid] = ev.EventId;
            }
            _activeTravels[ev.EventId] = record;
            _cooldownsUntilMs[cdKey] = nowMs + cooldownMs;

            return new SpellTravelResultDto { Success = true, TravelEvent = ev };
        }
    }

    public PlayerSnapshot[] CompleteTravel(WorldManager world, string eventId)
    {
        if (!_activeTravels.TryRemove(eventId, out var record))
        {
            return [];
        }

        var arrived = new List<PlayerSnapshot>();
        var ev = record.Event;
        lock (_sync)
        {
            int idx = 0;
            foreach (var pid in record.ActiveParticipants)
            {
                _playerToEventId.TryRemove(pid, out _);
                var snap = world.GetPlayer(pid);
                if (snap is null || !snap.IsAlive) continue;

                // Small radial offset for group arrivals so teammates don't stack on exact same pixel
                var angle = idx * (Math.PI * 2.0 / Math.Max(1, record.ActiveParticipants.Count));
                var spread = record.ActiveParticipants.Count > 1 ? 1.5 : 0.0;
                snap.X = ev.DestinationX + Math.Cos(angle) * spread;
                snap.Y = ev.DestinationY;
                snap.Z = ev.DestinationZ + Math.Sin(angle) * spread;
                snap.LocomotionState = "Idle";
                snap.HorizSpeed = 0;
                snap.TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                encounters.UpdateProximity(world, snap);
                arrived.Add(snap);
                idx++;
            }
        }
        return arrived.ToArray();
    }

    public void RemoveDisconnectedPlayer(string playerId)
    {
        if (_playerToEventId.TryRemove(playerId, out var eventId) &&
            _activeTravels.TryGetValue(eventId, out var record))
        {
            lock (_sync)
            {
                record.ActiveParticipants.Remove(playerId);
                if (record.ActiveParticipants.Count == 0)
                {
                    _activeTravels.TryRemove(eventId, out _);
                }
            }
        }
    }

    public WeaponSummonResultDto TrySummonRandomWeapon(
        WorldManager world,
        PlayerSession session,
        long nowMs)
    {
        var snap = world.GetPlayer(session.PlayerId);
        if (snap is null || !snap.IsAlive)
        {
            return new WeaponSummonResultDto { Success = false, Error = "Cannot summon weapon while defeated." };
        }
        if (IsPlayerTravelling(session.PlayerId))
        {
            return new WeaponSummonResultDto { Success = false, Error = "Cannot summon weapon while travelling." };
        }

        lock (_sync)
        {
            var cdKey = $"{session.PlayerId}:summon_weapon";
            if (_cooldownsUntilMs.TryGetValue(cdKey, out var untilMs) && untilMs > nowMs)
            {
                var secs = Math.Ceiling((untilMs - nowMs) / 1000.0);
                return new WeaponSummonResultDto { Success = false, Error = $"Card on cooldown ({secs:0}s remaining)." };
            }

            var chosenWeapon = RandomWeaponPool[RandomNumberGenerator.GetInt32(RandomWeaponPool.Length)];
            snap.HasWeapon = true;
            snap.WeaponType = chosenWeapon;
            _cooldownsUntilMs[cdKey] = nowMs + CardCooldownMs["summon_weapon"];

            var ev = new WeaponSummonEventDto
            {
                EventId = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant(),
                PlayerId = session.PlayerId,
                WeaponType = chosenWeapon,
                StartTimestampMs = nowMs,
                DurationMs = 1500,
            };
            return new WeaponSummonResultDto { Success = true, SummonEvent = ev };
        }
    }
}
