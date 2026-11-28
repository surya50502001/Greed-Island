using GreedIsland.Server.Models;

namespace GreedIsland.Server.Services;

public sealed class GameStateManager
{
    private const double IslandMaxRadius = 136.0;
    private const double MaxStepDistance = 35.0;

    public bool TryApplyMovement(
        GameRoom room,
        string playerId,
        MovementInputDto input,
        out PlayerSnapshot? updatedSnapshot)
    {
        updatedSnapshot = null;

        if (!double.IsFinite(input.X) || !double.IsFinite(input.Y) || !double.IsFinite(input.Z) || !double.IsFinite(input.Yaw))
        {
            return false;
        }

        if (double.Hypot(input.X, input.Z) > IslandMaxRadius || input.Y < -10.0 || input.Y > 105.0)
        {
            return false;
        }

        lock (room.SyncRoot)
        {
            if (!room.Players.TryGetValue(playerId, out var current))
            {
                return false;
            }

            var stepDist = Math.Sqrt(
                Math.Pow(input.X - current.X, 2) +
                Math.Pow(input.Y - current.Y, 2) +
                Math.Pow(input.Z - current.Z, 2)
            );
            if (stepDist > MaxStepDistance)
            {
                return false;
            }

            current.X = input.X;
            current.Y = input.Y;
            current.Z = input.Z;
            current.Yaw = input.Yaw;
            current.LocomotionState = string.IsNullOrWhiteSpace(input.LocomotionState)
                ? "Idle"
                : input.LocomotionState;
            current.HorizSpeed = double.IsFinite(input.HorizSpeed) ? input.HorizSpeed : 0;
            current.IsFlying = input.IsFlying;
            current.HasWeapon = input.HasWeapon;
            current.IsInvisible = input.IsInvisible;
            current.TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            updatedSnapshot = current;
            return true;
        }
    }
}
