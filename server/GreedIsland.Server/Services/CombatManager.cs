using GreedIsland.Server.Models;

namespace GreedIsland.Server.Services;

/// <summary>
/// Server-authoritative PvP combat resolver.
/// Validates weapon state, cooldowns, range, facing direction, and alive state,
/// and computes damage on the server without trusting client damage values.
/// </summary>
public sealed class CombatManager
{
    public const int RespawnDelaySeconds = 5;
    private const long MinAttackCooldownMs = 300;

    private static readonly Dictionary<int, (int Damage, double Reach, bool Is360)> ComboSpecs = new()
    {
        [1] = (22, 5.4, false),
        [2] = (26, 5.6, false),
        [3] = (32, 6.0, true),
        [4] = (52, 6.4, false),
    };

    public sealed record AttackResolution(
        bool Success,
        string? Error,
        PlayerDamagedDto? Damaged,
        PlayerDiedDto? Died);

    public AttackResolution TryResolveAttack(
        WorldManager world,
        PlayerSession attackerSession,
        AttackRequestDto request,
        long nowMs)
    {
        if (string.IsNullOrWhiteSpace(request.TargetPlayerId) ||
            request.TargetPlayerId == attackerSession.PlayerId)
        {
            return new AttackResolution(false, "Invalid target.", null, null);
        }

        if (!ComboSpecs.TryGetValue(request.ComboStep, out var spec))
        {
            return new AttackResolution(false, "Invalid combo step.", null, null);
        }

        if (attackerSession.LastAttackAcceptedMs > 0 &&
            nowMs - attackerSession.LastAttackAcceptedMs < MinAttackCooldownMs)
        {
            return new AttackResolution(false, "Attack on cooldown.", null, null);
        }

        lock (world.SyncRoot)
        {
            var attacker = world.GetPlayer(attackerSession.PlayerId);
            var target = world.GetPlayer(request.TargetPlayerId);

            if (attacker is null || target is null)
            {
                return new AttackResolution(false, "Player not in world.", null, null);
            }

            if (!attacker.IsAlive)
            {
                return new AttackResolution(false, "Dead players cannot attack.", null, null);
            }

            if (!attacker.HasWeapon)
            {
                return new AttackResolution(false, "Weapon must be summoned to attack.", null, null);
            }

            if (!target.IsAlive)
            {
                return new AttackResolution(false, "Target is already defeated.", null, null);
            }

            var dx = target.X - attacker.X;
            var dy = target.Y - attacker.Y;
            var dz = target.Z - attacker.Z;
            var distXZ = Math.Sqrt(dx * dx + dz * dz);

            if (distXZ > spec.Reach || Math.Abs(dy) > 3.8)
            {
                return new AttackResolution(false, "Target out of range.", null, null);
            }

            if (!spec.Is360 && distXZ > 1.5)
            {
                var fwdX = Math.Sin(attacker.Yaw);
                var fwdZ = Math.Cos(attacker.Yaw);
                var dot = (dx * fwdX + dz * fwdZ) / distXZ;
                if (dot < -0.15)
                {
                    return new AttackResolution(false, "Target is behind attacker.", null, null);
                }
            }

            attackerSession.LastAttackAcceptedMs = nowMs;
            target.CurrentHealth = Math.Max(0, target.CurrentHealth - spec.Damage);

            PlayerDiedDto? died = null;
            if (target.CurrentHealth <= 0)
            {
                target.IsAlive = false;
                died = new PlayerDiedDto
                {
                    PlayerId = target.PlayerId,
                    KillerPlayerId = attacker.PlayerId,
                    RespawnDelaySeconds = RespawnDelaySeconds,
                };
            }

            var damaged = new PlayerDamagedDto
            {
                AttackerPlayerId = attacker.PlayerId,
                TargetPlayerId = target.PlayerId,
                Damage = spec.Damage,
                CurrentHealth = target.CurrentHealth,
                MaxHealth = target.MaxHealth,
                IsAlive = target.IsAlive,
                ComboStep = request.ComboStep,
            };

            return new AttackResolution(true, null, damaged, died);
        }
    }

    public PlayerSnapshot? RespawnPlayer(WorldManager world, string playerId)
    {
        lock (world.SyncRoot)
        {
            var player = world.GetPlayer(playerId);
            if (player is null) return null;

            var spawn = world.NextPlazaSpawn();
            player.X = spawn.X;
            player.Y = spawn.Y;
            player.Z = spawn.Z;
            player.Yaw = spawn.Yaw;
            player.CurrentHealth = player.MaxHealth;
            player.IsAlive = true;
            player.LocomotionState = "Idle";
            player.HorizSpeed = 0;
            player.TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            return player;
        }
    }
}
