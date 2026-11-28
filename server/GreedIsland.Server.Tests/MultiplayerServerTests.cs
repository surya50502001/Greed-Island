using GreedIsland.Server.Models;
using GreedIsland.Server.Services;
using Xunit;

namespace GreedIsland.Server.Tests;

public sealed class MultiplayerServerTests
{
    [Theory]
    [InlineData(null, false)]
    [InlineData("", false)]
    [InlineData("   ", false)]
    [InlineData("AB", false)]
    [InlineData("NameThatIsWayTooLongForLimit", false)]
    [InlineData("<script>alert(1)</script>", false)]
    [InlineData("  KAI  ", true)]
    [InlineData("Itachi_01", true)]
    public void ValidateCharacterName_EnforcesRules(string? raw, bool expectedValid)
    {
        var (isValid, normalized, _) = PlayerSessionManager.ValidateCharacterName(raw);
        Assert.Equal(expectedValid, isValid);
        if (expectedValid)
        {
            Assert.Equal(raw!.Trim(), normalized);
        }
    }

    [Fact]
    public void RoomManager_CreatesUniqueRoom_JoinsTwoPlayersWithSharedPlazaSpawns_AndRejectsThird()
    {
        var sessions = new PlayerSessionManager();
        var rooms = new RoomManager();

        var p1 = sessions.CreateOrUpdateSession("conn-1", "KAI");
        var room = rooms.CreateRoom(p1);
        Assert.Equal(6, room.RoomCode.Length);
        Assert.False(room.IsReady);

        var pInvalid = sessions.CreateOrUpdateSession("conn-x", "NOPE");
        var badJoin = rooms.JoinRoom(pInvalid, "ZZZZZZ");
        Assert.False(badJoin.Success);

        var p2 = sessions.CreateOrUpdateSession("conn-2", "ITACHI");
        var join2 = rooms.JoinRoom(p2, room.RoomCode);
        Assert.True(join2.Success);
        Assert.True(room.IsReady);
        Assert.Equal(2, room.Players.Count);

        var s1 = room.Players[p1.PlayerId];
        var s2 = room.Players[p2.PlayerId];
        Assert.Equal(2.06, s1.Y, 2);
        Assert.Equal(2.06, s2.Y, 2);
        Assert.NotEqual(s1.X, s2.X);

        var rejoin = rooms.JoinRoom(p2, room.RoomCode);
        Assert.True(rejoin.Success);
        Assert.Equal(2, room.Players.Count);

        var p3 = sessions.CreateOrUpdateSession("conn-3", "GON");
        var join3 = rooms.JoinRoom(p3, room.RoomCode);
        Assert.False(join3.Success);
    }

    [Fact]
    public void Reconnect_RestoresRoomMembership_AndRemovesStaleConnection()
    {
        var sessions = new PlayerSessionManager();
        var rooms = new RoomManager();

        var p1 = sessions.CreateOrUpdateSession("conn-1", "KAI");
        var p2 = sessions.CreateOrUpdateSession("conn-2", "ITACHI");
        var room = rooms.CreateRoom(p1);
        rooms.JoinRoom(p2, room.RoomCode);

        // Simulate p2 disconnecting and reconnecting with a new ConnectionId
        var disconnected = sessions.RemoveByConnection("conn-2");
        Assert.NotNull(disconnected);
        rooms.RemovePlayer(disconnected!);
        Assert.Single(room.Players);

        var p2Reconnected = sessions.CreateOrUpdateSession("conn-2-new", "ITACHI", p2.PlayerId);
        Assert.Null(sessions.GetByConnection("conn-2"));
        var (ok, _, restoredRoom) = rooms.ReconnectPlayer(p2Reconnected, room.RoomCode);
        Assert.True(ok);
        Assert.NotNull(restoredRoom);
        Assert.Equal(2, restoredRoom!.Players.Count);
        Assert.True(restoredRoom.IsReady);

        // Reconnecting again with same PlayerId never duplicates
        var p2Again = sessions.CreateOrUpdateSession("conn-2-newer", "ITACHI", p2.PlayerId);
        Assert.Null(sessions.GetByConnection("conn-2-new"));
        rooms.ReconnectPlayer(p2Again, room.RoomCode);
        Assert.Equal(2, restoredRoom.Players.Count);
    }

