using GreedIsland.Server.Models;
using GreedIsland.Server.Services;
using Xunit;

namespace GreedIsland.Server.Tests;

public class MultiplayerServerTests
{
    [Theory]
    [InlineData("Gon", true, "Gon")]
    [InlineData("  Killua_99  ", true, "Killua_99")]
    [InlineData("", false, "")]
    [InlineData("   ", false, "")]
    [InlineData("ab", false, "")]
    [InlineData("ThisNameIsTooLongForWorld", false, "")]
    [InlineData("<script>", false, "")]
    public void ValidateCharacterName_EnforcesRules(string raw, bool expectedValid, string expectedNormalized)
    {
        var (valid, normalized, _) = PlayerSessionManager.ValidateCharacterName(raw);
        Assert.Equal(expectedValid, valid);
        if (expectedValid)
        {
            Assert.Equal(expectedNormalized, normalized);
        }
    }

    [Fact]
    public void EnterWorld_AssignsDistinctStartingPlazaSpawns_WithoutRoomCode()
    {
        var sessions = new PlayerSessionManager();
        var world = new WorldManager();

        var s1 = sessions.CreateSession("conn-1", "Gon");
        var s2 = sessions.CreateSession("conn-2", "Killua");

        var p1 = world.EnterWorld(s1);
        var p2 = world.EnterWorld(s2);

        Assert.NotEqual(p1.PlayerId, p2.PlayerId);
        Assert.Equal(2.06, p1.Y, 2);
        Assert.Equal(2.06, p2.Y, 2);
        Assert.True(p1.X != p2.X || p1.Z != p2.Z);
        Assert.Equal(100, p1.CurrentHealth);
        Assert.True(p1.IsAlive);
        Assert.Equal(2, world.GetAllPlayers().Count());
    }

    [Fact]
    public void DisconnectAndRemove_RemovesPlayerFromSharedWorld()
    {
        var sessions = new PlayerSessionManager();
        var world = new WorldManager();

        var s1 = sessions.CreateSession("conn-1", "Gon");
        world.EnterWorld(s1);

        var removedSession = sessions.MarkDisconnected("conn-1");
        Assert.NotNull(removedSession);
        Assert.False(removedSession!.IsConnected);

        Assert.True(world.RemovePlayer(s1.PlayerId));
        Assert.Empty(world.GetAllPlayers());
    }

    [Fact]
    public void TryReconnectSession_RequiresMatchingReconnectToken()
    {
        var sessions = new PlayerSessionManager();
        var original = sessions.CreateSession("conn-1", "Hisoka");
        sessions.MarkDisconnected("conn-1");

        var failed = sessions.TryReconnectSession("conn-2", original.PlayerId, "wrong-token", "Hisoka");
        Assert.False(failed.Success);
        Assert.Null(failed.Session);

        var succeeded = sessions.TryReconnectSession("conn-2", original.PlayerId, original.ReconnectToken, "Hisoka");
        Assert.True(succeeded.Success);
        Assert.NotNull(succeeded.Session);
        Assert.Equal(original.PlayerId, succeeded.Session!.PlayerId);
        Assert.Equal("conn-2", succeeded.Session.ConnectionId);
        Assert.True(succeeded.Session.IsConnected);
    }

    [Fact]
    public void TryApplyMovement_RateLimits_RejectsInvalidStates_AndRejectsDeadPlayers()
    {
        var sessions = new PlayerSessionManager();
        var world = new WorldManager();
        var gameState = new GameStateManager();

        var s1 = sessions.CreateSession("conn-1", "Kurapika");
        var snap = world.EnterWorld(s1);

        // First valid movement succeeds
        var validMove = new MovementInputDto
        {
            X = 1.0,
            Y = 2.06,
            Z = 1.0,
            Yaw = 0.5,
            LocomotionState = "Jog",
            HorizSpeed = 7.5,
            HasWeapon = true,
            ComboStep = 99
        };
        Assert.True(gameState.TryApplyMovement(world, s1, validMove, 1000, out var updated));
        Assert.NotNull(updated);
        Assert.Equal(4, updated!.ComboStep); // Clamped to max 4

        // Rate-limited within 25ms
        Assert.False(gameState.TryApplyMovement(world, s1, validMove, 1010, out _));

        // Invalid locomotion state rejected
        var badState = new MovementInputDto
        {
            X = 1.5,
            Y = 2.06,
            Z = 1.5,
            LocomotionState = "TeleportHack",
            HorizSpeed = 5
        };
        Assert.False(gameState.TryApplyMovement(world, s1, badState, 1100, out _));

        // NaN coordinate rejected
        var nanMove = new MovementInputDto
        {
            X = double.NaN,
            Y = 2.06,
            Z = 1.5,
            LocomotionState = "Idle"
        };
        Assert.False(gameState.TryApplyMovement(world, s1, nanMove, 1200, out _));

        // Dead player movement rejected
        snap.IsAlive = false;
        Assert.False(gameState.TryApplyMovement(world, s1, validMove, 1300, out _));
    }

