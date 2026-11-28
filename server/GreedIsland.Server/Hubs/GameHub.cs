using GreedIsland.Server.Models;
using GreedIsland.Server.Services;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;

namespace GreedIsland.Server.Hubs;

public sealed class WorldEnterResult
{
    public bool Success { get; init; }
    public string? Error { get; init; }
    public string? PlayerId { get; init; }
    public string? ReconnectToken { get; init; }
    public string? CharacterName { get; init; }
    public PlayerSnapshot[] Players { get; init; } = [];
}

public sealed class GameHub(
    PlayerSessionManager sessions,
    WorldManager world,
    GameStateManager gameState,
    CombatManager combat,
    DestinationRegistry destinations,
    PlayerEncounterService encounters,
    CardTravelManager cardTravel,
    IHubContext<GameHub> hubContext,
    ILogger<GameHub> logger) : Hub
{
    public async Task<WorldEnterResult> EnterWorld(string characterName)
    {
        var (isValid, normalizedName, error) = PlayerSessionManager.ValidateCharacterName(characterName);
        if (!isValid)
        {
            logger.LogWarning(
                "EnterWorld rejected for ConnectionId={ConnectionId}: {Error}",
                Context.ConnectionId,
                error
            );
            return new WorldEnterResult { Success = false, Error = error };
        }

        // Clean up any prior session on this connection before re-subscribing
        var prior = sessions.MarkDisconnected(Context.ConnectionId);
        if (prior is not null)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, WorldManager.MainWorldGroup);
            if (world.RemovePlayer(prior.PlayerId))
            {
                logger.LogInformation(
                    "Cleaned up prior session PlayerId={PlayerId} Name={CharacterName} ConnectionId={ConnectionId}; RemainingPlayers={Count}",
                    prior.PlayerId,
                    prior.CharacterName,
                    Context.ConnectionId,
                    world.GetAllPlayers().Length
                );
                await Clients.Group(WorldManager.MainWorldGroup).SendAsync("PlayerLeft", new
                {
                    playerId = prior.PlayerId,
                    players = world.GetAllPlayers(),
                });
            }
        }

        // CRITICAL: Subscribe to the shared world group BEFORE inserting into WorldManager
        // and capturing the world snapshot so concurrent joins cannot miss each other's PlayerJoined.
        await Groups.AddToGroupAsync(Context.ConnectionId, WorldManager.MainWorldGroup);

        var session = sessions.CreateSession(Context.ConnectionId, normalizedName);
        encounters.InitializePlayer(session.PlayerId);
        var (selfSnapshot, allPlayers) = world.EnterWorldAndSnapshot(session);
        encounters.UpdateProximity(world, selfSnapshot);

        logger.LogInformation(
            "Player entered shared world: PlayerId={PlayerId} Name={CharacterName} ConnectionId={ConnectionId} WorldPlayers={Count}",
            session.PlayerId,
            session.CharacterName,
            Context.ConnectionId,
            allPlayers.Length
        );

        await Clients.OthersInGroup(WorldManager.MainWorldGroup).SendAsync("PlayerJoined", selfSnapshot);

        return new WorldEnterResult
        {
            Success = true,
            PlayerId = session.PlayerId,
            ReconnectToken = session.ReconnectToken,
            CharacterName = session.CharacterName,
            Players = allPlayers,
        };
    }

    public async Task<WorldEnterResult> ReconnectWorld(
        string playerId,
        string reconnectToken,
        string characterName)
    {
        var (ok, session, error) = sessions.TryReconnectSession(
            Context.ConnectionId,
            playerId,
            reconnectToken,
            characterName
        );
        if (!ok || session is null)
        {
            logger.LogWarning(
                "ReconnectWorld failed for PlayerId={PlayerId} ConnectionId={ConnectionId}: {Error}",
                playerId,
                Context.ConnectionId,
                error
            );
            return new WorldEnterResult { Success = false, Error = error ?? "Reconnect failed." };
        }

        // Subscribe to shared world group before inserting/snapshotting
        await Groups.AddToGroupAsync(Context.ConnectionId, WorldManager.MainWorldGroup);
        var (selfSnapshot, allPlayers) = world.EnterWorldAndSnapshot(session);

        logger.LogInformation(
            "ReconnectWorld succeeded: PlayerId={PlayerId} Name={CharacterName} ConnectionId={ConnectionId} WorldPlayers={Count}",
            session.PlayerId,
            session.CharacterName,
            Context.ConnectionId,
            allPlayers.Length
        );

        await Clients.OthersInGroup(WorldManager.MainWorldGroup).SendAsync("PlayerJoined", selfSnapshot);

        return new WorldEnterResult
        {
            Success = true,
            PlayerId = session.PlayerId,
            ReconnectToken = session.ReconnectToken,
            CharacterName = session.CharacterName,
            Players = allPlayers,
        };
    }

    public async Task SendMovement(MovementInputDto input)
    {
        var session = sessions.GetByConnection(Context.ConnectionId);
        if (session is null || cardTravel.IsPlayerTravelling(session.PlayerId)) return;

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (gameState.TryApplyMovement(world, session, input, nowMs, out var snapshot) && snapshot is not null)
        {
            encounters.UpdateProximity(world, snapshot);
            await Clients.OthersInGroup(WorldManager.MainWorldGroup).SendAsync("PlayerMoved", snapshot);
        }
    }

    public SpellTravelContextDto GetSpellTravelContext()
    {
        var session = sessions.GetByConnection(Context.ConnectionId);
        if (session is null)
        {
            return new SpellTravelContextDto
            {
                VisitedTownIds = [DestinationRegistry.StartingTownId],
                MetPlayers = [],
                AllTowns = destinations.GetAllTowns(),
            };
        }

        return new SpellTravelContextDto
        {
            VisitedTownIds = encounters.GetVisitedTownIds(session.PlayerId),
            MetPlayers = encounters.GetMetPlayers(session.PlayerId, world),
            AllTowns = destinations.GetAllTowns(),
        };
    }

    public async Task<AccompanyInviteDto?> InviteToAccompany(string[] targetPlayerIds, string destinationLabel)
    {
        var session = sessions.GetByConnection(Context.ConnectionId);
        if (session is null) return null;

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var invite = cardTravel.CreateAccompanyInvite(world, session.PlayerId, destinationLabel, nowMs);
        if (invite is null) return null;

        foreach (var targetId in targetPlayerIds.Distinct())
        {
            if (targetId == session.PlayerId) continue;
            var targetSession = sessions.GetByPlayerId(targetId);
            if (targetSession is not null && targetSession.IsConnected)
            {
                await Clients.Client(targetSession.ConnectionId).SendAsync("AccompanyInviteReceived", invite);
            }
        }
        return invite;
    }

    public async Task RespondAccompanyInvite(string inviteId, bool accept)
    {
        var session = sessions.GetByConnection(Context.ConnectionId);
        if (session is null) return;

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var (accepted, leaderId) = cardTravel.RespondToAccompanyInvite(inviteId, session.PlayerId, accept, nowMs);
        if (leaderId is null) return;

        var leaderSession = sessions.GetByPlayerId(leaderId);
        if (leaderSession is not null && leaderSession.IsConnected)
        {
            await Clients.Client(leaderSession.ConnectionId).SendAsync("AccompanyInviteResponded", new
            {
                inviteId,
                playerId = session.PlayerId,
                characterName = session.CharacterName,
                accepted,
            });
        }
    }

    public async Task<SpellTravelResultDto> ActivateSpellTravel(SpellTravelRequestDto request)
    {
        var session = sessions.GetByConnection(Context.ConnectionId);
        if (session is null)
        {
            return new SpellTravelResultDto { Success = false, Error = "Not connected to world." };
        }

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var result = cardTravel.TryStartTravel(world, session, request, nowMs);
        if (!result.Success || result.TravelEvent is null)
        {
            logger.LogWarning(
                "SpellTravel rejected: Card={CardId} PlayerId={PlayerId} Error={Error}",
                request.CardId,
                session.PlayerId,
                result.Error
            );
            return result;
        }

        var ev = result.TravelEvent;
        logger.LogInformation(
            "SpellTravelStarted: EventId={EventId} Card={CardId} Caster={PlayerId} Participants={Count} Dest={Dest}",
            ev.EventId,
            ev.CardId,
            ev.CasterPlayerId,
            ev.ParticipantPlayerIds.Length,
            ev.DestinationLabel
        );

        await Clients.Group(WorldManager.MainWorldGroup).SendAsync("SpellTravelStarted", ev);

        _ = Task.Run(async () =>
        {
            await Task.Delay(ev.TotalDurationMs);
            var arrived = cardTravel.CompleteTravel(world, ev.EventId);
            if (arrived.Length > 0)
            {
                await hubContext.Clients.Group(WorldManager.MainWorldGroup)
                    .SendAsync("SpellTravelCompleted", new
                    {
                        eventId = ev.EventId,
                        players = arrived,
                    });
            }
        });

        return result;
    }

    public async Task<WeaponSummonResultDto> ActivateSummonRandomWeapon()
    {
        var session = sessions.GetByConnection(Context.ConnectionId);
        if (session is null)
        {
            return new WeaponSummonResultDto { Success = false, Error = "Not connected to world." };
        }

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var result = cardTravel.TrySummonRandomWeapon(world, session, nowMs);
        if (!result.Success || result.SummonEvent is null)
        {
            return result;
        }

        logger.LogInformation(
            "WeaponSummonStarted: EventId={EventId} PlayerId={PlayerId} Weapon={WeaponType}",
            result.SummonEvent.EventId,
            session.PlayerId,
            result.SummonEvent.WeaponType
        );

        await Clients.Group(WorldManager.MainWorldGroup).SendAsync("WeaponSummonStarted", result.SummonEvent);
        return result;
    }

    public async Task RequestAttack(AttackRequestDto input)
    {
        var session = sessions.GetByConnection(Context.ConnectionId);
        if (session is null) return;

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var resolution = combat.TryResolveAttack(world, session, input, nowMs);
        if (!resolution.Success || resolution.Damaged is null) return;

        await Clients.Group(WorldManager.MainWorldGroup).SendAsync("PlayerAttacked", new PlayerAttackedDto
        {
            AttackerPlayerId = session.PlayerId,
            TargetPlayerId = input.TargetPlayerId,
            ComboStep = input.ComboStep,
        });

        await Clients.Group(WorldManager.MainWorldGroup).SendAsync("PlayerDamaged", resolution.Damaged);

        if (resolution.Died is not null)
        {
            await Clients.Group(WorldManager.MainWorldGroup).SendAsync("PlayerDied", resolution.Died);

            var targetId = resolution.Died.PlayerId;
            _ = Task.Run(async () =>
            {
                await Task.Delay(TimeSpan.FromSeconds(CombatManager.RespawnDelaySeconds));
                var respawned = combat.RespawnPlayer(world, targetId);
                if (respawned is not null)
                {
                    await hubContext.Clients.Group(WorldManager.MainWorldGroup)
                        .SendAsync("PlayerRespawned", new PlayerRespawnedDto { Player = respawned });
                }
            });
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var session = sessions.MarkDisconnected(Context.ConnectionId);
        if (session is not null)
        {
            cardTravel.RemoveDisconnectedPlayer(session.PlayerId);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, WorldManager.MainWorldGroup);
            if (world.RemovePlayer(session.PlayerId))
            {
                var remaining = world.GetAllPlayers();
                logger.LogInformation(
                    "Player left shared world: PlayerId={PlayerId} Name={CharacterName} ConnectionId={ConnectionId} RemainingPlayers={Count}",
                    session.PlayerId,
                    session.CharacterName,
                    Context.ConnectionId,
                    remaining.Length
                );
                await Clients.Group(WorldManager.MainWorldGroup).SendAsync("PlayerLeft", new
                {
                    playerId = session.PlayerId,
                    players = remaining,
                });
            }
        }
        await base.OnDisconnectedAsync(exception);
    }
}
