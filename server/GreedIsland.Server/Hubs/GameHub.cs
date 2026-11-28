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
        var (selfSnapshot, allPlayers) = world.EnterWorldAndSnapshot(session);

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
        if (session is null) return;

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (gameState.TryApplyMovement(world, session, input, nowMs, out var snapshot) && snapshot is not null)
        {
            await Clients.OthersInGroup(WorldManager.MainWorldGroup).SendAsync("PlayerMoved", snapshot);
        }
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
