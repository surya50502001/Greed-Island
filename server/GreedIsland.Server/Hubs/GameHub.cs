using GreedIsland.Server.Models;
using GreedIsland.Server.Services;
using Microsoft.AspNetCore.SignalR;

namespace GreedIsland.Server.Hubs;

public sealed class RoomActionResult
{
    public bool Success { get; init; }
    public string? Error { get; init; }
    public string? RoomCode { get; init; }
    public string? PlayerId { get; init; }
    public string? CharacterName { get; init; }
    public bool IsReady { get; init; }
    public PlayerSnapshot[] Players { get; init; } = [];
}

public sealed class GameHub(
    PlayerSessionManager sessions,
    RoomManager rooms,
    GameStateManager gameState) : Hub
{
    private async Task DetachExistingSessionAsync()
    {
        var existing = sessions.RemoveByConnection(Context.ConnectionId);
        if (existing is null) return;

        if (!string.IsNullOrEmpty(existing.RoomCode))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, existing.RoomCode);
            var (oldRoom, removed) = rooms.RemovePlayer(existing);
            if (removed && oldRoom is not null)
            {
                await Clients.Group(oldRoom.RoomCode).SendAsync("PlayerLeft", new
                {
                    playerId = existing.PlayerId,
                    players = oldRoom.Players.Values.ToArray(),
                });
            }
        }
    }

    public async Task<RoomActionResult> CreateRoom(string characterName)
    {
        var (isValid, normalizedName, error) = PlayerSessionManager.ValidateCharacterName(characterName);
        if (!isValid)
        {
            return new RoomActionResult { Success = false, Error = error };
        }

        await DetachExistingSessionAsync();

        var session = sessions.CreateOrUpdateSession(Context.ConnectionId, normalizedName);
        var room = rooms.CreateRoom(session);

        await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomCode);

        return new RoomActionResult
        {
            Success = true,
            RoomCode = room.RoomCode,
            PlayerId = session.PlayerId,
            CharacterName = session.CharacterName,
            IsReady = room.IsReady,
            Players = room.Players.Values.ToArray(),
        };
    }

    public async Task<RoomActionResult> JoinRoom(string characterName, string roomCode)
    {
        var (isValid, normalizedName, error) = PlayerSessionManager.ValidateCharacterName(characterName);
        if (!isValid)
        {
            return new RoomActionResult { Success = false, Error = error };
        }

        await DetachExistingSessionAsync();

        var session = sessions.CreateOrUpdateSession(Context.ConnectionId, normalizedName);
        var (joined, joinError, room) = rooms.JoinRoom(session, roomCode);
        if (!joined || room is null)
        {
            sessions.RemoveByConnection(Context.ConnectionId);
            return new RoomActionResult { Success = false, Error = joinError };
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomCode);

        var players = room.Players.Values.ToArray();
        await Clients.Group(room.RoomCode).SendAsync("RoomUpdated", new
        {
            roomCode = room.RoomCode,
            isReady = room.IsReady,
            players,
        });

        if (room.IsReady)
        {
            await Clients.Group(room.RoomCode).SendAsync("WorldReady", new
            {
                roomCode = room.RoomCode,
                players,
            });
        }

        return new RoomActionResult
        {
            Success = true,
            RoomCode = room.RoomCode,
            PlayerId = session.PlayerId,
            CharacterName = session.CharacterName,
            IsReady = room.IsReady,
            Players = players,
        };
    }

    public async Task<RoomActionResult> ReconnectToRoom(
        string playerId,
        string characterName,
        string roomCode)
    {
        var (isValid, normalizedName, error) = PlayerSessionManager.ValidateCharacterName(characterName);
        if (!isValid || string.IsNullOrWhiteSpace(playerId))
        {
            return new RoomActionResult { Success = false, Error = error ?? "Invalid session." };
        }

        await DetachExistingSessionAsync();

        var session = sessions.CreateOrUpdateSession(Context.ConnectionId, normalizedName, playerId);
        var (ok, recError, room) = rooms.ReconnectPlayer(session, roomCode);
        if (!ok || room is null)
        {
            sessions.RemoveByConnection(Context.ConnectionId);
            return new RoomActionResult { Success = false, Error = recError };
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomCode);

        var players = room.Players.Values.ToArray();
        await Clients.OthersInGroup(room.RoomCode).SendAsync("RoomUpdated", new
        {
            roomCode = room.RoomCode,
            isReady = room.IsReady,
            players,
        });

        return new RoomActionResult
        {
            Success = true,
            RoomCode = room.RoomCode,
            PlayerId = session.PlayerId,
            CharacterName = session.CharacterName,
            IsReady = room.IsReady,
            Players = players,
        };
    }

    public async Task LeaveRoom()
    {
        await DetachExistingSessionAsync();
    }

    public async Task SendMovement(MovementInputDto input)
    {
        var session = sessions.GetByConnection(Context.ConnectionId);
        if (session is null || string.IsNullOrEmpty(session.RoomCode)) return;

        var room = rooms.GetRoom(session.RoomCode);
        if (room is null || !room.IsReady) return;

        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        if (gameState.TryApplyMovement(room, session, input, nowMs, out var snapshot) && snapshot is not null)
        {
            await Clients.OthersInGroup(room.RoomCode).SendAsync("PlayerMoved", snapshot);
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await DetachExistingSessionAsync();
        await base.OnDisconnectedAsync(exception);
    }
}
