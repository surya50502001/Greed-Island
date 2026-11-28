using GreedIsland.Server.Models;
using GreedIsland.Server.Services;
using Microsoft.AspNetCore.SignalR;

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
    IHubContext<GameHub> hubContext) : Hub
{
    public async Task<WorldEnterResult> EnterWorld(string characterName)
    {
        var (isValid, normalizedName, error) = PlayerSessionManager.ValidateCharacterName(characterName);
        if (!isValid)
        {
            return new WorldEnterResult { Success = false, Error = error };
        }

        // Clean up any prior session on this connection
        var prior = sessions.MarkDisconnected(Context.ConnectionId);
        if (prior is not null)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, WorldManager.MainWorldGroup);
            if (world.RemovePlayer(prior.PlayerId))
            {
                await Clients.Group(WorldManager.MainWorldGroup).SendAsync("PlayerLeft", new
                {
                    playerId = prior.PlayerId,
                    players = world.GetAllPlayers(),
                });
            }
        }

        var session = sessions.CreateSession(Context.ConnectionId, normalizedName);
        var selfSnapshot = world.EnterWorld(session);

        await Groups.AddToGroupAsync(Context.ConnectionId, WorldManager.MainWorldGroup);
        await Clients.OthersInGroup(WorldManager.MainWorldGroup).SendAsync("PlayerJoined", selfSnapshot);

        return new WorldEnterResult
        {
            Success = true,
            PlayerId = session.PlayerId,
            ReconnectToken = session.ReconnectToken,
            CharacterName = session.CharacterName,
            Players = world.GetAllPlayers(),
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
            return new WorldEnterResult { Success = false, Error = error ?? "Reconnect failed." };
        }

        var selfSnapshot = world.EnterWorld(session);
        await Groups.AddToGroupAsync(Context.ConnectionId, WorldManager.MainWorldGroup);
        await Clients.OthersInGroup(WorldManager.MainWorldGroup).SendAsync("PlayerJoined", selfSnapshot);

        return new WorldEnterResult
        {
            Success = true,
            PlayerId = session.PlayerId,
            ReconnectToken = session.ReconnectToken,
            CharacterName = session.CharacterName,
            Players = world.GetAllPlayers(),
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
                await Clients.Group(WorldManager.MainWorldGroup).SendAsync("PlayerLeft", new
                {
                    playerId = session.PlayerId,
                    players = world.GetAllPlayers(),
                });
            }
        }
        await base.OnDisconnectedAsync(exception);
    }
}