    [Fact]
    public void GameStateManager_ValidatesMovement_RateLimits_AndRejectsInvalidStates()
    {
        var sessions = new PlayerSessionManager();
        var rooms = new RoomManager();
        var state = new GameStateManager();

        var p1 = sessions.CreateOrUpdateSession("conn-1", "KAI");
        var room = rooms.CreateRoom(p1);
        var t0 = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 100;

        // Normal Walk accepted
        Assert.True(state.TryApplyMovement(
            room,
            p1,
            new MovementInputDto { X = 1.5, Y = 2.06, Z = 3.0, Yaw = 0.5, LocomotionState = "Walk", HorizSpeed = 4.8 },
            t0,
            out var snap
        ));
        Assert.Equal("Walk", snap!.LocomotionState);

        // Rate limit: 10ms later (< 30ms) rejected
        Assert.False(state.TryApplyMovement(
            room,
            p1,
            new MovementInputDto { X = 1.6, Y = 2.06, Z = 3.1, Yaw = 0.5, LocomotionState = "Walk", HorizSpeed = 4.8 },
            t0 + 10,
            out _
        ));

        // 50ms later with Sprint & FlightForward accepted
        Assert.True(state.TryApplyMovement(
            room,
            p1,
            new MovementInputDto { X = 2.0, Y = 4.5, Z = 3.6, Yaw = 0.5, LocomotionState = "FlightForward", HorizSpeed = 13.5, IsFlying = true },
            t0 + 60,
            out _
        ));

        // Invalid locomotion state, negative speed, NaN, out-of-bounds, and teleport rejected
        Assert.False(state.TryApplyMovement(room, p1, new MovementInputDto { X = 2.1, Y = 4.5, Z = 3.6, LocomotionState = "InvalidState", HorizSpeed = 4 }, t0 + 120, out _));
        Assert.False(state.TryApplyMovement(room, p1, new MovementInputDto { X = 2.1, Y = 4.5, Z = 3.6, LocomotionState = "Walk", HorizSpeed = -2 }, t0 + 180, out _));
        Assert.False(state.TryApplyMovement(room, p1, new MovementInputDto { X = double.NaN, Y = 2, Z = 0, LocomotionState = "Idle" }, t0 + 240, out _));
        Assert.False(state.TryApplyMovement(room, p1, new MovementInputDto { X = 300, Y = 2, Z = 0, LocomotionState = "Idle" }, t0 + 300, out _));
        Assert.False(state.TryApplyMovement(room, p1, new MovementInputDto { X = 90, Y = 2, Z = 0, LocomotionState = "Idle" }, t0 + 360, out _));
    }

    [Fact]
    public void RoomManager_RemovePlayer_CleansUpEmptyRooms()
    {
        var sessions = new PlayerSessionManager();
        var rooms = new RoomManager();

        var p1 = sessions.CreateOrUpdateSession("conn-1", "KAI");
        var p2 = sessions.CreateOrUpdateSession("conn-2", "ITACHI");
        var room = rooms.CreateRoom(p1);
        rooms.JoinRoom(p2, room.RoomCode);

        var (updatedRoom, removed) = rooms.RemovePlayer(p2);
        Assert.True(removed);
        Assert.NotNull(updatedRoom);
        Assert.Single(updatedRoom!.Players);
        Assert.False(updatedRoom.IsReady);

        rooms.RemovePlayer(p1);
        Assert.Null(rooms.GetRoom(room.RoomCode));
    }
}