    [Fact]
    public void CombatManager_ResolvesServerAuthoritativePvpDamage_Death_AndRespawn()
    {
        var sessions = new PlayerSessionManager();
        var world = new WorldManager();
        var combat = new CombatManager();

        var attackerSession = sessions.CreateSession("conn-a", "Gon");
        var targetSession = sessions.CreateSession("conn-b", "Neferpitou");

        var attacker = world.EnterWorld(attackerSession);
        var target = world.EnterWorld(targetSession);

        // Position attacker at (0, 2.06, 0) facing +Z (Yaw = 0), target at (0, 2.06, 2.5)
        attacker.X = 0; attacker.Y = 2.06; attacker.Z = 0; attacker.Yaw = 0;
        target.X = 0; target.Y = 2.06; target.Z = 2.5;

        // Without weapon -> rejected
        attacker.HasWeapon = false;
        var noWeapon = combat.TryResolveAttack(world, attackerSession, new AttackRequestDto { TargetPlayerId = target.PlayerId, ComboStep = 1 }, 1000);
        Assert.False(noWeapon.Success);

        // Self-attack -> rejected
        attacker.HasWeapon = true;
        var selfAttack = combat.TryResolveAttack(world, attackerSession, new AttackRequestDto { TargetPlayerId = attacker.PlayerId, ComboStep = 1 }, 1000);
        Assert.False(selfAttack.Success);

        // Out of range -> rejected
        target.Z = 12.0;
        var outOfRange = combat.TryResolveAttack(world, attackerSession, new AttackRequestDto { TargetPlayerId = target.PlayerId, ComboStep = 1 }, 1000);
        Assert.False(outOfRange.Success);

        // Move back into range and hit with step 1 (22 dmg)
        target.Z = 2.5;
        var hit1 = combat.TryResolveAttack(world, attackerSession, new AttackRequestDto { TargetPlayerId = target.PlayerId, ComboStep = 1 }, 1000);
        Assert.True(hit1.Success);
        Assert.NotNull(hit1.Damaged);
        Assert.Equal(22, hit1.Damaged!.Damage);
        Assert.Equal(78, target.CurrentHealth);
        Assert.Null(hit1.Died);

        // Cooldown enforced (< 300ms)
        var tooFast = combat.TryResolveAttack(world, attackerSession, new AttackRequestDto { TargetPlayerId = target.PlayerId, ComboStep = 2 }, 1100);
        Assert.False(tooFast.Success);

        // Lethal finisher after reducing HP
        target.CurrentHealth = 30;
        var lethal = combat.TryResolveAttack(world, attackerSession, new AttackRequestDto { TargetPlayerId = target.PlayerId, ComboStep = 4 }, 1500);
        Assert.True(lethal.Success);
        Assert.NotNull(lethal.Damaged);
        Assert.Equal(0, lethal.Damaged!.CurrentHealth);
        Assert.False(target.IsAlive);
        Assert.NotNull(lethal.Died);
        Assert.Equal(attacker.PlayerId, lethal.Died!.KillerPlayerId);
        Assert.Equal(CombatManager.RespawnDelaySeconds, lethal.Died.RespawnDelaySeconds);

        // Dead player cannot attack
        var deadAttack = combat.TryResolveAttack(world, targetSession, new AttackRequestDto { TargetPlayerId = attacker.PlayerId, ComboStep = 1 }, 1800);
        Assert.False(deadAttack.Success);

        // Respawn restores full health and Starting Plaza Y
        var respawned = combat.RespawnPlayer(world, target.PlayerId);
        Assert.NotNull(respawned);
        Assert.True(respawned!.IsAlive);
        Assert.Equal(respawned.MaxHealth, respawned.CurrentHealth);
        Assert.Equal(2.06, respawned.Y, 2);
    }
}
