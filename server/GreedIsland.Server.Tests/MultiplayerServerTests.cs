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

        // Invalid room code rejected
        var pInvalid = sessions.CreateOrUpdateSession("conn-x", "NOPE");
        var badJoin = rooms.JoinRoom(pInvalid, "ZZZZZZ");
        Assert.False(badJoin.Success);

        // Second player joins & triggers shared Starting Plaza spawn
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

        // Rejoining with same PlayerId does not duplicate
        var rejoin = rooms.JoinRoom(p2, room.RoomCode);
        Assert.True(rejoin.Success);
        Assert.Equal(2, room.Players.Count);

        // Third player rejected when capacity is 2
        var p3 = sessions.CreateOrUpdateSession("conn-3", "GON");
        var join3 = rooms.JoinRoom(p3, room.RoomCode);
        Assert.False(join3.Success);
    }

    [Fact]
    public void GameStateManager_ValidatesMovement_AndRejectsInvalidCoordinates()
    {
        var sessions = new PlayerSessionManager();
        var rooms = new RoomManager();
        var state = new GameStateManager();

        var p1 = sessions.CreateOrUpdateSession("conn-1", "KAI");
        var room = rooms.CreateRoom(p1);

        var ok = state.TryApplyMovement(
            room,
            p1.PlayerId,
            new MovementInputDto { X = 1.5, Y = 2.06, Z = 3.0, Yaw = 0.5, LocomotionState = "Walk", HorizSpeed = 4.8 },
            out var snap
        );
        Assert.True(ok);
        Assert.NotNull(snap);
        Assert.Equal("Walk", snap!.LocomotionState);

        // Reject NaN, out-of-bounds, and teleport spikes
        Assert.False(state.TryApplyMovement(room, p1.PlayerId, new MovementInputDto { X = double.NaN, Y = 2, Z = 0 }, out _));
        Assert.False(state.TryApplyMovement(room, p1.PlayerId, new MovementInputDto { X = 300, Y = 2, Z = 0 }, out _));
        Assert.False(state.TryApplyMovement(room, p1.PlayerId, new MovementInputDto { X = 90, Y = 2, Z = 0 }, out _));
    }

    [Fact]
    public void RoomManager_RemovePlayer_CleansUpOnDisconnect()
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
