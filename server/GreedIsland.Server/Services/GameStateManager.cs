using GreedIsland.Server.Models;

namespace GreedIsland.Server.Services;

/// <summary>
/// Prototype-level server movement validator.
/// Rejects malformed coordinates, invalid locomotion states, excessive update rates,
/// and impossible speed/teleport jumps while keeping client-predicted movement responsive.
/// </summary>
public sealed class GameStateManager
{
    private const double IslandMaxRadius = 136.0;
    private const double MaxHorizSpeed = 32.0;
    public const long MinMovementIntervalMs = 30;

    private static readonly HashSet<string> ValidLocomotionStates = new(StringComparer.Ordinal)
    {
        "Idle",
        "StartMoving",
        "StopMoving",
        "Walk",
        "Jog",
        "Sprint",
        "WalkBackward",
        "StrafeLeft",
        "StrafeRight",
        "JumpStart",
        "JumpLoop",
        "Fall",
        "Land",
        "CombatIdle",
        "Attack",
        "Attack1",
        "Attack2",
        "Attack3",
        "Attack4",
        "Block",
        "Dodge",
        "HitReaction",
        "Death",
        "FlightTakeoff",
        "FlightHover",
        "FlightForward",
        "FlightAscend",
        "FlightDescend",
        "FlightLand",
    };

    public static bool IsValidLocomotionState(string? state) =>
        !string.IsNullOrWhiteSpace(state) && ValidLocomotionStates.Contains(state);

    public bool TryApplyMovement(
        WorldManager world,
        PlayerSession session,
        MovementInputDto input,
        long nowMs,
        out PlayerSnapshot? updatedSnapshot)
    {
        updatedSnapshot = null;

        if (session.LastMovementAcceptedMs > 0 &&
            nowMs - session.LastMovementAcceptedMs < MinMovementIntervalMs)
        {
            return false;
        }

        if (!double.IsFinite(input.X) ||
            !double.IsFinite(input.Y) ||
            !double.IsFinite(input.Z) ||
            !double.IsFinite(input.Yaw) ||
            !double.IsFinite(input.HorizSpeed))
        {
            return false;
        }

        if (input.HorizSpeed < 0 || input.HorizSpeed > MaxHorizSpeed)
        {
            return false;
        }

        if (!IsValidLocomotionState(input.LocomotionState))
        {
            return false;
        }

        if (double.Hypot(input.X, input.Z) > IslandMaxRadius || input.Y < -10.0 || input.Y > 105.0)
        {
            return false;
        }

        lock (world.SyncRoot)
        {
            var current = world.GetPlayer(session.PlayerId);
            if (current is null)
            {
                return false;
            }

            if (!current.IsAlive)
            {
                return false;
            }

            var elapsedSec = Math.Max(0.05, (nowMs - current.TimestampMs) / 1000.0);
            var maxAllowedSpeed = input.IsFlying ? 30.0 : 18.0;
            var maxStepDistance = Math.Max(10.0, maxAllowedSpeed * elapsedSec * 1.85);

            var stepDist = Math.Sqrt(
                Math.Pow(input.X - current.X, 2) +
                Math.Pow(input.Y - current.Y, 2) +
                Math.Pow(input.Z - current.Z, 2)
            );
            if (stepDist > maxStepDistance)
            {
                return false;
            }

            session.LastMovementAcceptedMs = nowMs;
            current.X = input.X;
            current.Y = input.Y;
            current.Z = input.Z;
            current.Yaw = input.Yaw;
            current.LocomotionState = input.LocomotionState;
            current.HorizSpeed = input.HorizSpeed;
            current.IsFlying = input.IsFlying;
            current.HasWeapon = input.HasWeapon;
            current.IsInvisible = input.IsInvisible;
            current.ComboStep = Math.Clamp(input.ComboStep, 0, 4);
            current.TimestampMs = nowMs;

            updatedSnapshot = current;
            return true;
        }
    }
}
