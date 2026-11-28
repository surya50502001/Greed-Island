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
    public async Task<RoomActionResult> CreateRoom(string characterName)
    {
        var (isValid, normalizedName, error) = PlayerSessionManager.ValidateCharacterName(characterName);
        if (!isValid)
        {
            return new RoomActionResult { Success = false, Error = error };
        }

        var existing = sessions.RemoveByConnection(Context.ConnectionId);
        if (existing is not null)
        {
            rooms.RemovePlayer(existing);
        }

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

        var existing = sessions.RemoveByConnection(Context.ConnectionId);
        if (existing is not null)
        {
            rooms.RemovePlayer(existing);
        }

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

    public async Task SendMovement(MovementInputDto input)
    {
        var session = sessions.GetByConnection(Context.ConnectionId);
        if (session is null || string.IsNullOrEmpty(session.RoomCode)) return;

        var room = rooms.GetRoom(session.RoomCode);
        if (room is null || !room.IsReady) return;

        if (gameState.TryApplyMovement(room, session.PlayerId, input, out var snapshot) && snapshot is not null)
        {
            await Clients.OthersInGroup(room.RoomCode).SendAsync("PlayerMoved", snapshot);
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var session = sessions.RemoveByConnection(Context.ConnectionId);
        if (session is not null)
        {
            var (room, removed) = rooms.RemovePlayer(session);
            if (removed && room is not null)
            {
                await Clients.Group(room.RoomCode).SendAsync("PlayerLeft", new
                {
                    playerId = session.PlayerId,
                    players = room.Players.Values.ToArray(),
                });
            }
        }
        await base.OnDisconnectedAsync(exception);
    }
}
