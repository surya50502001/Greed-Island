using System.Collections.Concurrent;
using System.Security.Claims;
using GreedIsland.Server.Hubs;
using GreedIsland.Server.Models;
using GreedIsland.Server.Services;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging.Abstractions;
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

    [Fact]
    public async Task SharedWorld_KaiThenItachi_BothSeeEachOther()
    {
        var harness = new HubTestHarness();
        var kai = await harness.EnterAsync("conn-kai", "KAI");
        var itachi = await harness.EnterAsync("conn-itachi", "itachi");

        Assert.True(kai.Result.Success);
        Assert.True(itachi.Result.Success);
        Assert.Contains(itachi.Result.Players, p => p.CharacterName == "KAI");
        Assert.Contains(itachi.Result.Players, p => p.CharacterName == "itachi");

        var kaiEvents = harness.GetEvents("conn-kai", "PlayerJoined");
        Assert.Single(kaiEvents);
        var joined = Assert.IsType<PlayerSnapshot>(kaiEvents[0]);
        Assert.Equal("itachi", joined.CharacterName);
    }

    [Fact]
    public async Task SharedWorld_ItachiThenKai_BothSeeEachOther()
    {
        var harness = new HubTestHarness();
        var itachi = await harness.EnterAsync("conn-itachi", "itachi");
        var kai = await harness.EnterAsync("conn-kai", "KAI");

        Assert.True(itachi.Result.Success);
        Assert.True(kai.Result.Success);
        Assert.Equal(2, kai.Result.Players.Length);
        Assert.Contains(kai.Result.Players, p => p.CharacterName == "itachi");
        Assert.Contains(kai.Result.Players, p => p.CharacterName == "KAI");

        var itachiEvents = harness.GetEvents("conn-itachi", "PlayerJoined");
        Assert.Single(itachiEvents);
        Assert.Equal("KAI", Assert.IsType<PlayerSnapshot>(itachiEvents[0]).CharacterName);
    }

    [Fact]
    public async Task SharedWorld_SimultaneousJoins_BothSeeEachOtherWithoutMissingEvents()
    {
        var harness = new HubTestHarness();
        var tasks = await Task.WhenAll(
            harness.EnterAsync("conn-1", "KAI"),
            harness.EnterAsync("conn-2", "itachi")
        );

        var r1 = tasks[0].Result;
        var r2 = tasks[1].Result;
        Assert.True(r1.Success);
        Assert.True(r2.Success);

        // Each client's visible world = initial Players U PlayerJoined events received
        var kaiSeen = r1.Players
            .Concat(harness.GetEvents("conn-1", "PlayerJoined").Cast<PlayerSnapshot>())
            .Select(p => p.PlayerId)
            .ToHashSet();
        var itachiSeen = r2.Players
            .Concat(harness.GetEvents("conn-2", "PlayerJoined").Cast<PlayerSnapshot>())
            .Select(p => p.PlayerId)
            .ToHashSet();

        Assert.Contains(r2.PlayerId!, kaiSeen);
        Assert.Contains(r1.PlayerId!, itachiSeen);
        // Neither receives their own PlayerJoined broadcast
        Assert.DoesNotContain(
            harness.GetEvents("conn-1", "PlayerJoined").Cast<PlayerSnapshot>(),
            p => p.PlayerId == r1.PlayerId
        );
    }

    [Fact]
    public async Task SharedWorld_ThreeOrMorePlayers_DifferentNames_ShareOneWorldAndHandleLeaveAndReconnect()
    {
        var harness = new HubTestHarness();
        var p1 = await harness.EnterAsync("c1", "KAI");
        var p2 = await harness.EnterAsync("c2", "itachi");
        var p3 = await harness.EnterAsync("c3", "Gon");

        Assert.Equal(3, p3.Result.Players.Length);
        Assert.Equal(2, harness.GetEvents("c1", "PlayerJoined").Count);
        Assert.Single(harness.GetEvents("c2", "PlayerJoined"));

        // Disconnect p2 -> remaining players receive PlayerLeft
        await harness.DisconnectAsync("c2");
        Assert.Single(harness.GetEvents("c1", "PlayerLeft"));
        Assert.Single(harness.GetEvents("c3", "PlayerLeft"));
        Assert.Equal(2, harness.World.GetAllPlayers().Length);

        // Reconnect p2 on new connection -> restored without duplicate
        var recon = await harness.ReconnectAsync("c2-re", p2.Result.PlayerId!, p2.Result.ReconnectToken!, "itachi");
        Assert.True(recon.Success);
        Assert.Equal(3, recon.Players.Length);
        Assert.Equal(1, recon.Players.Count(p => p.PlayerId == p2.Result.PlayerId));
    }

    [Fact]
    public async Task SpellCards_Return_Drift_MagneticForce_Accompany_And_SummonWeapon_AreServerAuthoritative()
    {
        var harness = new HubTestHarness();
        var kai = await harness.EnterAsync("c-kai", "KAI");
        var itachi = await harness.EnterAsync("c-itachi", "itachi");

        // Both spawned at Starting Plaza within proximity -> met each other & visited starting_plaza
        var kaiSnap = harness.World.GetPlayer(kai.Result.PlayerId!)!;
        var itachiSnap = harness.World.GetPlayer(itachi.Result.PlayerId!)!;
        var kaiSession = harness.Sessions.GetByConnection("c-kai")!;
        var itachiSession = harness.Sessions.GetByConnection("c-itachi")!;

        // 1. Return to unvisited town rejected; Return to starting_plaza succeeds
        var badReturn = harness.CardTravel.TryStartTravel(
            harness.World,
            kaiSession,
            new SpellTravelRequestDto { CardId = "return", TargetId = "crystal_peak" },
            1000
        );
        Assert.False(badReturn.Success);

        var okReturn = harness.CardTravel.TryStartTravel(
            harness.World,
            kaiSession,
            new SpellTravelRequestDto { CardId = "return", TargetId = "starting_plaza" },
            1000
        );
        Assert.True(okReturn.Success);
        harness.CardTravel.CompleteTravel(harness.World, okReturn.TravelEvent!.EventId);

        // 2. Drift picks an undiscovered town on the server (never starting_plaza)
        var drift = harness.CardTravel.TryStartTravel(
            harness.World,
            kaiSession,
            new SpellTravelRequestDto { CardId = "drift" },
            20_000
        );
        Assert.True(drift.Success);
        Assert.NotEqual("Starting Plaza", drift.TravelEvent!.DestinationLabel);
        harness.CardTravel.CompleteTravel(harness.World, drift.TravelEvent.EventId);

        // 3. Magnetic Force flies to met player's location without moving target
        var prevItachiX = itachiSnap.X;
        var prevItachiZ = itachiSnap.Z;
        var mag = harness.CardTravel.TryStartTravel(
            harness.World,
            kaiSession,
            new SpellTravelRequestDto
            {
                CardId = "magnetic_force",
                DestinationType = "player",
                TargetId = itachiSnap.PlayerId,
            },
            40_000
        );
        Assert.True(mag.Success);
        Assert.Equal(itachiSnap.PlayerId, mag.TravelEvent!.TargetPlayerId);
        Assert.Equal(prevItachiX, itachiSnap.X);
        Assert.Equal(prevItachiZ, itachiSnap.Z);
        harness.CardTravel.CompleteTravel(harness.World, mag.TravelEvent.EventId);

        // 4. Accompany only includes companions who accepted invite
        var invite = harness.CardTravel.CreateAccompanyInvite(harness.World, kaiSnap.PlayerId, "Starting Plaza", 60_000)!;
        harness.CardTravel.RespondToAccompanyInvite(invite.InviteId, itachiSnap.PlayerId, true, 60_100);
        var accompany = harness.CardTravel.TryStartTravel(
            harness.World,
            kaiSession,
            new SpellTravelRequestDto
            {
                CardId = "accompany",
                DestinationType = "town",
                TargetId = "starting_plaza",
                CompanionPlayerIds = [itachiSnap.PlayerId, "uninvited-fake-id"],
            },
            60_200
        );
        Assert.True(accompany.Success);
        Assert.Equal(2, accompany.TravelEvent!.ParticipantPlayerIds.Length);
        Assert.Contains(kaiSnap.PlayerId, accompany.TravelEvent.ParticipantPlayerIds);
        Assert.Contains(itachiSnap.PlayerId, accompany.TravelEvent.ParticipantPlayerIds);
        harness.CardTravel.CompleteTravel(harness.World, accompany.TravelEvent.EventId);

        // 5. Summon Random Weapon selects from pool and updates player snapshot
        var ws = harness.CardTravel.TrySummonRandomWeapon(harness.World, itachiSession, 80_000);
        Assert.True(ws.Success);
        Assert.Contains(ws.SummonEvent!.WeaponType, CardTravelManager.RandomWeaponPool);
        Assert.True(itachiSnap.HasWeapon);
        Assert.Equal(ws.SummonEvent.WeaponType, itachiSnap.WeaponType);
    }

    private sealed class HubTestHarness
    {
        public PlayerSessionManager Sessions { get; } = new();
        public WorldManager World { get; } = new();
        public GameStateManager GameState { get; } = new();
        public CombatManager Combat { get; } = new();
        public DestinationRegistry Destinations { get; } = new();
        public PlayerEncounterService Encounters { get; }
        public CardTravelManager CardTravel { get; }

        public HubTestHarness()
        {
            Encounters = new PlayerEncounterService(Destinations);
            CardTravel = new CardTravelManager(Destinations, Encounters);
        }
        private readonly ConcurrentDictionary<string, HashSet<string>> _groups = new();
        private readonly ConcurrentDictionary<string, List<(string Method, object? Arg)>> _events = new();
        private readonly object _groupLock = new();

        public async Task<(GameHub Hub, WorldEnterResult Result)> EnterAsync(string connId, string name)
        {
            var hub = CreateHub(connId);
            var res = await hub.EnterWorld(name);
            return (hub, res);
        }

        public async Task<WorldEnterResult> ReconnectAsync(string connId, string playerId, string token, string name)
        {
            var hub = CreateHub(connId);
            return await hub.ReconnectWorld(playerId, token, name);
        }

        public async Task DisconnectAsync(string connId)
        {
            var hub = CreateHub(connId);
            await hub.OnDisconnectedAsync(null);
        }

        public List<object?> GetEvents(string connId, string method) =>
            _events.TryGetValue(connId, out var list)
                ? list.Where(e => e.Method == method).Select(e => e.Arg).ToList()
                : [];

        private GameHub CreateHub(string connId)
        {
            var hubCtx = new FakeHubContext(this);
            var hub = new GameHub(
                Sessions,
                World,
                GameState,
                Combat,
                Destinations,
                Encounters,
                CardTravel,
                hubCtx,
                NullLogger<GameHub>.Instance
            )
            {
                Context = new FakeHubCallerContext(connId),
                Groups = new FakeGroupManager(this),
                Clients = new FakeHubCallerClients(this, connId),
            };
            return hub;
        }

        private void AddToGroup(string connId, string group)
        {
            lock (_groupLock)
            {
                var set = _groups.GetOrAdd(group, _ => new HashSet<string>());
                set.Add(connId);
            }
        }

        private void RemoveFromGroup(string connId, string group)
        {
            lock (_groupLock)
            {
                if (_groups.TryGetValue(group, out var set))
                    set.Remove(connId);
            }
        }

        private void SendToGroup(string group, string? excludeConnId, string method, object?[] args)
        {
            List<string> targets;
            lock (_groupLock)
            {
                targets = _groups.TryGetValue(group, out var set)
                    ? set.Where(id => id != excludeConnId).ToList()
                    : [];
            }
            var payload = args.Length > 0 ? args[0] : null;
            foreach (var t in targets)
            {
                var list = _events.GetOrAdd(t, _ => []);
                lock (list) list.Add((method, payload));
            }
        }

        private sealed class FakeGroupManager(HubTestHarness owner) : IGroupManager
        {
            public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
            {
                owner.AddToGroup(connectionId, groupName);
                return Task.CompletedTask;
            }
            public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default)
            {
                owner.RemoveFromGroup(connectionId, groupName);
                return Task.CompletedTask;
            }
        }

        private sealed class FakeClientProxy(HubTestHarness owner, string group, string? exclude) : IClientProxy
        {
            public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
            {
                owner.SendToGroup(group, exclude, method, args);
                return Task.CompletedTask;
            }
        }

        private sealed class FakeHubCallerClients(HubTestHarness owner, string connId) : IHubCallerClients, IHubClients
        {
            public IClientProxy All => throw new NotImplementedException();
            public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => throw new NotImplementedException();
            public IClientProxy Caller => throw new NotImplementedException();
            public IClientProxy Client(string connectionId) => throw new NotImplementedException();
            public IClientProxy Clients(IReadOnlyList<string> connectionIds) => throw new NotImplementedException();
            public IClientProxy Group(string groupName) => new FakeClientProxy(owner, groupName, null);
            public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => throw new NotImplementedException();
            public IClientProxy Groups(IReadOnlyList<string> groupNames) => throw new NotImplementedException();
            public IClientProxy Others => throw new NotImplementedException();
            public IClientProxy OthersInGroup(string groupName) => new FakeClientProxy(owner, groupName, connId);
            public IClientProxy User(string userId) => throw new NotImplementedException();
            public IClientProxy Users(IReadOnlyList<string> userIds) => throw new NotImplementedException();
        }

        private sealed class FakeHubContext(HubTestHarness owner) : IHubContext<GameHub>
        {
            public IHubClients Clients => new FakeHubCallerClients(owner, string.Empty);
            public IGroupManager Groups => new FakeGroupManager(owner);
        }

        private sealed class FakeHubCallerContext(string connId) : HubCallerContext
        {
            public override string ConnectionId => connId;
            public override string? UserIdentifier => null;
            public override ClaimsPrincipal? User => null;
            public override IDictionary<object, object?> Items { get; } = new Dictionary<object, object?>();
            public override IFeatureCollection Features { get; } = new FeatureCollection();
            public override CancellationToken ConnectionAborted => CancellationToken.None;
            public override void Abort() { }
        }
    }
}
